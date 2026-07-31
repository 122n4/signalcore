import "server-only";import {canonicalizeResearchContract} from "../contracts";import type {ScopedSqlPool} from
 "../dataset-catalog/postgresRepository.server";import {evaluateBetaReadiness} from "./evaluator.server";import {createReleaseCandidate,
 effectiveReadinessRevocationValid,effectiveReadinessValid,evaluateEffectiveReadiness} from "./releaseIdentity.server";
import type {ReleaseGateRepository,ReleaseGateValue} from "./releaseGate.server";import type {EffectiveReadiness,EffectiveReadinessRevocation} from "./releaseTypes";
const same=(a:unknown,b:unknown)=>{const x=canonicalizeResearchContract(a),y=canonicalizeResearchContract(b);return x.ok&&y.ok&&x.value===y.value};
export class PostgresReleaseGateRepository implements ReleaseGateRepository{constructor(private readonly pool:ScopedSqlPool){}async assess(input:Parameters<ReleaseGateRepository["assess"]>[0]){
 const candidate=createReleaseCandidate(input.request.candidate),calculated=evaluateBetaReadiness(input.manifest);if(!candidate.ok||!calculated.ok
  ||!same(calculated.value,input.report)||input.manifest.evidence.some(v=>v.state!=="unavailable"
   &&!v.reference.startsWith(`release-candidate:${candidate.ok?candidate.value.candidateId:""}:`)))
  return {ok:false as const,reason:"release_gate_input_invalid"};const client=await this.pool.connect();try{
  await client.query("begin");await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[candidate.value.material.targetEnvironment]);
  const reportPayload={manifest:input.manifest,report:input.report};const reportInsert=await client.query(`insert into public.investing_research_beta_readiness_reports
   (report_hash,checkpoint,evaluated_at,state,profile_id,profile_version,canonical_payload)values($1,$2,$3,$4,$5,$6,$7::jsonb)
   on conflict(report_hash)do nothing returning canonical_payload`,[input.report.reportHash,input.report.checkpoint,input.report.evaluatedAt,
   input.report.state,input.report.profile.id,input.report.profile.version,JSON.stringify(reportPayload)]);if(reportInsert.rows.length===0){const existing=await client.query(
   "select canonical_payload from public.investing_research_beta_readiness_reports where report_hash=$1",[input.report.reportHash]);if(!same(existing.rows[0]?.canonical_payload,
   reportPayload))throw new Error("release_gate_report_collision")}
  const candidateInsert=await client.query(`insert into public.investing_release_candidates(candidate_id,candidate_hash,commit_sha,target_environment,
   build_id,created_at,canonical_payload)values($1,$2,$3,$4,$5,$6,$7::jsonb)on conflict(candidate_id)do nothing returning canonical_payload`,
   [candidate.value.candidateId,candidate.value.candidateHash,candidate.value.material.commitSha,candidate.value.material.targetEnvironment,
   candidate.value.material.buildId,candidate.value.material.createdAt,JSON.stringify(candidate.value)]);if(candidateInsert.rows.length===0){const existing=await client.query(
   "select canonical_payload from public.investing_release_candidates where candidate_id=$1",[candidate.value.candidateId]);if(!same(existing.rows[0]?.canonical_payload,
   candidate.value))throw new Error("release_gate_candidate_collision")}
  const priorResult=await client.query(`select a.canonical_payload assessment,r.canonical_payload revocation from public.investing_effective_beta_readiness a
   left join public.investing_effective_readiness_revocations r on r.assessment_id=a.assessment_id where a.target_environment=$1
   order by a.evaluated_at desc,a.assessment_id desc limit 1`,[candidate.value.material.targetEnvironment]);const prior=priorResult.rows[0]?.assessment as EffectiveReadiness|undefined;
  const revocation=(priorResult.rows[0]?.revocation??null) as EffectiveReadinessRevocation|null;if(prior&&(!effectiveReadinessValid(prior)
   ||(revocation&&!effectiveReadinessRevocationValid(revocation))))throw new Error("release_gate_prior_integrity_failed");
  const assessed=evaluateEffectiveReadiness({candidate:candidate.value,manifest:input.manifest,report:input.report,
   evaluatedAt:input.request.assessmentEvaluatedAt,prior:prior??null,priorRevocation:revocation});if("reason" in assessed)throw new Error(assessed.reason);
  if(prior&&Date.parse(prior.evaluatedAt)>Date.parse(assessed.value.evaluatedAt)){await client.query("rollback");return {ok:false as const,
   reason:"release_gate_assessment_stale"}}const assessmentInsert=await client.query(`insert into public.investing_effective_beta_readiness
   (assessment_id,assessment_hash,candidate_id,report_hash,target_environment,state,reason,supersedes_assessment_id,evaluated_at,canonical_payload)
   values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)on conflict(assessment_id)do nothing returning canonical_payload`,[assessed.value.assessmentId,
   assessed.value.assessmentHash,assessed.value.candidateId,assessed.value.reportHash,assessed.value.targetEnvironment,assessed.value.state,
   assessed.value.reason,assessed.value.supersedesAssessmentId,assessed.value.evaluatedAt,JSON.stringify(assessed.value)]);let value:ReleaseGateValue={candidate:candidate.value,
   assessment:assessed.value,reused:false};if(assessmentInsert.rows.length===0){const existing=await client.query(
   "select canonical_payload from public.investing_effective_beta_readiness where assessment_id=$1",[assessed.value.assessmentId]);if(!same(existing.rows[0]?.canonical_payload,
   assessed.value))throw new Error("release_gate_assessment_collision");value={...value,reused:true}}await client.query("commit");return {ok:true as const,value}
 }catch{try{await client.query("rollback")}catch{}return {ok:false as const,reason:"release_gate_persistence_failed"}}finally{client.release?.()}}}
