import "server-only";
import {verifyPromotionCandidateForPreparation} from
 "../architecture/promotionBoundary.server";
import {canonicalizeResearchContract,validateInvestingResearchScope} from "../contracts";
import {hashCanonicalResearchMaterial} from "../reproducibility/hashing.server";
import {ARTIFACT_IDENTITY_DOMAIN} from "../reproducibility/versions";
import {CONTROLLED_PROMOTION_RECORD_VERSION,CONTROLLED_PROMOTION_REVOCATION_VERSION,
 type ControlledPromotionRecord,type ControlledPromotionResult,
 type ControlledPromotionRevocation} from "./types";
const plain=(v:unknown):v is Record<string,unknown>=>{if(typeof v!=="object"||v===null
 ||Array.isArray(v)||Object.getPrototypeOf(v)!==Object.prototype)return false;
 const d=Object.getOwnPropertyDescriptors(v);return Reflect.ownKeys(v).every(k=>
 typeof k==="string"&&d[k]?.enumerable&&!d[k]?.get&&!d[k]?.set)};
const exact=(v:Record<string,unknown>,keys:readonly string[])=>
 Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const id=(v:unknown):v is string=>typeof v==="string"
 &&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u.test(v);
const hash=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{64}$/u.test(v);
const time=(v:unknown):v is string=>typeof v==="string"&&Number.isFinite(Date.parse(v))
 &&new Date(v).toISOString()===v;
const ref=(v:unknown)=>plain(v)&&exact(v,["id","version"])&&id(v.id)&&id(v.version);
const same=(a:unknown,b:unknown)=>{const x=canonicalizeResearchContract(a);
 const y=canonicalizeResearchContract(b);return x.ok&&y.ok&&x.value===y.value};
