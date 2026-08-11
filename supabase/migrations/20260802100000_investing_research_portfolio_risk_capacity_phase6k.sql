-- Phase 6K additive immutable portfolio/risk/liquidity/capacity evidence.
begin;
create table public.investing_research_portfolio_risk_capacity_assessments(
 tenant_id uuid not null,owner_id text not null,portfolio_id text not null,
 account_id uuid not null,assessment_id text not null,assessment_hash text not null,
 outcome text not null,profile_version text not null,evaluated_at timestamptz not null,
 created_at timestamptz not null default statement_timestamp(),
 canonical_payload jsonb not null,
 primary key(tenant_id,owner_id,portfolio_id,account_id,assessment_id),
 unique(tenant_id,owner_id,portfolio_id,account_id,assessment_hash),
 constraint investing_research_portfolio_risk_capacity_identity check(
  assessment_id='irprc_v1_'||assessment_hash
  and assessment_hash~'^[a-f0-9]{64}$'
  and outcome in('passed','failed','inconclusive','blocked')
  and canonical_payload->>'contractVersion'=
    'investing-portfolio-risk-capacity-assessment/v1'
  and canonical_payload->>'assessmentId'=assessment_id
  and canonical_payload->>'assessmentHash'=assessment_hash
  and canonical_payload->>'outcome'=outcome
  and canonical_payload#>>'{profile,version}'=profile_version
  and canonical_payload#>>'{scope,tenantId}'=tenant_id::text
  and canonical_payload#>>'{scope,ownerId}'=owner_id
  and canonical_payload#>>'{scope,portfolioId}'=portfolio_id
  and canonical_payload#>>'{scope,accountId}'=account_id::text
  and canonical_payload#>>'{scientificScope,tenantId}'=tenant_id::text
  and canonical_payload#>>'{scientificScope,ownerId}'=owner_id
  and canonical_payload#>>'{scientificScope,portfolioId}'=portfolio_id
  and canonical_payload#>>'{scientificScope,accountId}'=account_id::text)
);
create table public.investing_research_portfolio_risk_capacity_members(
 tenant_id uuid not null,owner_id text not null,portfolio_id text not null,
 account_id uuid not null,assessment_id text not null,decision_id text not null,
 report_id text not null,experiment_id text not null,run_id text not null,
 dataset_version_id text not null,candidate_id text not null,candidate_version text not null,
 allocation_weight double precision not null check(allocation_weight>0 and allocation_weight<=1),
 created_at timestamptz not null default statement_timestamp(),
 primary key(tenant_id,owner_id,portfolio_id,account_id,assessment_id,decision_id),
 foreign key(tenant_id,owner_id,portfolio_id,account_id,assessment_id)
  references public.investing_research_portfolio_risk_capacity_assessments(
   tenant_id,owner_id,portfolio_id,account_id,assessment_id) on delete restrict,
 foreign key(tenant_id,owner_id,portfolio_id,account_id,decision_id)
  references public.investing_research_scientific_decisions(
   tenant_id,owner_id,portfolio_id,account_id,decision_id) on delete restrict,
 foreign key(tenant_id,owner_id,portfolio_id,account_id,report_id)
  references public.investing_research_validation_reports(
   tenant_id,owner_id,portfolio_id,account_id,report_id) on delete restrict,
 foreign key(tenant_id,owner_id,portfolio_id,account_id,experiment_id)
  references public.investing_research_experiments(
   tenant_id,owner_id,portfolio_id,account_id,experiment_id) on delete restrict,
 foreign key(tenant_id,owner_id,portfolio_id,account_id,run_id)
  references public.investing_research_experiment_runs(
   tenant_id,owner_id,portfolio_id,account_id,run_id) on delete restrict,
 foreign key(tenant_id,owner_id,portfolio_id,account_id,dataset_version_id)
  references public.investing_research_dataset_versions(
   tenant_id,owner_id,portfolio_id,account_id,dataset_version_id) on delete restrict
);
create function public.investing_research_phase6k_member_chain_v1()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare payload jsonb;
begin
 select canonical_payload into payload
 from public.investing_research_scientific_decisions
 where tenant_id=new.tenant_id and owner_id=new.owner_id
  and portfolio_id=new.portfolio_id and account_id=new.account_id
  and decision_id=new.decision_id;
 if payload is null or payload#>>'{validationReport,reportId}'<>new.report_id
  or payload->>'experimentId'<>new.experiment_id
  or payload->>'runId'<>new.run_id
  or payload->>'datasetVersionId'<>new.dataset_version_id
  or payload->>'candidateId'<>new.candidate_id
  or payload->>'candidateVersion'<>new.candidate_version then
  raise exception using errcode='23514',
   message='investing_research_phase6k_member_chain_mismatch';
 end if;
 return new;
end $$;
create trigger investing_research_portfolio_risk_capacity_member_chain
before insert on public.investing_research_portfolio_risk_capacity_members
for each row execute function public.investing_research_phase6k_member_chain_v1();
create function public.investing_research_phase6k_immutable_v1()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin raise exception using errcode='55000',
 message='investing_research_phase6k_assessment_immutable'; end $$;
create trigger investing_research_portfolio_risk_capacity_immutable
before update or delete on public.investing_research_portfolio_risk_capacity_assessments
for each row execute function public.investing_research_phase6k_immutable_v1();
create trigger investing_research_portfolio_risk_capacity_member_immutable
before update or delete on public.investing_research_portfolio_risk_capacity_members
for each row execute function public.investing_research_phase6k_immutable_v1();
alter table public.investing_research_portfolio_risk_capacity_assessments
 enable row level security;
alter table public.investing_research_portfolio_risk_capacity_assessments
 force row level security;
alter table public.investing_research_portfolio_risk_capacity_members
 enable row level security;
alter table public.investing_research_portfolio_risk_capacity_members
 force row level security;
create policy investing_research_portfolio_risk_capacity_select_member
on public.investing_research_portfolio_risk_capacity_assessments for select
to authenticated using(public.investing_research_has_exact_scope_v1(
 tenant_id,owner_id,portfolio_id,account_id));
create policy investing_research_prc_members_select_member
on public.investing_research_portfolio_risk_capacity_members for select
to authenticated using(public.investing_research_has_exact_scope_v1(
 tenant_id,owner_id,portfolio_id,account_id));
revoke all on public.investing_research_portfolio_risk_capacity_assessments,
 public.investing_research_portfolio_risk_capacity_members
 from public,anon,authenticated,service_role;
grant select on public.investing_research_portfolio_risk_capacity_assessments,
 public.investing_research_portfolio_risk_capacity_members to authenticated;
grant select,insert on public.investing_research_portfolio_risk_capacity_assessments,
 public.investing_research_portfolio_risk_capacity_members to service_role;
commit;
