import {describe,expect,it,vi} from "vitest";import {ReleaseGateService} from "@/lib/investing/research/readiness/releaseGate.server";
import {isAuthorizedBetaOperator} from "@/lib/investing/research/readiness/operatorAuthorization.server";import {evaluateBetaReadiness} from
 "@/lib/investing/research/readiness/evaluator.server";import {BETA_READINESS_GATE_IDS,BETA_READINESS_MANIFEST_VERSION,
 RELEASE_CANDIDATE_MATERIAL_VERSION} from "@/lib/investing/research/readiness";import {createReleaseCandidate} from
 "@/lib/investing/research/readiness/releaseIdentity.server";const sha="1".repeat(40),evaluatedAt="2026-08-22T10:00:00.000Z";
const request={collection:{checkpoint:sha,evaluatedAt,profile:{id:"phase7h",version:"v1"}},candidate:{
 contractVersion:RELEASE_CANDIDATE_MATERIAL_VERSION,commitSha:sha,lockfileHash:"2".repeat(64),migrationsHash:"3".repeat(64),
 buildId:"phase7h-build",buildArtifactHash:"4".repeat(64),runtimeProfile:{id:"node",version:"v24"},targetEnvironment:"staging" as const,
 operationalConfigHash:"5".repeat(64),createdAt:evaluatedAt},assessmentEvaluatedAt:"2026-08-22T11:00:00.000Z"};
const bound=createReleaseCandidate(request.candidate);if(!bound.ok)throw 0;const manifest={contractVersion:BETA_READINESS_MANIFEST_VERSION,
 checkpoint:sha,evaluatedAt,profile:{id:"phase7h",version:"v1"},evidence:BETA_READINESS_GATE_IDS.map(gateId=>({gateId,state:"passed" as const,
 checkpoint:sha,observedAt:"2026-08-22T09:00:00.000Z",validUntil:"2026-08-23T09:00:00.000Z",
 reference:`release-candidate:${bound.value.candidateId}:${gateId}`}))};const report=evaluateBetaReadiness(manifest);if(!report.ok)throw 0;
describe("Phase 7H integrated release gate",()=>{it("authorizes before trusted collection and persistence",async()=>{const evaluate=vi.fn(),assess=vi.fn();
 const service=new ReleaseGateService({authorize:async()=>({ok:false as const,reason:"denied"})},{evaluate} as never,{assess});
 await expect(service.assess(request)).resolves.toEqual({ok:false,reason:"denied"});expect(evaluate).not.toHaveBeenCalled();expect(assess).not.toHaveBeenCalled()});
 it("passes one trusted report and exact release binding to the atomic repository",async()=>{const assess=vi.fn(async()=>({ok:false as const,reason:"probe"}));
 const service=new ReleaseGateService({authorize:async()=>({ok:true as const,value:{authenticatedUserId:"user_ops",membershipId:"member-1",requestId:"request-1"}})},
  {evaluate:async()=>({manifest,result:{ok:true as const,value:report.value}})} as never,{assess});await expect(service.assess(request)).resolves.toEqual({
   ok:false,reason:"probe"});expect(assess).toHaveBeenCalledWith({request,manifest,report:report.value})});
 it("fails before collection when checkpoint and candidate differ",async()=>{const evaluate=vi.fn();const service=new ReleaseGateService({authorize:async()=>({
  ok:true as const,value:{authenticatedUserId:"user_ops",membershipId:"member-1",requestId:"request-1"}})},{evaluate} as never,{assess:vi.fn()});
  await expect(service.assess({...request,collection:{...request.collection,checkpoint:"f".repeat(40)}})).resolves.toEqual({ok:false,
   reason:"release_gate_binding_mismatch"});expect(evaluate).not.toHaveBeenCalled()});
 it("rejects signed evidence bound to another release candidate",async()=>{const wrong={...manifest,evidence:manifest.evidence.map(v=>({...v,
  reference:`release-candidate:irrc_v1_${"f".repeat(64)}:${v.gateId}`}))};const wrongReport=evaluateBetaReadiness(wrong);if(!wrongReport.ok)throw 0;
  const service=new ReleaseGateService({authorize:async()=>({ok:true as const,value:{authenticatedUserId:"user_ops",membershipId:"member-1",
   requestId:"request-1"}})},{evaluate:async()=>({manifest:wrong,result:{ok:true as const,value:wrongReport.value}})} as never,{assess:vi.fn()});
  await expect(service.assess(request)).resolves.toEqual({ok:false,reason:"release_gate_evidence_binding_invalid"})});
 it("uses a closed distinct operator allowlist",()=>{expect(isAuthorizedBetaOperator("user_ops","user_ops,user_backup")).toBe(true);
  expect(isAuthorizedBetaOperator("user_other","user_ops,user_backup")).toBe(false);expect(isAuthorizedBetaOperator("user_ops","*")).toBe(false);
  expect(isAuthorizedBetaOperator("user_ops","")).toBe(false);expect(isAuthorizedBetaOperator("user_ops","user_ops,user_ops")).toBe(false)})});
