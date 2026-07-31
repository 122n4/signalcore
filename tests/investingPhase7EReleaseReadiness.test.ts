import {describe,expect,it} from "vitest";import {evaluateBetaReadiness} from
 "@/lib/investing/research/readiness/evaluator.server";import {BETA_READINESS_GATE_IDS,
 BETA_READINESS_MANIFEST_VERSION,RELEASE_CANDIDATE_MATERIAL_VERSION} from
 "@/lib/investing/research/readiness";import {createReleaseCandidate,evaluateEffectiveReadiness,
 revokeEffectiveReadiness} from "@/lib/investing/research/readiness/releaseIdentity.server";
const sha="a".repeat(40);const manifest=()=>({contractVersion:BETA_READINESS_MANIFEST_VERSION,
 checkpoint:sha,evaluatedAt:"2026-08-08T10:00:00.000Z",profile:{id:"beta",version:"v1"},
 evidence:BETA_READINESS_GATE_IDS.map(gateId=>({gateId,state:"passed" as const,checkpoint:sha,
  observedAt:"2026-08-08T09:00:00.000Z",validUntil:"2026-08-09T09:00:00.000Z",
  reference:`official:${gateId}`}))});
const candidate=()=>createReleaseCandidate({contractVersion:RELEASE_CANDIDATE_MATERIAL_VERSION,
 commitSha:sha,lockfileHash:"b".repeat(64),migrationsHash:"c".repeat(64),buildId:"build-1",
 buildArtifactHash:"d".repeat(64),runtimeProfile:{id:"node",version:"v24"},
 targetEnvironment:"staging",operationalConfigHash:"e".repeat(64),createdAt:"2026-08-08T10:00:00.000Z"});
const ready=()=>{const c=candidate(),m=manifest(),r=evaluateBetaReadiness(m);if(!c.ok||!r.ok)throw 0;
 return {candidate:c.value,manifest:m,report:r.value,evaluatedAt:"2026-08-08T11:00:00.000Z",
  prior:null,priorRevocation:null}};
describe("Phase 7E release identity and effective readiness",()=>{
 it("binds every material release dimension into deterministic identity",()=>{const a=candidate();expect(a).toEqual(candidate());
  expect(a.ok&&a.value.candidateId).toMatch(/^irrc_v1_[a-f0-9]{64}$/u);if(!a.ok)return;
  const changed=createReleaseCandidate({...a.value.material,operationalConfigHash:"f".repeat(64)});
  expect(changed.ok&&changed.value.candidateId).not.toBe(a.value.candidateId)});
 it("produces effective readiness only for exact fresh binding",()=>{const result=evaluateEffectiveReadiness(ready());
  expect(result.ok&&result.value.state).toBe("effective_beta_ready")});
 it("blocks checkpoint mismatch and expiration",()=>{const bound=ready();const other=createReleaseCandidate({
   ...bound.candidate.material,commitSha:"f".repeat(40)});if(!other.ok)throw 0;
  expect(evaluateEffectiveReadiness({...bound,candidate:other.value})).toMatchObject({ok:true,
   value:{state:"blocked",reason:"binding_mismatch"}});expect(evaluateEffectiveReadiness({...bound,
   evaluatedAt:"2026-08-10T00:00:00.000Z"})).toMatchObject({ok:true,
    value:{state:"blocked",reason:"evidence_expired"}})});
 it("rejects a report altered independently of its hash",()=>{const input=ready();expect(evaluateEffectiveReadiness({...input,
  report:{...input.report,state:"blocked"}})).toEqual({ok:false,reason:"effective_readiness_report_invalid"})});
 it("supersedes only a different candidate in the same environment",()=>{const first=evaluateEffectiveReadiness(ready());if(!first.ok)throw 0;
  const next=ready();const changed=createReleaseCandidate({...next.candidate.material,buildId:"build-2"});if(!changed.ok)throw 0;
  const result=evaluateEffectiveReadiness({...next,candidate:changed.value,prior:first.value});
  expect(result.ok&&result.value.supersedesAssessmentId).toBe(first.value.assessmentId)});
 it("revokes immutably and prevents reuse of the same prior",()=>{const input=ready();const assessed=evaluateEffectiveReadiness(input);if(!assessed.ok)throw 0;
  const revoked=revokeEffectiveReadiness({assessment:assessed.value,reason:"operator_revoked",
   revokedAt:"2026-08-08T12:00:00.000Z",revokedBy:{id:"operator",version:"v1"}});expect(revoked.ok).toBe(true);
  if(!revoked.ok)return;expect(evaluateEffectiveReadiness({...input,prior:assessed.value,
   priorRevocation:revoked.value})).toMatchObject({ok:true,value:{state:"blocked",reason:"prior_revoked"}})});
});
