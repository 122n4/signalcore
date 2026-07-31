import "server-only";import {createHash} from "node:crypto";
import {canonicalizeResearchContract} from "../contracts";import {evaluateBetaReadiness} from "./evaluator.server";
import {EFFECTIVE_READINESS_VERSION,READINESS_REVOCATION_VERSION,RELEASE_CANDIDATE_MATERIAL_VERSION,
 RELEASE_CANDIDATE_VERSION,type EffectiveReadiness,type EffectiveReadinessInput,
 type EffectiveReadinessRevocation,type ReleaseCandidate,type ReleaseCandidateMaterial,
 type ReleaseResult} from "./releaseTypes";
const sha=(v:unknown,n=64)=>typeof v==="string"&&new RegExp(`^[a-f0-9]{${n}}$`,"u").test(v);
const id=(v:unknown)=>typeof v==="string"&&/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/u.test(v);
const time=(v:unknown):v is string=>typeof v==="string"&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const hash=(domain:string,value:unknown)=>{const c=canonicalizeResearchContract(value);return c.ok?
 createHash("sha256").update(`${domain}\n${c.value}`).digest("hex"):null};
export function createReleaseCandidate(value:ReleaseCandidateMaterial):ReleaseResult<ReleaseCandidate>{
 try{if(value.contractVersion!==RELEASE_CANDIDATE_MATERIAL_VERSION||!sha(value.commitSha,40)
  ||![value.lockfileHash,value.migrationsHash,value.buildArtifactHash,value.operationalConfigHash].every(v=>sha(v))
  ||!id(value.buildId)||!id(value.runtimeProfile?.id)||!id(value.runtimeProfile?.version)
  ||!["preview","staging","production"].includes(value.targetEnvironment)||!time(value.createdAt))
  return {ok:false,reason:"release_candidate_invalid"};const material=structuredClone(value);
  const candidateHash=hash("investing-release-candidate/v1",material);if(!candidateHash)
   return {ok:false,reason:"release_candidate_invalid"};return {ok:true,value:{
    contractVersion:RELEASE_CANDIDATE_VERSION,candidateId:`irrc_v1_${candidateHash}`,
    candidateHash,material}}
 }catch{return {ok:false,reason:"release_candidate_invalid"}}
}
const candidateValid=(v:ReleaseCandidate)=>{const recreated=createReleaseCandidate(v.material);
 return recreated.ok&&recreated.value.candidateId===v.candidateId&&recreated.value.candidateHash===v.candidateHash};
export function evaluateEffectiveReadiness(input:EffectiveReadinessInput):ReleaseResult<EffectiveReadiness>{
 try{if(!candidateValid(input.candidate)||!time(input.evaluatedAt))return {ok:false,reason:"effective_readiness_input_invalid"};
  const calculated=evaluateBetaReadiness(input.manifest);const supplied=canonicalizeResearchContract(input.report);
  const expected=calculated.ok?canonicalizeResearchContract(calculated.value):null;if(!calculated.ok
   ||!supplied.ok||!expected?.ok||supplied.value!==expected.value)
   return {ok:false,reason:"effective_readiness_report_invalid"};
  let reason:EffectiveReadiness["reason"]=null;
  if(input.report.state!=="beta_ready")reason="report_blocked";
  else if(input.manifest.checkpoint!==input.candidate.material.commitSha)reason="binding_mismatch";
  else if(input.manifest.evidence.some(e=>Date.parse(e.validUntil)<Date.parse(input.evaluatedAt)))reason="evidence_expired";
  else if(input.priorRevocation&&input.prior&&input.priorRevocation.assessmentId===input.prior.assessmentId
   &&input.prior.candidateId===input.candidate.candidateId)reason="prior_revoked";
  const material={contractVersion:EFFECTIVE_READINESS_VERSION,candidateId:input.candidate.candidateId,
   reportHash:input.report.reportHash,targetEnvironment:input.candidate.material.targetEnvironment,
   state:reason===null?"effective_beta_ready":"blocked",reason,
   supersedesAssessmentId:input.prior&&input.prior.candidateId!==input.candidate.candidateId
    &&input.prior.targetEnvironment===input.candidate.material.targetEnvironment?input.prior.assessmentId:null,
   evaluatedAt:input.evaluatedAt} as const;const assessmentHash=hash("investing-effective-beta-readiness/v1",material);
  if(!assessmentHash)return {ok:false,reason:"effective_readiness_input_invalid"};return {ok:true,value:{...material,
   assessmentId:`ireff_v1_${assessmentHash}`,assessmentHash}}
 }catch{return {ok:false,reason:"effective_readiness_input_invalid"}}
}
export function revokeEffectiveReadiness(input:Readonly<{assessment:EffectiveReadiness;
 reason:EffectiveReadinessRevocation["reason"];revokedAt:string;revokedBy:{id:string;version:string}}>):
 ReleaseResult<EffectiveReadinessRevocation>{try{if(!time(input.revokedAt)||!id(input.revokedBy.id)
 ||!id(input.revokedBy.version)||!input.assessment.assessmentId.startsWith("ireff_v1_")
 ||!["evidence_invalidated","build_invalidated","configuration_invalidated","operator_revoked"].includes(input.reason))
 return {ok:false,reason:"effective_readiness_revocation_invalid"};const material={contractVersion:READINESS_REVOCATION_VERSION,
  assessmentId:input.assessment.assessmentId,candidateId:input.assessment.candidateId,reason:input.reason,
  revokedAt:input.revokedAt,revokedBy:structuredClone(input.revokedBy)} as const;const revocationHash=
  hash("investing-effective-readiness-revocation/v1",material);if(!revocationHash)
  return {ok:false,reason:"effective_readiness_revocation_invalid"};return {ok:true,value:{...material,
   revocationId:`irev_v1_${revocationHash}`,revocationHash}}}catch{return {ok:false,
  reason:"effective_readiness_revocation_invalid"}}}
