import "server-only";
import type {
  InvestingResearchScientificScope,
} from "../contracts";
import {assessPortfolioRisk} from "./engine.server";
import type {PortfolioRiskRepository} from "./repository.server";
import {
  PORTFOLIO_RISK_INPUT_VERSION,PORTFOLIO_RISK_REQUEST_VERSION,
  type PortfolioRiskEvidence,type PortfolioRiskProfile,
} from "./types";

type Access=Readonly<{authenticatedUserId:string;membershipId:string;
  scope:InvestingResearchScientificScope}>;
export interface PortfolioRiskAuthorizationPort{
  authorize(operation:"create"|"get"|"list"):Promise<
    Readonly<{ok:true;value:Access}>|Readonly<{ok:false;reason:string}>>;
}
export interface PortfolioRiskProfilePort{
  load(input:Readonly<{scope:InvestingResearchScientificScope;
    decisionIds:readonly string[]}>):Promise<PortfolioRiskProfile|null>;
}
export interface PortfolioRiskEvidencePort{
  collect(input:Readonly<{decisions:readonly NonNullable<Awaited<ReturnType<
    PortfolioRiskRepository["getDecision"]>>>[];scope:InvestingResearchScientificScope;
    profile:PortfolioRiskProfile}>):
    Promise<Readonly<{ok:true;value:PortfolioRiskEvidence}>
      |Readonly<{ok:false;reason:string}>>;
}
const plain=(value:unknown):value is Record<string,unknown>=>{
  if(typeof value!=="object"||value===null||Array.isArray(value)
    ||Object.getPrototypeOf(value)!==Object.prototype)return false;
  const descriptors=Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(value).every(key=>typeof key==="string"
    &&descriptors[key]?.enumerable===true&&!descriptors[key]?.get&&!descriptors[key]?.set);
};
const id=(value:unknown):value is string=>typeof value==="string"
  &&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u.test(value);
const timestamp=(value:unknown):value is string=>typeof value==="string"
  &&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;

export class PortfolioRiskService{
  constructor(private readonly repository:PortfolioRiskRepository,
    private readonly authorization:PortfolioRiskAuthorizationPort,
    private readonly profiles:PortfolioRiskProfilePort,
    private readonly evidence:PortfolioRiskEvidencePort,
    private readonly emit:(event:Readonly<Record<string,unknown>>)=>Promise<void>){}
  async assess(input:unknown){
    const access=await this.authorization.authorize("create");
    if(!access.ok)return access;
    if(!plain(input)||Reflect.ownKeys(input).length!==4
      ||!["contractVersion","decisionIds","evaluatedAt","evaluatedBy"]
        .every(key=>Object.prototype.hasOwnProperty.call(input,key))
      ||input.contractVersion!==PORTFOLIO_RISK_REQUEST_VERSION
      ||!Array.isArray(input.decisionIds)||input.decisionIds.length===0
      ||input.decisionIds.some(item=>!id(item))
      ||new Set(input.decisionIds).size!==input.decisionIds.length
      ||!timestamp(input.evaluatedAt)||!plain(input.evaluatedBy)
      ||Reflect.ownKeys(input.evaluatedBy).length!==2
      ||!Object.hasOwn(input.evaluatedBy,"id")
      ||!Object.hasOwn(input.evaluatedBy,"version")
      ||!id(input.evaluatedBy.id)||!id(input.evaluatedBy.version)){
      return {ok:false as const,reason:"portfolio_risk_request_invalid"};
    }
    const loaded=await Promise.all(input.decisionIds.map(item=>
      this.repository.getDecision(access.value.scope,item)));
    if(loaded.some(item=>!item||item.outcome!=="validated")){
      return {ok:false as const,reason:"portfolio_risk_decision_not_validated"};
    }
    const decisions=loaded as NonNullable<(typeof loaded)[number]>[];
    if(decisions.some(decision=>
      decision.scope.authenticatedUserId!==access.value.authenticatedUserId
      ||decision.scope.membershipId!==access.value.membershipId
      ||decision.scientificScope.tenantId!==access.value.scope.tenantId
      ||decision.scientificScope.ownerId!==access.value.scope.ownerId
      ||decision.scientificScope.portfolioId!==access.value.scope.portfolioId
      ||decision.scientificScope.accountId!==access.value.scope.accountId)){
      return {ok:false as const,reason:"portfolio_risk_scope_mismatch"};
    }
    const profile=await this.profiles.load({scope:access.value.scope,
      decisionIds:decisions.map(item=>item.decisionId)});
    if(!profile)return {ok:false as const,reason:"portfolio_risk_profile_unavailable"};
    const evidence=await this.evidence.collect({decisions,scope:access.value.scope,profile});
    if(!evidence.ok)return evidence;
    const assessed=assessPortfolioRisk({contractVersion:PORTFOLIO_RISK_INPUT_VERSION,
      decisions,profile,evidence:evidence.value,evaluatedAt:input.evaluatedAt,
      evaluatedBy:input.evaluatedBy});
    if(!assessed.ok)return assessed;
    try{
      const stored=await this.repository.persist(access.value.scope,assessed.value);
      await this.emit({type:stored.reused?"portfolio_risk_assessment_reused"
        :"portfolio_risk_assessment_finalized",
      assessmentId:stored.assessment.assessmentId,outcome:stored.assessment.outcome,
      occurredAt:stored.assessment.evaluatedAt});
      return {ok:true as const,value:stored};
    }catch{return {ok:false as const,reason:"portfolio_risk_persistence_failed"};}
  }
  async get(value:unknown){
    const access=await this.authorization.authorize("get");
    if(!access.ok)return access;
    if(!id(value))return {ok:false as const,reason:"portfolio_risk_not_found"};
    const assessment=await this.repository.get(access.value.scope,value);
    return assessment?{ok:true as const,value:assessment}
      :{ok:false as const,reason:"portfolio_risk_not_found"};
  }
  async list(){
    const access=await this.authorization.authorize("list");
    return access.ok?{ok:true as const,value:await this.repository.list(access.value.scope)}
      :access;
  }
}
