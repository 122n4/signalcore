import "server-only";
import {canonicalizeResearchContract,validatePromotionEligibilityEnvelope,
 validateScientificDecision} from "../contracts";
import {hashCanonicalResearchMaterial} from "../reproducibility/hashing.server";
import {ARTIFACT_IDENTITY_DOMAIN} from "../reproducibility/versions";
import {validatePortfolioRiskAssessment} from "../portfolio-risk/runtimeValidation";
import {validateScientificMemoryEvent} from "../scientific-memory/persistedValidation.server";
import {CONTROLLED_PROMOTION_PROFILE_VERSION,PROMOTION_ELIGIBILITY_INPUT_VERSION,
 type ControlledPromotionResult,type PromotionEligibilityEvidence} from "./types";
const plain=(v:unknown):v is Record<string,unknown>=>{if(typeof v!=="object"||v===null
 ||Array.isArray(v)||Object.getPrototypeOf(v)!==Object.prototype)return false;
 const d=Object.getOwnPropertyDescriptors(v);return Reflect.ownKeys(v).every(k=>
 typeof k==="string"&&d[k]?.enumerable&&!d[k]?.get&&!d[k]?.set)};
const exact=(v:Record<string,unknown>,keys:readonly string[])=>
 Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const id=(v:unknown):v is string=>typeof v==="string"
 &&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u.test(v);
const time=(v:unknown):v is string=>typeof v==="string"&&Number.isFinite(Date.parse(v))
 &&new Date(v).toISOString()===v;
const same=(a:unknown,b:unknown)=>{const x=canonicalizeResearchContract(a);
 const y=canonicalizeResearchContract(b);return x.ok&&y.ok&&x.value===y.value};
export function evaluatePromotionEligibility(value:unknown):
ControlledPromotionResult<PromotionEligibilityEvidence>{
 try{
  if(!plain(value)||!exact(value,["contractVersion","decision","riskAssessment",
   "memoryEvent","profile","evaluatedAt","evaluatedBy"])
   ||value.contractVersion!==PROMOTION_ELIGIBILITY_INPUT_VERSION
   ||!plain(value.profile)||!exact(value.profile,["contractVersion","profileId",
    "profileVersion"])||value.profile.contractVersion!==CONTROLLED_PROMOTION_PROFILE_VERSION
   ||!id(value.profile.profileId)||!id(value.profile.profileVersion)
   ||!time(value.evaluatedAt)||!plain(value.evaluatedBy)
   ||!exact(value.evaluatedBy,["id","version"])||!id(value.evaluatedBy.id)
   ||!id(value.evaluatedBy.version))
   return {ok:false,reason:"promotion_eligibility_input_invalid"};
  const decision=validateScientificDecision(value.decision);
  const risk=validatePortfolioRiskAssessment(value.riskAssessment);
  const memory=validateScientificMemoryEvent(value.memoryEvent);
  if(!decision.ok||!risk.ok||!memory.ok)
   return {ok:false,reason:"promotion_evidence_integrity_failed"};
  if(decision.value.outcome!=="validated"||risk.value.outcome!=="passed"
   ||memory.value.knowledge!=="positive"||memory.value.outcome!=="validated")
   return {ok:false,reason:"promotion_evidence_not_eligible"};
  if(!same(decision.value.scope,risk.value.scope)||!same(decision.value.scope,memory.value.scope)
   ||!same(decision.value.scientificScope,risk.value.scientificScope)
   ||!same(decision.value.scientificScope,memory.value.scientificScope))
   return {ok:false,reason:"promotion_evidence_scope_mismatch"};
  const member=risk.value.members.find(item=>item.decisionId===decision.value.decisionId);
  if(!member||memory.value.decisionId!==decision.value.decisionId
   ||memory.value.reportId!==decision.value.validationReport.reportId
   ||member.reportId!==decision.value.validationReport.reportId
   ||member.experimentId!==decision.value.experimentId||member.runId!==decision.value.runId
   ||member.candidateId!==decision.value.candidateId
   ||member.candidateVersion!==decision.value.candidateVersion)
   return {ok:false,reason:"promotion_evidence_chain_mismatch"};
  const material={state:"promotion_eligible" as const,scope:decision.value.scope,
   scientificScope:decision.value.scientificScope,candidateId:decision.value.candidateId,
   candidateVersion:decision.value.candidateVersion,
   hypothesisId:decision.value.hypothesisId,hypothesisVersion:decision.value.hypothesisVersion,
   experimentId:decision.value.experimentId,runId:decision.value.runId,
   dataset:decision.value.validationReport.dataset,validationDecision:decision.value,
   evidenceIds:[decision.value.decisionId,risk.value.assessmentId,memory.value.eventId].sort(),
   reasonCodes:[],eligibilityProfile:{id:value.profile.profileId,
    version:value.profile.profileVersion},evaluatedAt:value.evaluatedAt,
   evaluatedBy:{id:value.evaluatedBy.id,version:value.evaluatedBy.version}};
  const hashed=hashCanonicalResearchMaterial(ARTIFACT_IDENTITY_DOMAIN,material);
  if(!hashed.ok)return {ok:false,reason:"promotion_eligibility_hash_failed"};
  const eligibility={contractVersion:"investing-promotion-eligibility-envelope/v1" as const,
   eligibilityId:`irelig_v1_${hashed.value.digest}`,...material};
  const validated=validatePromotionEligibilityEnvelope(eligibility);
  if(!validated.ok)return {ok:false,reason:"promotion_eligibility_contract_invalid"};
  return {ok:true,value:{eligibility:validated.value,evidenceHash:hashed.value.digest,
   riskAssessmentId:risk.value.assessmentId,riskAssessmentHash:risk.value.assessmentHash,
   memoryEventId:memory.value.eventId,memoryEventHash:memory.value.eventHash,
   profile:{id:value.profile.profileId,version:value.profile.profileVersion}}};
 }catch{return {ok:false,reason:"promotion_eligibility_input_invalid"};}
}
