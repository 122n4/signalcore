import "server-only";import {createHash} from "node:crypto";import {canonicalizeResearchContract} from "../contracts";
import {BETA_ACTIVATION_DECISION_VERSION,type BetaActivationAuthority,type BetaActivationDecision,
 type BetaActivationRequest,type BetaActivationResult,type BetaActivationState} from "./activationTypes";
import {createReleaseCandidate} from "./releaseIdentity.server";
const identifier=(v:unknown)=>typeof v==="string"&&/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,191}$/u.test(v);
const instant=(v:unknown):v is string=>typeof v==="string"&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const user=/^user_[A-Za-z0-9_-]{1,128}$/u;const hash=(v:unknown)=>{const c=canonicalizeResearchContract(v);return c.ok?
 createHash("sha256").update(`investing-beta-activation-decision/v1\n${c.value}`).digest("hex"):null};
const decisionValid=(v:BetaActivationDecision)=>{const {decisionId,decisionHash,...material}=v;const calculated=hash(material);
 return calculated===decisionHash&&decisionId===`irba_v1_${calculated}`};
export function decideBetaActivation(input:Readonly<{request:BetaActivationRequest;authority:BetaActivationAuthority;
 state:BetaActivationState;killSwitchEngaged:boolean}>):BetaActivationResult<BetaActivationDecision>{try{const {request,state,authority}=input;
  if(!user.test(authority.authenticatedUserId)||![authority.membershipId,authority.tenantId,authority.requestId,
   request.rollbackReference,request.decisionReason,request.changeTicket].every(identifier)
   ||!instant(request.requestedAt)||!instant(request.rollbackVerifiedAt)||!instant(request.rollbackValidUntil)
   ||!["activate","deactivate","engage_kill_switch","reset_kill_switch"].includes(request.action)
   ||!Array.isArray(request.allowlistedUserIds)||new Set(request.allowlistedUserIds).size!==request.allowlistedUserIds.length
   ||request.allowlistedUserIds.some(v=>!user.test(v)))return {ok:false,reason:"beta_activation_request_invalid"};
  const candidate=createReleaseCandidate(state.candidate.material);const assessmentMaterial={contractVersion:state.assessment.contractVersion,
   candidateId:state.assessment.candidateId,reportHash:state.assessment.reportHash,targetEnvironment:state.assessment.targetEnvironment,
   state:state.assessment.state,reason:state.assessment.reason,supersedesAssessmentId:state.assessment.supersedesAssessmentId,
   evaluatedAt:state.assessment.evaluatedAt};const assessmentHash=(()=>{const c=canonicalizeResearchContract(assessmentMaterial);return c.ok?
   createHash("sha256").update(`investing-effective-beta-readiness/v1\n${c.value}`).digest("hex"):null})();
  if(!candidate.ok||candidate.value.candidateId!==state.candidate.candidateId||candidate.value.candidateHash!==state.candidate.candidateHash
   ||assessmentHash!==state.assessment.assessmentHash||state.assessment.assessmentId!==`ireff_v1_${assessmentHash}`)
   return {ok:false,reason:"beta_activation_authoritative_state_invalid"};
  if(request.candidateId!==state.candidate.candidateId||request.assessmentId!==state.assessment.assessmentId
   ||request.buildId!==state.candidate.material.buildId||request.targetEnvironment!==state.candidate.material.targetEnvironment
   ||state.assessment.candidateId!==state.candidate.candidateId||state.assessment.targetEnvironment!==request.targetEnvironment)
   return {ok:false,reason:"beta_activation_binding_mismatch"};
  if((request.action==="activate"||request.action==="reset_kill_switch")&&(state.assessment.state!=="effective_beta_ready"||state.revocation
   ||Date.parse(request.requestedAt)>Date.parse(request.rollbackValidUntil)
   ||Date.parse(request.rollbackVerifiedAt)>Date.parse(request.requestedAt)))return {ok:false,reason:"beta_activation_readiness_invalid"};
  if(request.action==="activate"&&(input.killSwitchEngaged||request.allowlistedUserIds.length===0))
   return {ok:false,reason:"beta_activation_containment_blocked"};
  if(request.action==="reset_kill_switch"&&!input.killSwitchEngaged)
   return {ok:false,reason:"beta_activation_containment_blocked"};
  const sortedUsers=[...request.allowlistedUserIds].sort();const prior=state.latestDecision;
  if(prior&&!decisionValid(prior))return {ok:false,reason:"beta_activation_authoritative_state_invalid"};
  if(prior&&prior.candidateId===request.candidateId&&prior.assessmentId===request.assessmentId&&prior.buildId===request.buildId
   &&prior.targetEnvironment===request.targetEnvironment&&prior.action===request.action&&prior.decidedAt===request.requestedAt
   &&prior.rollbackReference===request.rollbackReference&&prior.rollbackVerifiedAt===request.rollbackVerifiedAt
   &&prior.rollbackValidUntil===request.rollbackValidUntil&&prior.decisionReason===request.decisionReason
   &&prior.changeTicket===request.changeTicket&&prior.decidedBy.authenticatedUserId===authority.authenticatedUserId
   &&prior.decidedBy.membershipId===authority.membershipId&&prior.decidedBy.tenantId===authority.tenantId
   &&prior.decidedBy.requestId===authority.requestId&&JSON.stringify(prior.allowlistedUserIds)===JSON.stringify(sortedUsers))
   return {ok:true,value:structuredClone(prior)};
  const material={contractVersion:BETA_ACTIVATION_DECISION_VERSION,candidateId:request.candidateId,
   assessmentId:request.assessmentId,buildId:request.buildId,targetEnvironment:request.targetEnvironment,
   action:request.action,effectiveState:request.action==="activate"?"active":request.action==="engage_kill_switch"?"killed":"inactive",
   allowlistedUserIds:sortedUsers,rollbackReference:request.rollbackReference,
   rollbackVerifiedAt:request.rollbackVerifiedAt,rollbackValidUntil:request.rollbackValidUntil,
   decisionReason:request.decisionReason,changeTicket:request.changeTicket,decidedAt:request.requestedAt,
   decidedBy:structuredClone(authority),supersedesDecisionId:state.latestDecision?.decisionId??null} as const;
  const decisionHash=hash(material);if(!decisionHash)return {ok:false,reason:"beta_activation_request_invalid"};
  const decision={...material,decisionId:`irba_v1_${decisionHash}`,decisionHash} as const;
  if(state.latestDecision&&Date.parse(request.requestedAt)<=Date.parse(state.latestDecision.decidedAt)
   &&state.latestDecision.decisionId!==decision.decisionId)return {ok:false,reason:"beta_activation_decision_stale"};
  return {ok:true,value:decision}}catch{return {ok:false,reason:"beta_activation_request_invalid"}}}
export interface BetaActivationRepository{decide(request:BetaActivationRequest,authority:BetaActivationAuthority):Promise<BetaActivationResult<BetaActivationDecision>>}
export interface BetaActivationAuthorization{authorize():Promise<BetaActivationResult<BetaActivationAuthority>>}
export class BetaActivationService{constructor(private readonly authorization:BetaActivationAuthorization,
 private readonly repository:BetaActivationRepository){}async execute(request:BetaActivationRequest){const authority=await this.authorization.authorize();
  if(!authority.ok)return authority;try{return await this.repository.decide(request,authority.value)}catch{return {ok:false as const,
   reason:"beta_activation_boundary_failed"}}}}
