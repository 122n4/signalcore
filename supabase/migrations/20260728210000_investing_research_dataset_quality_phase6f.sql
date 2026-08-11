begin;
create table public.investing_research_dataset_quality_reports (
  tenant_id uuid not null,
  owner_id text not null,
  portfolio_id text not null,
  account_id uuid not null,
  quality_report_id text not null,
  source_dataset_version_id text not null,
  request_id text not null,
  policy_version text not null,
  report_hash text not null,
  canonical_material text not null,
  outcome text not null,
  evaluated_at timestamptz not null,
  correlation_id text not null,
  canonical_payload jsonb not null,
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, owner_id, portfolio_id, account_id, quality_report_id),
  unique (tenant_id, owner_id, portfolio_id, account_id, source_dataset_version_id, policy_version, report_hash),
  unique (tenant_id, owner_id, portfolio_id, account_id, quality_report_id, source_dataset_version_id),
  constraint investing_research_quality_report_hash check (report_hash ~ '^[a-f0-9]{64}$'),
  constraint investing_research_quality_report_identity check (
    quality_report_id = 'irqrep_v1_' || report_hash
  ),
  constraint investing_research_quality_report_outcome check (
    outcome in ('invalid','incomplete','valid_not_research_ready','research_ready')
  ),
  constraint investing_research_quality_report_payload check (
    jsonb_typeof(canonical_payload) = 'object'
    and canonical_payload ->> 'sourceDatasetVersionId' = source_dataset_version_id
    and canonical_payload ->> 'requirementId' = request_id
    and canonical_payload ->> 'policyVersion' = policy_version
    and canonical_payload ->> 'outcome' = outcome
    and canonical_payload #>> '{scope,tenantId}' = tenant_id::text
    and canonical_payload #>> '{scope,ownerId}' = owner_id
    and canonical_payload #>> '{scope,portfolioId}' = portfolio_id
    and canonical_payload #>> '{scope,accountId}' = account_id::text
    and canonical_material::jsonb = canonical_payload
    and jsonb_typeof(canonical_payload -> 'gates') = 'array'
    and jsonb_array_length(canonical_payload -> 'gates') = 13
  ),
  foreign key (tenant_id, owner_id, portfolio_id, account_id, request_id)
    references public.investing_research_dataset_requests(
      tenant_id, owner_id, portfolio_id, account_id, request_id
    ) on delete restrict,
  foreign key (tenant_id, owner_id, portfolio_id, account_id, source_dataset_version_id)
    references public.investing_research_dataset_versions(
      tenant_id, owner_id, portfolio_id, account_id, dataset_version_id
    ) on delete restrict
);
alter table public.investing_research_dataset_versions
  add column quality_report_id text,
  add column source_dataset_version_id text;
alter table public.investing_research_dataset_versions
  drop constraint investing_research_dataset_version_state,
  drop constraint investing_research_dataset_version_payload;
alter table public.investing_research_dataset_versions
  add constraint investing_research_dataset_version_state check (
    (quality_state = 'awaiting_quality' and qualified_at is null
      and quality_report_id is null and source_dataset_version_id is null)
    or
    (quality_state = 'research_ready' and qualified_at is not null
      and quality_report_id is not null and source_dataset_version_id is not null)
  ),
  add constraint investing_research_dataset_version_payload check (
    jsonb_typeof(canonical_payload) = 'object'
    and canonical_payload ->> 'state' = quality_state
    and canonical_payload ->> 'requirementId' = request_id
    and canonical_payload ->> 'acquisitionJobId' = acquisition_job_id
    and (canonical_payload ->> 'acquisitionAttempt')::integer = acquisition_attempt
    and canonical_payload #>> '{storage,integrityState}' = 'verified'
    and canonical_payload #>> '{storage,normalizedContentHash}' = content_hash
    and canonical_payload #>> '{storage,key}' !~ '(^/|^[A-Za-z]:|(^|/)\.\.(/|$))'
    and (
      (quality_state = 'awaiting_quality'
        and not (canonical_payload ? 'qualityReportId')
        and not (canonical_payload ? 'sourceDatasetVersionId'))
      or
      (quality_state = 'research_ready'
        and canonical_payload ->> 'qualityReportId' = quality_report_id
        and canonical_payload ->> 'sourceDatasetVersionId' = source_dataset_version_id
        and (canonical_payload ->> 'qualifiedAt')::timestamptz = qualified_at)
    )
  ),
  add constraint investing_research_dataset_version_quality_report_fk
    foreign key (tenant_id, owner_id, portfolio_id, account_id, quality_report_id, source_dataset_version_id)
    references public.investing_research_dataset_quality_reports(
      tenant_id, owner_id, portfolio_id, account_id, quality_report_id, source_dataset_version_id
    ) on delete restrict,
  add constraint investing_research_dataset_version_source_fk
    foreign key (tenant_id, owner_id, portfolio_id, account_id, source_dataset_version_id)
    references public.investing_research_dataset_versions(
      tenant_id, owner_id, portfolio_id, account_id, dataset_version_id
    ) on delete restrict;
