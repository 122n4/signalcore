import "server-only";
import {canonicalizeResearchContract,type InvestingResearchScientificScope} from "../contracts";
import {evaluatePromotionEligibility} from "./engine.server";
import {prepareControlledPromotion,revokeControlledPromotion} from "./preparation.server";
import type {ControlledPromotionRepository} from "./repository.server";
import {PROMOTION_ELIGIBILITY_INPUT_VERSION,
 PROMOTION_ELIGIBILITY_REQUEST_VERSION,type ControlledPromotionProfile} from "./types";
type Access=Readonly<{authenticatedUserId:string;membershipId:string;
 scope:InvestingResearchScientificScope}>;
export interface ControlledPromotionAuthorizationPort{authorize(operation:
 "evaluate"|"prepare"|"revoke"|"get"|"list"):Promise<Readonly<{ok:true;value:Access}>
 |Readonly<{ok:false;reason:string}>>}
export interface ControlledPromotionProfilePort{load(input:Readonly<{
 scope:InvestingResearchScientificScope;decisionId:string}>):
 Promise<ControlledPromotionProfile|null>}
const plain=(v:unknown):v is Record<string,unknown>=>{if(typeof v!=="object"||v===null
 ||Array.isArray(v)||Object.getPrototypeOf(v)!==Object.prototype)return false;
 const d=Object.getOwnPropertyDescriptors(v);return Reflect.ownKeys(v).every(k=>
 typeof k==="string"&&d[k]?.enumerable&&!d[k]?.get&&!d[k]?.set)};
const id=(v:unknown):v is string=>typeof v==="string"
 &&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u.test(v);
const time=(v:unknown):v is string=>typeof v==="string"&&Number.isFinite(Date.parse(v))
 &&new Date(v).toISOString()===v;
const same=(a:unknown,b:unknown)=>{const x=canonicalizeResearchContract(a);
 const y=canonicalizeResearchContract(b);return x.ok&&y.ok&&x.value===y.value};
