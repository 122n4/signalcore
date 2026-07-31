import {Pool} from "pg";import {describe,expect,it} from "vitest";import {PostgresBetaActivationRepository} from
 "@/lib/investing/research/readiness/activationPostgresRepository.server";import {createReleaseCandidate,evaluateEffectiveReadiness} from
 "@/lib/investing/research/readiness/releaseIdentity.server";import {evaluateBetaReadiness} from "@/lib/investing/research/readiness/evaluator.server";
import {BETA_READINESS_GATE_IDS,BETA_READINESS_MANIFEST_VERSION,RELEASE_CANDIDATE_MATERIAL_VERSION} from
 "@/lib/investing/research/readiness";const url=process.env.INVESTING_PG_TEST_URL;const pgDescribe=url?describe:describe.skip;
pgDescribe("Phase 7G real PostgreSQL activation boundary",()=>{it("persists one exact immutable decision and reuses its identity",async()=>{
 const pool=new Pool({connectionString:url,max:3});try{const sha="7".repeat(40),manifest={contractVersion:BETA_READINESS_MANIFEST_VERSION,
 checkpoint:sha,evaluatedAt:"2026-08-20T10:00:00.000Z",profile:{id:"phase7g-pg",version:"v1"},evidence:BETA_READINESS_GATE_IDS.map(gateId=>
 ({gateId,state:"passed" as const,checkpoint:sha,observedAt:"2026-08-20T09:00:00.000Z",validUntil:"2026-08-21T09:00:00.000Z",
 reference:`official:${gateId}`}))};const report=evaluateBetaReadiness(manifest),candidate=createReleaseCandidate({
 contractVersion:RELEASE_CANDIDATE_MATERIAL_VERSION,commitSha:sha,lockfileHash:"8".repeat(64),migrationsHash:"9".repeat(64),
 buildId:"phase7g-pg-build",buildArtifactHash:"a".repeat(64),runtimeProfile:{id:"node",version:"v24"},targetEnvironment:"production",
 operationalConfigHash:"b".repeat(64),createdAt:"2026-08-20T10:00:00.000Z"});if(!report.ok||!candidate.ok)throw 0;
 const assessment=evaluateEffectiveReadiness({candidate:candidate.value,manifest,report:report.value,evaluatedAt:"2026-08-20T11:00:00.000Z",
  prior:null,priorRevocation:null});if(!assessment.ok)throw 0;await pool.query(`insert into public.investing_research_beta_readiness_reports
  (report_hash,checkpoint,evaluated_at,state,profile_id,profile_version,canonical_payload)values($1,$2,$3,$4,$5,$6,$7::jsonb)
  on conflict(report_hash)do nothing`,[report.value.reportHash,sha,report.value.evaluatedAt,report.value.state,"phase7g-pg","v1",
  JSON.stringify({manifest,report:report.value})]);await pool.query(`insert into public.investing_release_candidates(candidate_id,candidate_hash,commit_sha,
  target_environment,build_id,created_at,canonical_payload)values($1,$2,$3,$4,$5,$6,$7::jsonb)on conflict(candidate_id)do nothing`,
  [candidate.value.candidateId,candidate.value.candidateHash,sha,"production","phase7g-pg-build",candidate.value.material.createdAt,
  JSON.stringify(candidate.value)]);await pool.query(`insert into public.investing_effective_beta_readiness(assessment_id,assessment_hash,candidate_id,
  report_hash,target_environment,state,reason,supersedes_assessment_id,evaluated_at,canonical_payload)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
  on conflict(assessment_id)do nothing`,[assessment.value.assessmentId,assessment.value.assessmentHash,candidate.value.candidateId,
  report.value.reportHash,"production",assessment.value.state,assessment.value.reason,null,assessment.value.evaluatedAt,JSON.stringify(assessment.value)]);
 const repository=new PostgresBetaActivationRepository(pool),request={candidateId:candidate.value.candidateId,assessmentId:assessment.value.assessmentId,
  buildId:"phase7g-pg-build",targetEnvironment:"production" as const,action:"activate" as const,allowlistedUserIds:["user_phase7g_pg"],
  rollbackReference:"phase7g-pg-rollback",rollbackVerifiedAt:"2026-08-20T11:30:00.000Z",rollbackValidUntil:"2026-08-21T11:30:00.000Z",
  decisionReason:"phase7g-pg-approved",changeTicket:"phase7g-pg-ticket",requestedAt:"2026-08-20T12:00:00.000Z"},authority={
  authenticatedUserId:"user_phase7g_operator",membershipId:"phase7g-membership",tenantId:"phase7g-tenant",requestId:"phase7g-request"};
 const first=await repository.decide(request,authority),second=await repository.decide(request,authority);expect(first).toMatchObject({ok:true,
  value:{effectiveState:"active"}});expect(second).toEqual(first);const persisted=await pool.query("select count(*)::int n from public.investing_beta_activation_decisions where decision_id=$1",
  [first.ok?first.value.decisionId:""]);expect(persisted.rows[0].n).toBe(1)}finally{await pool.end()}})});
