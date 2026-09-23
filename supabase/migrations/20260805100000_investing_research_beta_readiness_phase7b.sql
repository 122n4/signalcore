-- Phase 7B: immutable platform readiness evidence. No promotion or execution.
begin;
create table public.investing_research_beta_readiness_reports(
 report_hash text primary key,checkpoint text not null,evaluated_at timestamptz not null,
 state text not null,profile_id text not null,profile_version text not null,
 canonical_payload jsonb not null,created_at timestamptz not null default statement_timestamp(),
 constraint investing_research_phase7b_identity check(
  report_hash~'^[a-f0-9]{64}$' and checkpoint~'^[a-f0-9]{40,64}$'
  and state in('beta_ready','blocked')
  and canonical_payload#>>'{report,reportHash}'=report_hash
  and canonical_payload#>>'{report,checkpoint}'=checkpoint
  and canonical_payload#>>'{report,state}'=state
  and canonical_payload#>>'{report,profile,id}'=profile_id
  and canonical_payload#>>'{report,profile,version}'=profile_version)
);
create function public.investing_research_phase7b_immutable_v1()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin raise exception using errcode='55000',message='investing_research_phase7b_evidence_immutable'; end $$;
create trigger investing_research_beta_readiness_immutable before update or delete on
 public.investing_research_beta_readiness_reports for each row execute function
 public.investing_research_phase7b_immutable_v1();
alter table public.investing_research_beta_readiness_reports enable row level security;
alter table public.investing_research_beta_readiness_reports force row level security;
revoke all on public.investing_research_beta_readiness_reports from public,anon,authenticated,service_role;
grant select,insert on public.investing_research_beta_readiness_reports to service_role;
commit;
