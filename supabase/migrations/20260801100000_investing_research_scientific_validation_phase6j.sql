-- Phase 6J: immutable scientific validation reports and decisions.
begin;

create table public.investing_research_validation_reports (
  tenant_id uuid not null,
  owner_id text not null,
  portfolio_id text not null,
  account_id uuid not null,
  report_id text not null,
  experiment_id text not null,
  run_id text not null,
  dataset_version_id text not null,
  profile_version text not null,
  report_hash text not null,
  evaluated_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  canonical_payload jsonb not null,
  primary key(tenant_id,owner_id,portfolio_id,account_id,report_id),
  unique(tenant_id,owner_id,portfolio_id,account_id,report_hash),
  unique(tenant_id,owner_id,portfolio_id,account_id,report_id,experiment_id,run_id),
  constraint investing_research_validation_report_identity check (
    report_id='irval_v1_'||report_hash
    and report_hash ~ '^[a-f0-9]{64}$'
    and jsonb_typeof(canonical_payload)='object'
    and canonical_payload->>'contractVersion'='investing-validation-report/v1'
    and canonical_payload->>'reportId'=report_id
    and canonical_payload->>'experimentId'=experiment_id
    and canonical_payload->>'runId'=run_id
    and canonical_payload#>>'{dataset,datasetVersionId}'=dataset_version_id
    and canonical_payload#>>'{validationProfile,version}'=profile_version
    and canonical_payload#>>'{scope,tenantId}'=tenant_id::text
    and canonical_payload#>>'{scope,ownerId}'=owner_id
    and canonical_payload#>>'{scope,portfolioId}'=portfolio_id
    and canonical_payload#>>'{scope,accountId}'=account_id::text
  ),
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

create table public.investing_research_scientific_decisions (
  tenant_id uuid not null,
  owner_id text not null,
  portfolio_id text not null,
  account_id uuid not null,
  decision_id text not null,
  report_id text not null,
  experiment_id text not null,
  run_id text not null,
  outcome text not null,
  decision_hash text not null,
  decided_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  canonical_payload jsonb not null,
  primary key(tenant_id,owner_id,portfolio_id,account_id,decision_id),
  unique(tenant_id,owner_id,portfolio_id,account_id,decision_hash),
  unique(tenant_id,owner_id,portfolio_id,account_id,report_id),
  constraint investing_research_scientific_decision_identity check (
    decision_id='irdec_v1_'||decision_hash
    and decision_hash ~ '^[a-f0-9]{64}$'
    and outcome in ('rejected','inconclusive','validated','blocked','invalid')
    and jsonb_typeof(canonical_payload)='object'
    and canonical_payload->>'contractVersion'='investing-scientific-decision/v1'
    and canonical_payload->>'decisionId'=decision_id
    and canonical_payload->>'outcome'=outcome
    and canonical_payload->>'experimentId'=experiment_id
    and canonical_payload->>'runId'=run_id
    and canonical_payload#>>'{validationReport,reportId}'=report_id
    and canonical_payload#>>'{scope,tenantId}'=tenant_id::text
    and canonical_payload#>>'{scope,ownerId}'=owner_id
    and canonical_payload#>>'{scope,portfolioId}'=portfolio_id
    and canonical_payload#>>'{scope,accountId}'=account_id::text
  ),
  foreign key(tenant_id,owner_id,portfolio_id,account_id,report_id,experiment_id,run_id)
    references public.investing_research_validation_reports(
      tenant_id,owner_id,portfolio_id,account_id,report_id,experiment_id,run_id)
    on delete restrict
);

create function public.investing_research_phase6j_immutable_v1()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  raise exception using errcode='55000',
    message='investing_research_phase6j_scientific_record_immutable';
end $$;
create trigger investing_research_validation_report_immutable
before update or delete on public.investing_research_validation_reports
for each row execute function public.investing_research_phase6j_immutable_v1();
create trigger investing_research_scientific_decision_immutable
before update or delete on public.investing_research_scientific_decisions
for each row execute function public.investing_research_phase6j_immutable_v1();

create function public.investing_research_validation_persist_v1(
  p_tenant uuid,p_owner text,p_portfolio text,p_account uuid,
  p_report_id text,p_report_hash text,p_report jsonb,
  p_decision_id text,p_decision_hash text,p_decision jsonb
) returns table(report_payload jsonb,decision_payload jsonb,reused boolean)
language plpgsql security definer set search_path=pg_catalog,public as $$
declare existing_report public.investing_research_validation_reports%rowtype;
declare existing_decision public.investing_research_scientific_decisions%rowtype;
begin
  -- Serialize only an equivalent scoped scientific publication. This closes the
  -- select/insert race while preserving parallelism for unrelated evidence.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_tenant::text||E'\x1f'||p_owner||E'\x1f'||p_portfolio||E'\x1f'
      ||p_account::text||E'\x1f'||p_report_hash,0));
  select * into existing_report from public.investing_research_validation_reports
  where tenant_id=p_tenant and owner_id=p_owner and portfolio_id=p_portfolio
    and account_id=p_account and report_hash=p_report_hash for key share;
  if found then
    select * into existing_decision from public.investing_research_scientific_decisions
    where tenant_id=p_tenant and owner_id=p_owner and portfolio_id=p_portfolio
      and account_id=p_account and report_id=existing_report.report_id for key share;
    if existing_report.report_id<>p_report_id
      or existing_report.canonical_payload<>p_report
      or not found or existing_decision.decision_id<>p_decision_id
      or existing_decision.decision_hash<>p_decision_hash
      or existing_decision.canonical_payload<>p_decision then
      raise exception using errcode='23505',
        message='investing_research_validation_identity_collision';
    end if;
    return query select existing_report.canonical_payload,
      existing_decision.canonical_payload,true;
    return;
  end if;
  insert into public.investing_research_validation_reports(
    tenant_id,owner_id,portfolio_id,account_id,report_id,experiment_id,run_id,
    dataset_version_id,profile_version,report_hash,evaluated_at,canonical_payload)
  values(p_tenant,p_owner,p_portfolio,p_account,p_report_id,
    p_report->>'experimentId',p_report->>'runId',
    p_report#>>'{dataset,datasetVersionId}',
    p_report#>>'{validationProfile,version}',p_report_hash,
    (p_report->>'evaluatedAt')::timestamptz,p_report);
  insert into public.investing_research_scientific_decisions(
    tenant_id,owner_id,portfolio_id,account_id,decision_id,report_id,
    experiment_id,run_id,outcome,decision_hash,decided_at,canonical_payload)
  values(p_tenant,p_owner,p_portfolio,p_account,p_decision_id,p_report_id,
    p_decision->>'experimentId',p_decision->>'runId',p_decision->>'outcome',
    p_decision_hash,(p_decision->>'decidedAt')::timestamptz,p_decision);
  return query select p_report,p_decision,false;
end $$;

alter table public.investing_research_validation_reports enable row level security;
alter table public.investing_research_validation_reports force row level security;
alter table public.investing_research_scientific_decisions enable row level security;
alter table public.investing_research_scientific_decisions force row level security;
create policy investing_research_validation_reports_select_member
on public.investing_research_validation_reports for select to authenticated using
 (public.investing_research_has_exact_scope_v1(tenant_id,owner_id,portfolio_id,account_id));
create policy investing_research_scientific_decisions_select_member
on public.investing_research_scientific_decisions for select to authenticated using
 (public.investing_research_has_exact_scope_v1(tenant_id,owner_id,portfolio_id,account_id));
revoke all on public.investing_research_validation_reports,
  public.investing_research_scientific_decisions
  from public,anon,authenticated,service_role;
grant select on public.investing_research_validation_reports,
  public.investing_research_scientific_decisions to authenticated;
grant select,insert on public.investing_research_validation_reports,
  public.investing_research_scientific_decisions to service_role;
revoke all on function public.investing_research_validation_persist_v1(
  uuid,text,text,uuid,text,text,jsonb,text,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.investing_research_validation_persist_v1(
  uuid,text,text,uuid,text,text,jsonb,text,text,jsonb) to service_role;
commit;
