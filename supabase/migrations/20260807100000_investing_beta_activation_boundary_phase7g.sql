-- Phase 7G: append-only human activation decisions. This does not deploy or enable Live.
begin;
create table public.investing_beta_activation_decisions(
 decision_id text primary key,decision_hash text unique not null,candidate_id text not null,
 assessment_id text not null,build_id text not null,target_environment text not null,
 action text not null,effective_state text not null,decided_at timestamptz not null,
 authenticated_user_id text not null,membership_id text not null,request_id text not null,
 canonical_payload jsonb not null,recorded_at timestamptz not null default statement_timestamp(),
 foreign key(candidate_id) references public.investing_release_candidates(candidate_id) on delete restrict,
 foreign key(assessment_id) references public.investing_effective_beta_readiness(assessment_id) on delete restrict,
 constraint investing_phase7g_decision_identity check(decision_id='irba_v1_'||decision_hash
  and decision_hash~'^[a-f0-9]{64}$' and target_environment in('preview','staging','production')
  and action in('activate','deactivate','engage_kill_switch','reset_kill_switch')
  and effective_state in('active','inactive','killed') and canonical_payload->>'decisionId'=decision_id
  and ((action='activate' and effective_state='active') or (action='engage_kill_switch' and effective_state='killed')
   or (action in('deactivate','reset_kill_switch') and effective_state='inactive'))
  and canonical_payload->>'candidateId'=candidate_id and canonical_payload->>'assessmentId'=assessment_id
  and canonical_payload->>'buildId'=build_id and canonical_payload->>'targetEnvironment'=target_environment
  and canonical_payload->>'action'=action and canonical_payload->>'effectiveState'=effective_state
  and canonical_payload#>>'{decidedBy,authenticatedUserId}'=authenticated_user_id
  and canonical_payload#>>'{decidedBy,membershipId}'=membership_id
  and canonical_payload#>>'{decidedBy,requestId}'=request_id));
create function public.investing_phase7g_immutable_v1() returns trigger language plpgsql set search_path=pg_catalog,public
as $$ begin raise exception using errcode='55000',message='investing_phase7g_decision_immutable'; end $$;
create trigger investing_beta_activation_decisions_immutable before update or delete on public.investing_beta_activation_decisions
 for each row execute function public.investing_phase7g_immutable_v1();
alter table public.investing_beta_activation_decisions enable row level security;
alter table public.investing_beta_activation_decisions force row level security;
revoke all on public.investing_beta_activation_decisions from public,anon,authenticated,service_role;
grant select,insert on public.investing_beta_activation_decisions to service_role;
commit;