create or replace function public.investing_research_quality_publication_guard_v1()
returns trigger language plpgsql
set search_path = pg_catalog, public
as $$
declare report public.investing_research_dataset_quality_reports%rowtype;
declare source public.investing_research_dataset_versions%rowtype;
begin
  if new.quality_state <> 'research_ready' then return new; end if;
  select * into report from public.investing_research_dataset_quality_reports
    where tenant_id=new.tenant_id and owner_id=new.owner_id and portfolio_id=new.portfolio_id
      and account_id=new.account_id and quality_report_id=new.quality_report_id
      and source_dataset_version_id=new.source_dataset_version_id for key share;
  select * into source from public.investing_research_dataset_versions
    where tenant_id=new.tenant_id and owner_id=new.owner_id and portfolio_id=new.portfolio_id
      and account_id=new.account_id and dataset_version_id=new.source_dataset_version_id for key share;
  if report.outcome is distinct from 'research_ready'
    or source.quality_state is distinct from 'awaiting_quality'
    or report.request_id is distinct from new.request_id
    or source.request_id is distinct from new.request_id
    or source.content_hash is distinct from new.content_hash
    or source.canonical_payload->'storage' is distinct from new.canonical_payload->'storage' then
    raise exception using errcode='23514', message='investing_research_quality_publication_ineligible';
  end if;
  return new;
end $$;
create trigger investing_research_quality_publication_guard
before insert on public.investing_research_dataset_versions
for each row execute function public.investing_research_quality_publication_guard_v1();
create trigger investing_research_quality_report_immutable
before update or delete on public.investing_research_dataset_quality_reports
for each row execute function public.investing_research_immutable_guard_v1();
create or replace function public.investing_research_quality_sha256_v1(value text)
returns text language plpgsql immutable
set search_path = pg_catalog, public
as $$
declare result bytea;
begin
  if to_regprocedure('extensions.digest(bytea,text)') is not null then
    execute 'select extensions.digest(convert_to($1,''UTF8''),''sha256'')' into result using value;
  elsif to_regprocedure('public.digest(bytea,text)') is not null then
    execute 'select public.digest(convert_to($1,''UTF8''),''sha256'')' into result using value;
  else
    raise exception using errcode='55000', message='investing_research_quality_digest_unavailable';
  end if;
  return encode(result, 'hex');
