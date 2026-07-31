import {generateKeyPairSync,sign} from "node:crypto";import {Pool} from "pg";import {describe,expect,it} from "vitest";
import {canonicalizeResearchContract} from "@/lib/investing/research/contracts";import {BetaActivationService} from
 "@/lib/investing/research/readiness/activationBoundary.server";import {PostgresBetaActivationRepository} from
 "@/lib/investing/research/readiness/activationPostgresRepository.server";import {PostgresReleaseGateRepository} from
 "@/lib/investing/research/readiness/releaseGatePostgresRepository.server";import {ReleaseGateService} from
 "@/lib/investing/research/readiness/releaseGate.server";import {BETA_READINESS_ATTESTATION_VERSION,betaReadinessAttestationMaterial,
 TrustedBetaReadinessRuntime} from "@/lib/investing/research/readiness/trustedRuntime.server";import {BETA_READINESS_GATE_IDS,
 RELEASE_CANDIDATE_MATERIAL_VERSION,type BetaReadinessGateId} from "@/lib/investing/research/readiness";
const url=process.env.INVESTING_PG_TEST_URL;const pgDescribe=url?describe:describe.skip;
pgDescribe("Phase 7H vertical PostgreSQL beta gate",()=>{it("collects, binds, persists, serializes, kills, resets and reactivates",async()=>{
 const pool=new Pool({connectionString:url,max:5});try{const checkpoint="6".repeat(40),keys=generateKeyPairSync("ed25519");const issuers=
  BETA_READINESS_GATE_IDS.map(gateId=>({gateId,issuerId:`phase7h:${gateId}`,publicKey:keys.publicKey.export({type:"spki",format:"pem"}).toString()}));
 const source={async load({gateId,releaseCandidateId}:{gateId:BetaReadinessGateId;releaseCandidateId?:string}){const evidence={gateId,state:"passed" as const,checkpoint,
  observedAt:"2026-08-24T09:00:00.000Z",validUntil:"2026-08-25T09:00:00.000Z",reference:`release-candidate:${releaseCandidateId}:${gateId}`},issuerId=`phase7h:${gateId}`;
  const canonical=canonicalizeResearchContract(betaReadinessAttestationMaterial(issuerId,evidence));if(!canonical.ok)throw 0;return {
   contractVersion:BETA_READINESS_ATTESTATION_VERSION,issuerId,evidence,signature:sign(null,Buffer.from(canonical.value),keys.privateKey).toString("base64url")}}};
 const releaseService=new ReleaseGateService({authorize:async()=>({ok:true as const,value:{authenticatedUserId:"user_phase7h_release",
  membershipId:"phase7h-release-member",requestId:"phase7h-release-request"}})},new TrustedBetaReadinessRuntime(source,issuers,1000),
  new PostgresReleaseGateRepository(pool));const gateRequest={collection:{checkpoint,evaluatedAt:"2026-08-24T10:00:00.000Z",profile:{id:"phase7h",version:"v1"}},
  candidate:{contractVersion:RELEASE_CANDIDATE_MATERIAL_VERSION,commitSha:checkpoint,lockfileHash:"7".repeat(64),migrationsHash:"8".repeat(64),
   buildId:"phase7h-vertical-build",buildArtifactHash:"9".repeat(64),runtimeProfile:{id:"node",version:"v24"},targetEnvironment:"preview" as const,
   operationalConfigHash:"a".repeat(64),createdAt:"2026-08-24T10:00:00.000Z"},assessmentEvaluatedAt:"2026-08-24T11:00:00.000Z"};
 const assessed=await releaseService.assess(gateRequest),reused=await releaseService.assess(gateRequest);expect(assessed).toMatchObject({ok:true,
  value:{assessment:{state:"effective_beta_ready"},reused:false}});expect(reused).toMatchObject({ok:true,value:{reused:true}});if(!assessed.ok)throw 0;
 const activationRepository=new PostgresBetaActivationRepository(pool);const serviceA=new BetaActivationService({authorize:async()=>({ok:true as const,value:{
  authenticatedUserId:"user_phase7h_a",membershipId:"phase7h-member-a",tenantId:"phase7h-ops",requestId:"phase7h-request-a"}})},activationRepository);
 const serviceB=new BetaActivationService({authorize:async()=>({ok:true as const,value:{authenticatedUserId:"user_phase7h_b",membershipId:"phase7h-member-b",
  tenantId:"phase7h-ops",requestId:"phase7h-request-b"}})},activationRepository);const base={candidateId:assessed.value.candidate.candidateId,
  assessmentId:assessed.value.assessment.assessmentId,buildId:"phase7h-vertical-build",targetEnvironment:"preview" as const,
  rollbackReference:"phase7h-rollback",rollbackVerifiedAt:"2026-08-24T11:30:00.000Z",rollbackValidUntil:"2026-08-25T11:30:00.000Z",
  decisionReason:"phase7h-approved",changeTicket:"phase7h-ticket"};const concurrent=await Promise.all([serviceA.execute({...base,action:"activate" as const,
  allowlistedUserIds:["user_beta_a"],requestedAt:"2026-08-24T12:00:00.000Z"}),serviceB.execute({...base,action:"activate" as const,
  allowlistedUserIds:["user_beta_b"],requestedAt:"2026-08-24T12:00:00.000Z"})]);expect(concurrent.filter(v=>v.ok)).toHaveLength(1);
 const killed=await serviceB.execute({...base,action:"engage_kill_switch",allowlistedUserIds:[],requestedAt:"2026-08-24T12:01:00.000Z"});
 expect(killed).toMatchObject({ok:true,value:{effectiveState:"killed"}});expect(await serviceA.execute({...base,action:"activate",
  allowlistedUserIds:["user_beta_a"],requestedAt:"2026-08-24T12:02:00.000Z"})).toMatchObject({ok:false,reason:"beta_activation_containment_blocked"});
 expect(await serviceB.execute({...base,action:"reset_kill_switch",allowlistedUserIds:[],requestedAt:"2026-08-24T12:03:00.000Z"})).toMatchObject({ok:true,
  value:{effectiveState:"inactive"}});expect(await serviceA.execute({...base,action:"activate",allowlistedUserIds:["user_beta_a"],
  requestedAt:"2026-08-24T12:04:00.000Z"})).toMatchObject({ok:true,value:{effectiveState:"active"}});
 const blockedCheckpoint="b".repeat(40),blockedSource={async load({gateId,releaseCandidateId}:{gateId:BetaReadinessGateId;releaseCandidateId?:string}){if(gateId==="production_build")throw new Error("offline");
  const evidence={gateId,state:"passed" as const,checkpoint:blockedCheckpoint,observedAt:"2026-08-24T09:00:00.000Z",
   validUntil:"2026-08-25T09:00:00.000Z",reference:`release-candidate:${releaseCandidateId}:${gateId}`},issuerId=`phase7h:${gateId}`;const canonical=canonicalizeResearchContract(
   betaReadinessAttestationMaterial(issuerId,evidence));if(!canonical.ok)throw 0;return {contractVersion:BETA_READINESS_ATTESTATION_VERSION,issuerId,evidence,
   signature:sign(null,Buffer.from(canonical.value),keys.privateKey).toString("base64url")}}};const blockedService=new ReleaseGateService({authorize:async()=>({
  ok:true as const,value:{authenticatedUserId:"user_phase7h_release",membershipId:"phase7h-release-member",requestId:"phase7h-blocked-request"}})},
  new TrustedBetaReadinessRuntime(blockedSource,issuers,1000),new PostgresReleaseGateRepository(pool));const blocked=await blockedService.assess({
  collection:{checkpoint:blockedCheckpoint,evaluatedAt:"2026-08-24T10:00:00.000Z",profile:{id:"phase7h-blocked",version:"v1"}},candidate:{
   ...gateRequest.candidate,commitSha:blockedCheckpoint,buildId:"phase7h-blocked-build",targetEnvironment:"staging",createdAt:"2026-08-24T10:00:00.000Z"},
  assessmentEvaluatedAt:"2026-08-24T11:00:00.000Z"});expect(blocked).toMatchObject({ok:true,value:{assessment:{state:"blocked",reason:"report_blocked"}}});
 if(!blocked.ok)throw 0;const blockedActivation=new BetaActivationService({authorize:async()=>({ok:true as const,value:{authenticatedUserId:"user_phase7h_a",
  membershipId:"phase7h-member-a",tenantId:"phase7h-ops",requestId:"phase7h-blocked-activation"}})},activationRepository);expect(await blockedActivation.execute({
  candidateId:blocked.value.candidate.candidateId,assessmentId:blocked.value.assessment.assessmentId,buildId:"phase7h-blocked-build",targetEnvironment:"staging",
  action:"activate",allowlistedUserIds:["user_beta_a"],rollbackReference:"phase7h-rollback",rollbackVerifiedAt:"2026-08-24T11:30:00.000Z",
  rollbackValidUntil:"2026-08-25T11:30:00.000Z",decisionReason:"must-block",changeTicket:"phase7h-blocked-ticket",
  requestedAt:"2026-08-24T12:00:00.000Z"})).toMatchObject({ok:false,reason:"beta_activation_readiness_invalid"});const counts=await pool.query(`select
  (select count(*)::int from public.investing_research_beta_readiness_reports where report_hash=$1) reports,
  (select count(*)::int from public.investing_release_candidates where candidate_id=$2) candidates,
  (select count(*)::int from public.investing_effective_beta_readiness where assessment_id=$3) assessments`,[assessed.value.assessment.reportHash,
  assessed.value.candidate.candidateId,assessed.value.assessment.assessmentId]);expect(counts.rows[0]).toEqual({reports:1,candidates:1,assessments:1})
 }finally{await pool.end()}})});
