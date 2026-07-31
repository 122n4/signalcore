import "server-only";import {canonicalizeResearchContract} from "../contracts";import type {ScopedSqlPool} from
 "../dataset-catalog/postgresRepository.server";import {decideBetaActivation,type BetaActivationRepository} from "./activationBoundary.server";
import type {BetaActivationAuthority,BetaActivationDecision,BetaActivationRequest,BetaActivationState} from "./activationTypes";
const plain=(v:unknown)=>typeof v==="object"&&v!==null&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
export class PostgresBetaActivationRepository implements BetaActivationRepository{constructor(private readonly pool:ScopedSqlPool){}
 async decide(request:BetaActivationRequest,authority:BetaActivationAuthority){const client=await this.pool.connect();try{await client.query("begin");
  await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[request.targetEnvironment]);const result=await client.query(
  `select c.canonical_payload candidate,a.canonical_payload assessment,r.canonical_payload revocation,
   d.canonical_payload latest_decision,k.effective_state kill_switch_state from public.investing_release_candidates c
   join public.investing_effective_beta_readiness a on a.candidate_id=c.candidate_id
   left join public.investing_effective_readiness_revocations r on r.assessment_id=a.assessment_id
   left join lateral(select canonical_payload from public.investing_beta_activation_decisions
    where target_environment=$4 order by recorded_at desc,decision_id desc limit 1)d on true
   left join lateral(select effective_state from public.investing_beta_activation_decisions where target_environment=$4
    and action in('engage_kill_switch','reset_kill_switch')order by recorded_at desc,decision_id desc limit 1)k on true
   where c.candidate_id=$1 and a.assessment_id=$2 and c.build_id=$3 and c.target_environment=$4
   and ($5 not in('activate','reset_kill_switch') or not exists(select 1 from public.investing_effective_beta_readiness newer where
    newer.target_environment=a.target_environment and (newer.evaluated_at,newer.assessment_id)>(a.evaluated_at,a.assessment_id)))`,
   [request.candidateId,request.assessmentId,request.buildId,request.targetEnvironment,request.action]);
  if(result.rows.length!==1||!plain(result.rows[0].candidate)||!plain(result.rows[0].assessment)
   ||(result.rows[0].revocation!==null&&!plain(result.rows[0].revocation))
   ||(result.rows[0].latest_decision!==null&&!plain(result.rows[0].latest_decision))){await client.query("rollback");
   return {ok:false as const,reason:"beta_activation_authoritative_state_missing"}}
  const state:BetaActivationState={candidate:result.rows[0].candidate as BetaActivationState["candidate"],
   assessment:result.rows[0].assessment as BetaActivationState["assessment"],
   revocation:result.rows[0].revocation as BetaActivationState["revocation"],
   latestDecision:result.rows[0].latest_decision as BetaActivationState["latestDecision"]};const killed=result.rows[0].kill_switch_state==="killed";
  const decision=decideBetaActivation({request,authority,state,killSwitchEngaged:killed});if(!decision.ok){await client.query("rollback");return decision}
  const inserted=await client.query(`insert into public.investing_beta_activation_decisions(decision_id,decision_hash,
   candidate_id,assessment_id,build_id,target_environment,action,effective_state,decided_at,authenticated_user_id,
   membership_id,request_id,canonical_payload)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
   on conflict(decision_id) do nothing returning canonical_payload`,[decision.value.decisionId,decision.value.decisionHash,
   decision.value.candidateId,decision.value.assessmentId,decision.value.buildId,decision.value.targetEnvironment,
   decision.value.action,decision.value.effectiveState,decision.value.decidedAt,authority.authenticatedUserId,
   authority.membershipId,authority.requestId,JSON.stringify(decision.value)]);let value:BetaActivationDecision=decision.value;
  if(inserted.rows.length===0){const existing=await client.query("select canonical_payload from public.investing_beta_activation_decisions where decision_id=$1",[decision.value.decisionId]);
   const a=canonicalizeResearchContract(existing.rows[0]?.canonical_payload),b=canonicalizeResearchContract(decision.value);
   if(!a.ok||!b.ok||a.value!==b.value)throw new Error("beta_activation_identity_collision");value=existing.rows[0].canonical_payload as BetaActivationDecision}
  await client.query("commit");return {ok:true as const,value}}catch{try{await client.query("rollback")}catch{}throw new Error("beta_activation_transaction_failed")}
  finally{client.release?.()}}
}