end $$;
create or replace function public.investing_research_quality_report_guard_v1()
returns trigger language plpgsql
set search_path = pg_catalog, public
as $$
declare
expected text[] := array[
  'storage_integrity','coverage','calendar_session','gaps','duplicates','timezone',
  'stale_data','ohlcv_outliers','adjustment_policy','corporate_actions','look_ahead',
  'survivorship','provenance'
];
actual text[];
evidence_entry jsonb;
gate_entry jsonb;
evidence_id text;
evidence_bound boolean;
calculated text;
begin
  select array_agg(g->>'gateId' order by g->>'gateId') into actual
  from jsonb_array_elements(new.canonical_payload->'gates') g;
  select array_agg(x order by x) into expected from unnest(expected) x;
  if actual is distinct from expected then
    raise exception using errcode='23514', message='investing_research_quality_gate_matrix_invalid';
  end if;
  calculated := public.investing_research_quality_sha256_v1(
    'syntrake.investing.dataset-quality-report/v1' || chr(10) || new.canonical_material
  );
  if calculated is distinct from new.report_hash then
    raise exception using errcode='23514', message='investing_research_quality_report_hash_mismatch';
  end if;
  for evidence_entry in
    select evidence_items.item::jsonb
    from jsonb_array_elements(new.canonical_payload->'evidence') as evidence_items(item)
  loop
    if evidence_entry->>'canonicalMaterial' is null
      or (evidence_entry->>'canonicalMaterial')::jsonb is distinct from evidence_entry->'material' then
      raise exception using errcode='23514', message='investing_research_quality_evidence_canonical_mismatch';
    end if;
    calculated := public.investing_research_quality_sha256_v1(
      'syntrake.investing.quality-evidence/v1' || chr(10)
      || (evidence_entry->>'kind') || chr(10)
      || (evidence_entry->>'canonicalMaterial')
    );
    if calculated is distinct from evidence_entry->>'contentHash'
      or evidence_entry->>'evidenceId' is distinct from 'irqev_v1_' || calculated then
      raise exception using errcode='23514', message='investing_research_quality_evidence_hash_mismatch';
    end if;
  end loop;
  if new.outcome = 'research_ready' and exists (
    select 1 from jsonb_array_elements(new.canonical_payload->'gates') g
    where g->>'outcome' not in ('passed','not_applicable')
      or (g->>'outcome' = 'not_applicable' and coalesce(g->>'applicabilityRule','') not in (
        'corporate_actions_non_equity/v1','survivorship_single_instrument/v1'
      ))
  ) then
    raise exception using errcode='23514', message='investing_research_quality_research_ready_evidence_incomplete';
  end if;
  if new.outcome = 'research_ready' then
    for gate_entry in
      select gate_items.item
      from jsonb_array_elements(new.canonical_payload->'gates') as gate_items(item)
    loop
      if gate_entry->>'outcome' = 'passed' then
        if jsonb_typeof(gate_entry->'evidenceIds') <> 'array'
          or jsonb_array_length(gate_entry->'evidenceIds') = 0 then
          raise exception using errcode='23514',
            message='investing_research_quality_gate_evidence_unbound';
        end if;
        for evidence_id in
          select evidence_ids.item
          from jsonb_array_elements_text(gate_entry->'evidenceIds') as evidence_ids(item)
        loop
          select exists (
            select 1
            from jsonb_array_elements(new.canonical_payload->'evidence') as candidate(value)
            where candidate.value->>'evidenceId' = evidence_id
              and candidate.value->>'kind' = gate_entry->>'gateId'
          ) into evidence_bound;
          if not evidence_bound then
            raise exception using errcode='23514',
              message='investing_research_quality_gate_evidence_unbound';
          end if;
        end loop;
      end if;
    end loop;
  end if;
  return new;
end $$;
create trigger investing_research_quality_report_guard
before insert on public.investing_research_dataset_quality_reports
for each row execute function public.investing_research_quality_report_guard_v1();
alter table public.investing_research_dataset_quality_reports enable row level security;
alter table public.investing_research_dataset_quality_reports force row level security;
create policy investing_research_dataset_quality_reports_select_member
on public.investing_research_dataset_quality_reports for select to authenticated
using (public.investing_research_has_exact_scope_v1(tenant_id,owner_id,portfolio_id,account_id));
revoke all on table public.investing_research_dataset_quality_reports from public, anon, authenticated, service_role;
grant select on table public.investing_research_dataset_quality_reports to authenticated;
grant select, insert on table public.investing_research_dataset_quality_reports to service_role;
revoke all on function public.investing_research_quality_publication_guard_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.investing_research_quality_report_guard_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.investing_research_quality_sha256_v1(text)
  from public, anon, authenticated, service_role;
comment on table public.investing_research_dataset_quality_reports is
  'Phase 6F immutable evidence matrix; missing evidence is incomplete, never an implicit pass.';
comment on column public.investing_research_dataset_versions.quality_state is
  'Phase 6F permits awaiting_quality sources and immutable derived research_ready versions only.';
commit;
