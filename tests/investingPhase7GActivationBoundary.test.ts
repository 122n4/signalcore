import {describe,expect,it,vi} from "vitest";import {decideBetaActivation,BetaActivationService} from
 "@/lib/investing/research/readiness/activationBoundary.server";import {createReleaseCandidate,evaluateEffectiveReadiness,
 revokeEffectiveReadiness} from "@/lib/investing/research/readiness/releaseIdentity.server";import {evaluateBetaReadiness} from
 "@/lib/investing/research/readiness/evaluator.server";import {BETA_READINESS_GATE_IDS,BETA_READINESS_MANIFEST_VERSION,
 RELEASE_CANDIDATE_MATERIAL_VERSION} from "@/lib/investing/research/readiness";
const now="2026-08-08T12:00:00.000Z",sha="a".repeat(40);const state=()=>{const candidate=createReleaseCandidate({
 contractVersion:RELEASE_CANDIDATE_MATERIAL_VERSION,commitSha:sha,lockfileHash:"b".repeat(64),migrationsHash:"c".repeat(64),
 buildId:"build-7g",buildArtifactHash:"d".repeat(64),runtimeProfile:{id:"node",version:"v24"},targetEnvironment:"staging",
 operationalConfigHash:"e".repeat(64),createdAt:"2026-08-08T10:00:00.000Z"});const manifest={contractVersion:BETA_READINESS_MANIFEST_VERSION,
 checkpoint:sha,evaluatedAt:"2026-08-08T10:30:00.000Z",profile:{id:"beta",version:"v1"},evidence:BETA_READINESS_GATE_IDS.map(gateId=>
 ({gateId,state:"passed" as const,checkpoint:sha,observedAt:"2026-08-08T10:00:00.000Z",validUntil:"2026-08-09T10:00:00.000Z",
 reference:`official:${gateId}`}))};const report=evaluateBetaReadiness(manifest);if(!candidate.ok||!report.ok)throw 0;
 const assessment=evaluateEffectiveReadiness({candidate:candidate.value,manifest,report:report.value,evaluatedAt:"2026-08-08T11:00:00.000Z",
 prior:null,priorRevocation:null});if(!assessment.ok)throw 0;return {candidate:candidate.value,assessment:assessment.value,revocation:null,latestDecision:null}};
const authority={authenticatedUserId:"user_operator",membershipId:"membership-1",tenantId:"tenant-1",requestId:"request-1"};
const request=(s=state())=>({candidateId:s.candidate.candidateId,assessmentId:s.assessment.assessmentId,buildId:"build-7g",
 targetEnvironment:"staging" as const,action:"activate" as const,allowlistedUserIds:["user_beta_a"],rollbackReference:"rollback-7g",
 rollbackVerifiedAt:"2026-08-08T11:30:00.000Z",rollbackValidUntil:"2026-08-09T11:30:00.000Z",decisionReason:"approved-beta",
 changeTicket:"change-7g",requestedAt:now});
describe("Phase 7G beta activation boundary",()=>{it("authorizes an exact contained activation deterministically",()=>{const s=state();
 const a=decideBetaActivation({request:request(s),authority,state:s,killSwitchEngaged:false});expect(a).toEqual(decideBetaActivation({
  request:request(s),authority,state:s,killSwitchEngaged:false}));expect(a).toMatchObject({ok:true,value:{action:"activate",
  effectiveState:"active",allowlistedUserIds:["user_beta_a"]}})});
 it("fails closed for binding drift, empty allowlist, kill switch and stale rollback",()=>{const s=state();expect(decideBetaActivation({
  request:{...request(s),buildId:"other"},authority,state:s,killSwitchEngaged:false})).toMatchObject({ok:false,reason:"beta_activation_binding_mismatch"});
  expect(decideBetaActivation({request:{...request(s),allowlistedUserIds:[]},authority,state:s,killSwitchEngaged:false})).toMatchObject({ok:false,
   reason:"beta_activation_containment_blocked"});expect(decideBetaActivation({request:request(s),authority,state:s,killSwitchEngaged:true})).toMatchObject({
   ok:false,reason:"beta_activation_containment_blocked"});expect(decideBetaActivation({request:{...request(s),allowlistedUserIds:["*"]},authority,
   state:s,killSwitchEngaged:false})).toMatchObject({ok:false,reason:"beta_activation_request_invalid"});expect(decideBetaActivation({request:{...request(s),rollbackValidUntil:"2026-08-08T11:59:59.000Z"},
   authority,state:s,killSwitchEngaged:false})).toMatchObject({ok:false,reason:"beta_activation_readiness_invalid"})});
 it("blocks revoked readiness but always permits an authenticated kill decision",()=>{const s=state();const revoked=revokeEffectiveReadiness({
  assessment:s.assessment,reason:"operator_revoked",revokedAt:"2026-08-08T11:30:00.000Z",revokedBy:{id:"operator",version:"v1"}});if(!revoked.ok)throw 0;
  const bad={...s,revocation:revoked.value};expect(decideBetaActivation({request:request(bad),authority,state:bad,killSwitchEngaged:false})).toMatchObject({ok:false,
   reason:"beta_activation_readiness_invalid"});expect(decideBetaActivation({request:{...request(bad),action:"engage_kill_switch"},authority,state:bad,
   killSwitchEngaged:false})).toMatchObject({ok:true,value:{effectiveState:"killed"}})});
 it("rejects a stale or same-time decision instead of using hash order",()=>{const s=state();const first=decideBetaActivation({request:request(s),authority,
  state:s,killSwitchEngaged:false});if(!first.ok)throw 0;expect(decideBetaActivation({request:{...request(s),action:"engage_kill_switch"},authority,
  state:{...s,latestDecision:first.value},killSwitchEngaged:false})).toEqual({ok:false,reason:"beta_activation_decision_stale"})});
 it("requires an explicit reset for an engaged kill switch",()=>{const s=state();expect(decideBetaActivation({request:{...request(s),action:"reset_kill_switch"},
  authority,state:s,killSwitchEngaged:false})).toEqual({ok:false,reason:"beta_activation_containment_blocked"});expect(decideBetaActivation({request:{
  ...request(s),action:"reset_kill_switch"},authority,state:s,killSwitchEngaged:true})).toMatchObject({ok:true,value:{effectiveState:"inactive"}})});
 it("authorizes before repository IO",async()=>{const decide=vi.fn();const service=new BetaActivationService({authorize:async()=>({ok:false as const,
  reason:"denied"})},{decide});await expect(service.execute(request())).resolves.toEqual({ok:false,reason:"denied"});expect(decide).not.toHaveBeenCalled()})});
