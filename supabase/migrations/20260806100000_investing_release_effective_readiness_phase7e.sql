-- Phase 7E: release binding and effective readiness. No beta activation.
begin;
create table public.investing_release_candidates(
 candidate_id text primary key,candidate_hash text unique not null,commit_sha text not null,
 target_environment text not null,build_id text not null,created_at timestamptz not null,
 canonical_payload jsonb not null,recorded_at timestamptz not null default statement_timestamp(),
 constraint investing_phase7e_candidate_identity check(candidate_id='irrc_v1_'||candidate_hash
  and candidate_hash~'^[a-f0-9]{64}$' and commit_sha~'^[a-f0-9]{40}$'
  and target_environment in('preview','staging','production')
  and canonical_payload->>'candidateId'=candidate_id
  and canonical_payload#>>'{material,commitSha}'=commit_sha
  and canonical_payload#>>'{material,targetEnvironment}'=target_environment
  and canonical_payload#>>'{material,buildId}'=build_id));
create table public.investing_effective_beta_readiness(
 assessment_id text primary key,assessment_hash text unique not null,candidate_id text not null,
 report_hash text not null,target_environment text not null,state text not null,reason text,
 supersedes_assessment_id text references public.investing_effective_beta_readiness(assessment_id) on delete restrict,
 evaluated_at timestamptz not null,canonical_payload jsonb not null,
 recorded_at timestamptz not null default statement_timestamp(),
 foreign key(candidate_id) references public.investing_release_candidates(candidate_id) on delete restrict,
 foreign key(report_hash) references public.investing_research_beta_readiness_reports(report_hash) on delete restrict,
 constraint investing_phase7e_assessment_identity check(assessment_id='ireff_v1_'||assessment_hash
  and assessment_hash~'^[a-f0-9]{64}$' and state in('effective_beta_ready','blocked')
  and target_environment in('preview','staging','production')
  and canonical_payload->>'assessmentId'=assessment_id and canonical_payload->>'candidateId'=candidate_id
  and canonical_payload->>'reportHash'=report_hash and canonical_payload->>'state'=state));
create table public.investing_effective_readiness_revocations(
 revocation_id text primary key,revocation_hash text unique not null,assessment_id text unique not null,
 candidate_id text not null,reason text not null,revoked_at timestamptz not null,canonical_payload jsonb not null,
 recorded_at timestamptz not null default statement_timestamp(),
 foreign key(assessment_id) references public.investing_effective_beta_readiness(assessment_id) on delete restrict,
 foreign key(candidate_id) references public.investing_release_candidates(candidate_id) on delete restrict,
 constraint investing_phase7e_revocation_identity check(revocation_id='irev_v1_'||revocation_hash
  and revocation_hash~'^[a-f0-9]{64}$' and reason in('evidence_invalidated','build_invalidated',
   'configuration_invalidated','operator_revoked') and canonical_payload->>'revocationId'=revocation_id
  and canonical_payload->>'assessmentId'=assessment_id and canonical_payload->>'candidateId'=candidate_id));
create function public.investing_phase7e_immutable_v1() returns trigger language plpgsql
set search_path=pg_catalog,public as $$ begin raise exception using errcode='55000',
message='investing_phase7e_evidence_immutable'; end $$;
create trigger investing_release_candidates_immutable before update or delete on public.investing_release_candidates
 for each row execute function public.investing_phase7e_immutable_v1();
create trigger investing_effective_readiness_immutable before update or delete on public.investing_effective_beta_readiness
 for each row execute function public.investing_phase7e_immutable_v1();
create trigger investing_effective_revocations_immutable before update or delete on public.investing_effective_readiness_revocations
 for each row execute function public.investing_phase7e_immutable_v1();
alter table public.investing_release_candidates enable row level security;alter table public.investing_release_candidates force row level security;
alter table public.investing_effective_beta_readiness enable row level security;alter table public.investing_effective_beta_readiness force row level security;
alter table public.investing_effective_readiness_revocations enable row level security;alter table public.investing_effective_readiness_revocations force row level security;
revoke all on public.investing_release_candidates,public.investing_effective_beta_readiness,
 public.investing_effective_readiness_revocations from public,anon,authenticated,service_role;
grant select,insert on public.investing_release_candidates,public.investing_effective_beta_readiness,
 public.investing_effective_readiness_revocations to service_role;
commit;