export function controlledPromotionSemanticMaterial(value:ControlledPromotionRecord){
 const candidate={...value.candidateEnvelope} as Record<string,unknown>;
 delete candidate.correlationId;delete candidate.idempotencyKey;
 return {target:value.target,scope:value.scope,scientificScope:value.scientificScope,
  eligibilityId:value.eligibilityId,decisionId:value.decisionId,
  riskAssessmentId:value.riskAssessmentId,memoryEventId:value.memoryEventId,
  candidateId:value.candidateId,candidateVersion:value.candidateVersion,
  experimentId:value.experimentId,runId:value.runId,candidateEnvelope:candidate};
}
export function prepareControlledPromotion(value:unknown):
ControlledPromotionResult<ControlledPromotionRecord>{
 try{
  if(!plain(value)||!exact(value,["candidateEnvelope","riskAssessmentId",
   "memoryEventId","preparedAt","preparedBy"])||!id(value.riskAssessmentId)
   ||!id(value.memoryEventId)||!time(value.preparedAt)||!ref(value.preparedBy))
   return {ok:false,reason:"promotion_request_invalid"};
  const candidate=verifyPromotionCandidateForPreparation(value.candidateEnvelope);
  if("issues"in candidate)return {ok:false,reason:candidate.issues[0]?.reasonCode
   ??"promotion_candidate_invalid"};
  const c=candidate.value;const material={state:"promotion_prepared"as const,
   target:c.requestedTarget,scope:c.scope,scientificScope:c.scientificDecision.scientificScope,
   eligibilityId:c.promotionEligibility.eligibilityId,
   decisionId:c.scientificDecision.decisionId,
   riskAssessmentId:value.riskAssessmentId,memoryEventId:value.memoryEventId,
   candidateId:c.candidate.id,candidateVersion:c.candidate.version,
   experimentId:c.scientificDecision.experimentId,runId:c.scientificDecision.runId,
   idempotencyKey:c.idempotencyKey,candidateEnvelope:c,preparedAt:value.preparedAt,
   preparedBy:{id:(value.preparedBy as Record<string,unknown>).id as string,
    version:(value.preparedBy as Record<string,unknown>).version as string}};
  const h=hashCanonicalResearchMaterial(ARTIFACT_IDENTITY_DOMAIN,material);
  if(!h.ok)return {ok:false,reason:"promotion_request_hash_failed"};
  return {ok:true,value:{contractVersion:CONTROLLED_PROMOTION_RECORD_VERSION,
   requestId:`irpromo_v1_${h.value.digest}`,requestHash:h.value.digest,...material}};
 }catch{return {ok:false,reason:"promotion_request_invalid"};}
}
export function revokeControlledPromotion(value:unknown):
ControlledPromotionResult<ControlledPromotionRevocation>{
 try{
  if(!plain(value)||!exact(value,["request","reasonCode","revokedAt","revokedBy"])
   ||!["scientific_evidence_invalidated","risk_capacity_invalidated",
    "dataset_invalidated","operator_revoked"].includes(String(value.reasonCode))
   ||!time(value.revokedAt)||!ref(value.revokedBy))
   return {ok:false,reason:"promotion_revocation_invalid"};
  const request=validateControlledPromotionRecord(value.request);
  if(!request.ok)return {ok:false,reason:"promotion_revocation_invalid"};
  const material={requestId:request.value.requestId,state:"promotion_revoked"as const,
   scope:request.value.scope,scientificScope:request.value.scientificScope,
   reasonCode:value.reasonCode as ControlledPromotionRevocation["reasonCode"],
   revokedAt:value.revokedAt,revokedBy:{id:(value.revokedBy as Record<string,unknown>).id as string,
    version:(value.revokedBy as Record<string,unknown>).version as string}};
  const h=hashCanonicalResearchMaterial(ARTIFACT_IDENTITY_DOMAIN,material);
  if(!h.ok)return {ok:false,reason:"promotion_revocation_hash_failed"};
  return {ok:true,value:{contractVersion:CONTROLLED_PROMOTION_REVOCATION_VERSION,
   revocationId:`irprev_v1_${h.value.digest}`,revocationHash:h.value.digest,...material}};
 }catch{return {ok:false,reason:"promotion_revocation_invalid"};}
}
export function validateControlledPromotionRecord(value:unknown):
ControlledPromotionResult<ControlledPromotionRecord>{
 try{
  const keys=["contractVersion","requestId","requestHash","state","target","scope",
   "scientificScope","eligibilityId","decisionId","riskAssessmentId","memoryEventId",
   "candidateId","candidateVersion","experimentId","runId","idempotencyKey",
   "candidateEnvelope","preparedAt","preparedBy"];
  if(!plain(value)||!exact(value,keys)
   ||value.contractVersion!==CONTROLLED_PROMOTION_RECORD_VERSION
   ||!hash(value.requestHash)||value.requestId!==`irpromo_v1_${value.requestHash}`)
   return {ok:false,reason:"promotion_record_integrity_failed"};
  const candidate=verifyPromotionCandidateForPreparation(value.candidateEnvelope);
  if(!candidate.ok)return {ok:false,reason:"promotion_record_integrity_failed"};
  if(value.state!=="promotion_prepared"
   ||(value.target!=="shadow"&&value.target!=="investing_paper")
   ||!["requestId","eligibilityId","decisionId","riskAssessmentId","memoryEventId",
    "candidateId","candidateVersion","experimentId","runId","idempotencyKey"]
    .every(k=>id(value[k]))||!time(value.preparedAt)||!ref(value.preparedBy)
   ||!validateInvestingResearchScope(value.scope).ok||!plain(value.scientificScope)
   ||!exact(value.scientificScope,["tenantId","ownerId","portfolioId","accountId"])
   ||candidate.value.requestedTarget!==value.target
   ||candidate.value.promotionEligibility.eligibilityId!==value.eligibilityId
   ||candidate.value.scientificDecision.decisionId!==value.decisionId
   ||candidate.value.scientificDecision.experimentId!==value.experimentId
   ||candidate.value.scientificDecision.runId!==value.runId
   ||candidate.value.candidate.id!==value.candidateId
   ||candidate.value.candidate.version!==value.candidateVersion
   ||!same(candidate.value.scope,value.scope)
   ||!same(candidate.value.scientificDecision.scientificScope,value.scientificScope))
   return {ok:false,reason:"promotion_record_integrity_failed"};
  const rebuilt=structuredClone(value) as ControlledPromotionRecord;
  const material={...rebuilt} as Record<string,unknown>;
  delete material.contractVersion;delete material.requestId;delete material.requestHash;
  const h=hashCanonicalResearchMaterial(ARTIFACT_IDENTITY_DOMAIN,material);
  const canonical=canonicalizeResearchContract(rebuilt);
  if(!h.ok||h.value.digest!==rebuilt.requestHash||!canonical.ok)
   return {ok:false,reason:"promotion_record_integrity_failed"};
  return {ok:true,value:rebuilt};
 }catch{return {ok:false,reason:"promotion_record_integrity_failed"};}
}
export function validateControlledPromotionRevocation(value:unknown):
ControlledPromotionResult<ControlledPromotionRevocation>{
 try{
  const keys=["contractVersion","revocationId","revocationHash","requestId","state",
   "scope","scientificScope","reasonCode","revokedAt","revokedBy"];
  if(!plain(value)||!exact(value,keys)
   ||value.contractVersion!==CONTROLLED_PROMOTION_REVOCATION_VERSION
   ||!hash(value.revocationHash)||value.revocationId!==`irprev_v1_${value.revocationHash}`
   ||value.state!=="promotion_revoked"||!id(value.requestId)||!time(value.revokedAt)
   ||!ref(value.revokedBy)||!validateInvestingResearchScope(value.scope).ok
   ||!plain(value.scientificScope)
   ||!exact(value.scientificScope,["tenantId","ownerId","portfolioId","accountId"])
   ||!["scientific_evidence_invalidated",
    "risk_capacity_invalidated","dataset_invalidated","operator_revoked"]
    .includes(String(value.reasonCode)))
   return {ok:false,reason:"promotion_revocation_integrity_failed"};
  const rebuilt=structuredClone(value) as ControlledPromotionRevocation;
  const material={...rebuilt} as Record<string,unknown>;
  delete material.contractVersion;delete material.revocationId;delete material.revocationHash;
  const h=hashCanonicalResearchMaterial(ARTIFACT_IDENTITY_DOMAIN,material);
  return h.ok&&h.value.digest===rebuilt.revocationHash?
   {ok:true,value:rebuilt}:{ok:false,reason:"promotion_revocation_integrity_failed"};
 }catch{return {ok:false,reason:"promotion_revocation_integrity_failed"};}
}