export class ControlledPromotionService{
 constructor(private readonly repository:ControlledPromotionRepository,
  private readonly authorization:ControlledPromotionAuthorizationPort,
  private readonly profiles:ControlledPromotionProfilePort,
  private readonly emit:(event:Readonly<Record<string,unknown>>)=>Promise<void>){}
 async evaluate(input:unknown){
  const access=await this.authorization.authorize("evaluate");if(!access.ok)return access;
  if(!plain(input)||Reflect.ownKeys(input).length!==6
   ||!["contractVersion","decisionId","riskAssessmentId","memoryEventId",
    "evaluatedAt","evaluatedBy"].every(k=>Object.hasOwn(input,k))
   ||input.contractVersion!==PROMOTION_ELIGIBILITY_REQUEST_VERSION
   ||!id(input.decisionId)||!id(input.riskAssessmentId)||!id(input.memoryEventId)
   ||!time(input.evaluatedAt)||!plain(input.evaluatedBy)
   ||Reflect.ownKeys(input.evaluatedBy).length!==2||!id(input.evaluatedBy.id)
   ||!id(input.evaluatedBy.version))
   return {ok:false as const,reason:"promotion_eligibility_request_invalid"};
  try{
   const [decision,risk,memory]=await Promise.all([
    this.repository.getDecision(access.value.scope,input.decisionId),
    this.repository.getRisk(access.value.scope,input.riskAssessmentId),
    this.repository.getMemory(access.value.scope,input.memoryEventId)]);
   if(!decision||!risk||!memory)
    return {ok:false as const,reason:"promotion_evidence_not_found"};
   if(decision.scope.authenticatedUserId!==access.value.authenticatedUserId
    ||decision.scope.membershipId!==access.value.membershipId
    ||![decision.scientificScope,risk.scientificScope,memory.scientificScope]
     .every(s=>s.tenantId===access.value.scope.tenantId
      &&s.ownerId===access.value.scope.ownerId&&s.portfolioId===access.value.scope.portfolioId
      &&s.accountId===access.value.scope.accountId))
    return {ok:false as const,reason:"promotion_scope_mismatch"};
   const profile=await this.profiles.load({scope:access.value.scope,
    decisionId:decision.decisionId});
   if(!profile)return {ok:false as const,reason:"promotion_profile_unavailable"};
   const evaluated=evaluatePromotionEligibility({contractVersion:
    PROMOTION_ELIGIBILITY_INPUT_VERSION,decision,riskAssessment:risk,memoryEvent:memory,
    profile,evaluatedAt:input.evaluatedAt,evaluatedBy:input.evaluatedBy});
   if(!evaluated.ok)return evaluated;
   const stored=await this.repository.persistEligibility(access.value.scope,evaluated.value);
   await this.emit({type:stored.reused?"promotion_eligibility_reused":
    "promotion_eligibility_created",eligibilityId:stored.value.eligibility.eligibilityId,
    occurredAt:stored.value.eligibility.evaluatedAt});
   return {ok:true as const,value:stored};
  }catch{return {ok:false as const,reason:"promotion_eligibility_persistence_failed"};}
 }
 async prepare(input:unknown){
  const access=await this.authorization.authorize("prepare");if(!access.ok)return access;
  const prepared=prepareControlledPromotion(input);if(!prepared.ok)return prepared;
  const record=prepared.value;
  if(record.scope.authenticatedUserId!==access.value.authenticatedUserId
   ||record.scope.membershipId!==access.value.membershipId
   ||record.scientificScope.tenantId!==access.value.scope.tenantId
   ||record.scientificScope.ownerId!==access.value.scope.ownerId
   ||record.scientificScope.portfolioId!==access.value.scope.portfolioId
   ||record.scientificScope.accountId!==access.value.scope.accountId)
   return {ok:false as const,reason:"promotion_scope_mismatch"};
  try{
   const eligibility=await this.repository.getEligibility(access.value.scope,
    record.eligibilityId);
   if(!eligibility||!same(eligibility.eligibility,
    record.candidateEnvelope.promotionEligibility)
    ||eligibility.riskAssessmentId!==record.riskAssessmentId
    ||eligibility.memoryEventId!==record.memoryEventId
    ||record.candidateEnvelope.riskCapacityReferences.length!==1
    ||record.candidateEnvelope.riskCapacityReferences[0]?.id!==eligibility.riskAssessmentId
    ||record.candidateEnvelope.riskCapacityReferences[0]?.version!==
      eligibility.riskAssessmentHash)
    return {ok:false as const,reason:"promotion_evidence_chain_mismatch"};
   const stored=await this.repository.persistRequest(access.value.scope,record);
   const revocation=await this.repository.getRevocation(
    access.value.scope,stored.value.requestId);
   if(revocation)return {ok:false as const,reason:"promotion_request_revoked"};
   await this.emit({type:stored.reused?"promotion_request_reused":
    "promotion_request_prepared",requestId:stored.value.requestId,
    target:stored.value.target,occurredAt:stored.value.preparedAt});
   return {ok:true as const,value:stored};
  }catch{return {ok:false as const,reason:"promotion_request_persistence_failed"};}
 }
 async revoke(input:unknown){
  const access=await this.authorization.authorize("revoke");if(!access.ok)return access;
  if(!plain(input)||Reflect.ownKeys(input).length!==4||!Object.hasOwn(input,"requestId")
   ||!Object.hasOwn(input,"reasonCode")||!Object.hasOwn(input,"revokedAt")
   ||!Object.hasOwn(input,"revokedBy")||!id(input.requestId)
   ||!["scientific_evidence_invalidated","risk_capacity_invalidated",
    "dataset_invalidated","operator_revoked"].includes(String(input.reasonCode))
   ||!time(input.revokedAt)||!plain(input.revokedBy)
   ||Reflect.ownKeys(input.revokedBy).length!==2||!id(input.revokedBy.id)
   ||!id(input.revokedBy.version))
   return {ok:false as const,reason:"promotion_revocation_invalid"};
  try{const request=await this.repository.getRequest(access.value.scope,input.requestId);
   if(!request)return {ok:false as const,reason:"promotion_request_not_found"};
   const revoked=revokeControlledPromotion({request,reasonCode:input.reasonCode,
    revokedAt:input.revokedAt,revokedBy:input.revokedBy});
   if(!revoked.ok)return revoked;
   const stored=await this.repository.persistRevocation(access.value.scope,revoked.value);
   await this.emit({type:stored.reused?"promotion_revocation_reused":
    "promotion_revoked",requestId:request.requestId,
    occurredAt:stored.value.revokedAt});
   return {ok:true as const,value:stored};
  }catch{return {ok:false as const,reason:"promotion_revocation_persistence_failed"};}
 }
 async get(value:unknown){const a=await this.authorization.authorize("get");if(!a.ok)return a;
  if(!id(value))return {ok:false as const,reason:"promotion_request_not_found"};
  try{const request=await this.repository.getRequest(a.value.scope,value);
   const revocation=request?await this.repository.getRevocation(a.value.scope,value):null;
   return request?{ok:true as const,value:{request,revocation,
    effectiveState:revocation?"promotion_revoked"as const:"promotion_prepared"as const}}:
    {ok:false as const,reason:"promotion_request_not_found"};}
  catch{return {ok:false as const,reason:"promotion_record_integrity_failed"};}}
 async list(){const a=await this.authorization.authorize("list");if(!a.ok)return a;
  try{const requests=await this.repository.list(a.value.scope);
   const values=await Promise.all(requests.map(async request=>{
    const revocation=await this.repository.getRevocation(a.value.scope,request.requestId);
    return {request,revocation,effectiveState:revocation?
     "promotion_revoked"as const:"promotion_prepared"as const};
   }));
   return {ok:true as const,value:values};}
  catch{return {ok:false as const,reason:"promotion_record_integrity_failed"};}}
}
