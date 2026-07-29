import "server-only";
import {
  validateExperimentDefinition,
  validateExperimentResultEnvelope,
  type InvestingResearchScientificScope,
  type VersionedReference,
} from "../contracts";
import {runScientificValidation} from "./engine.server";
import type {ScientificValidationRepository} from "./repository.server";
import {
  SCIENTIFIC_VALIDATION_INPUT_VERSION,SCIENTIFIC_VALIDATION_REQUEST_VERSION,
  type ScientificValidationProfile,
} from "./types";
import type {ScientificValidationEvidencePort} from "./evidenceCollector.server";

type Operation="create_report"|"create_decision"|"get_report"|"list_reports"
  |"get_decision"|"list_decisions";
type Authorization=Readonly<{authenticatedUserId:string;membershipId:string;
  scope:InvestingResearchScientificScope}>;
export interface ScientificValidationAuthorizationPort{
  authorize(operation:Operation):Promise<
    Readonly<{ok:true;value:Authorization}>|Readonly<{ok:false;reason:string}>>;
}
export interface ScientificValidationProfilePort{
  load(reference:VersionedReference):Promise<ScientificValidationProfile|null>;
}
const plain=(value:unknown):value is Record<string,unknown>=>{
  if(typeof value!=="object"||value===null||Array.isArray(value)
    ||Object.getPrototypeOf(value)!==Object.prototype)return false;
  const descriptors=Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(value).every(key=>typeof key==="string"
    &&descriptors[key]?.enumerable===true&&!descriptors[key]?.get&&!descriptors[key]?.set);
};
const same=(a:Authorization,b:Authorization)=>a.authenticatedUserId===b.authenticatedUserId
  &&a.membershipId===b.membershipId&&a.scope.tenantId===b.scope.tenantId
  &&a.scope.ownerId===b.scope.ownerId&&a.scope.portfolioId===b.scope.portfolioId
  &&a.scope.accountId===b.scope.accountId;
const id=(value:unknown):value is string=>typeof value==="string"
  &&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u.test(value);

export class ScientificValidationService{
  constructor(private readonly repository:ScientificValidationRepository,
    private readonly authorization:ScientificValidationAuthorizationPort,
    private readonly profiles:ScientificValidationProfilePort,
    private readonly evidence:ScientificValidationEvidencePort,
    private readonly emit:(event:Readonly<Record<string,unknown>>)=>Promise<void>){}
  async validate(input:unknown){
    const reportAccess=await this.authorization.authorize("create_report");
    if(!reportAccess.ok)return reportAccess;
    const decisionAccess=await this.authorization.authorize("create_decision");
    if(!decisionAccess.ok||!same(reportAccess.value,decisionAccess.value)){
      return {ok:false as const,reason:"scientific_validation_scope_not_authorized"};
    }
    if(!plain(input)||Reflect.ownKeys(input).length!==5
      ||!["experiment","result","evaluatedAt","evaluatedBy","contractVersion"]
        .every(key=>Object.prototype.hasOwnProperty.call(input,key))){
      return {ok:false as const,reason:"scientific_validation_input_invalid"};
    }
    if(input.contractVersion!==SCIENTIFIC_VALIDATION_REQUEST_VERSION){
      return {ok:false as const,reason:"scientific_validation_input_invalid"};
    }
    const experiment=validateExperimentDefinition(input.experiment);
    const result=validateExperimentResultEnvelope(input.result);
    if(!experiment.ok||!result.ok){
      return {ok:false as const,reason:"scientific_validation_input_invalid"};
    }
    const requestedScope=experiment.value.scope;
    if(requestedScope.authenticatedUserId!==reportAccess.value.authenticatedUserId
      ||requestedScope.membershipId!==reportAccess.value.membershipId
      ||requestedScope.tenantId!==reportAccess.value.scope.tenantId
      ||requestedScope.ownerId!==reportAccess.value.scope.ownerId
      ||requestedScope.portfolioId!==reportAccess.value.scope.portfolioId
      ||requestedScope.accountId!==reportAccess.value.scope.accountId){
      return {ok:false as const,reason:"scientific_validation_scope_mismatch"};
    }
    const profile=await this.profiles.load(experiment.value.validationProfile);
    if(profile===null)return {ok:false as const,reason:"scientific_validation_profile_unavailable"};
    const collected=await this.evidence.collect({
      experiment:experiment.value,result:result.value,profile});
    if(!collected.ok)return collected;
    const evaluated=runScientificValidation({
      contractVersion:SCIENTIFIC_VALIDATION_INPUT_VERSION,
      experiment:experiment.value,result:result.value,profile,
      windows:collected.value.windows,
      hypothesisPValue:collected.value.hypothesisPValue,
      robustnessPasses:collected.value.robustnessPasses,
      robustnessTrials:collected.value.robustnessTrials,evaluatedAt:input.evaluatedAt,
      evaluatedBy:input.evaluatedBy,
    });
    if(!evaluated.ok)return evaluated;
    const scope=evaluated.value.report.scope;
    if(scope.tenantId!==reportAccess.value.scope.tenantId
      ||scope.ownerId!==reportAccess.value.scope.ownerId
      ||scope.portfolioId!==reportAccess.value.scope.portfolioId
      ||scope.accountId!==reportAccess.value.scope.accountId){
      return {ok:false as const,reason:"scientific_validation_scope_mismatch"};
    }
    try{
      const stored=await this.repository.persist({
        scope:reportAccess.value.scope,...evaluated.value,
      });
      await this.emit({type:stored.reused?"scientific_validation_reused"
        :"scientific_validation_finalized",reportId:stored.report.reportId,
        decisionId:stored.decision.decisionId,outcome:stored.decision.outcome,
        occurredAt:stored.decision.decidedAt});
      return {ok:true as const,value:stored};
    }catch{return {ok:false as const,reason:"scientific_validation_persistence_failed"};}
  }
  async getReport(value:unknown){
    const access=await this.authorization.authorize("get_report");
    if(!access.ok)return access;
    if(!id(value))return {ok:false as const,reason:"scientific_validation_not_found"};
    const report=await this.repository.getReport(access.value.scope,value);
    return report?{ok:true as const,value:report}
      :{ok:false as const,reason:"scientific_validation_not_found"};
  }
  async getDecision(value:unknown){
    const access=await this.authorization.authorize("get_decision");
    if(!access.ok)return access;
    if(!id(value))return {ok:false as const,reason:"scientific_validation_not_found"};
    const decision=await this.repository.getDecision(access.value.scope,value);
    return decision?{ok:true as const,value:decision}
      :{ok:false as const,reason:"scientific_validation_not_found"};
  }
  async listReports(){
    const access=await this.authorization.authorize("list_reports");
    return access.ok?{ok:true as const,
      value:await this.repository.listReports(access.value.scope)}:access;
  }
  async listDecisions(){
    const access=await this.authorization.authorize("list_decisions");
    return access.ok?{ok:true as const,
      value:await this.repository.listDecisions(access.value.scope)}:access;
  }
}
