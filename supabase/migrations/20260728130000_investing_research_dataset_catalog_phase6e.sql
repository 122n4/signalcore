-- FASE 6E: additive materialization of the five frozen 6C data tables.
-- No network action, quality decision, Trading or legacy snapshot mutation.

alter table public.investing_accounts
  add constraint investing_accounts_phase6e_scope_parent_unique
  unique (tenant_id, owner_user_id, portfolio_id, id);

create table public.investing_research_dataset_requests (
  tenant_id uuid not null,
  owner_id text not null,
  portfolio_id text not null,
  account_id uuid not null,
  request_id text not null,
  contract_version text not null,
  request_hash text not null,
  state text not null default 'requested',
  created_at timestamptz not null,
  canonical_payload jsonb not null,
  primary key (tenant_id, owner_id, portfolio_id, account_id, request_id),
  unique (tenant_id, owner_id, portfolio_id, account_id, request_hash),
  constraint investing_research_dataset_request_hash check (request_hash ~ '^[a-f0-9]{64}$'),
  constraint investing_research_dataset_request_state check (state = 'requested'),
  constraint investing_research_dataset_request_payload check (
    jsonb_typeof(canonical_payload) = 'object'
    and canonical_payload ->> 'requirementId' = request_id
  ),
  foreign key (tenant_id, owner_id, portfolio_id, account_id)
    references public.investing_accounts(tenant_id, owner_user_id, portfolio_id, id)
    on delete restrict
);

create or replace function public.investing_research_jsonb_exact_keys_v1(
  value jsonb, expected text[]
) returns boolean
language sql immutable
set search_path = pg_catalog
as $$
  select jsonb_typeof(value) = 'object'
    and (select array_agg(key order by key) from jsonb_object_keys(value) key)
      = (select array_agg(key order by key) from unnest(expected) key)
$$;

create or replace function public.investing_research_acquisition_outcome_valid_v1(
  job_state text, value jsonb
) returns boolean
language sql immutable
set search_path = pg_catalog, public
as $$
  select case
    when job_state in ('requested','acquiring','acquired_raw','normalized') then value is null
    when value is null or jsonb_typeof(value) <> 'object' then false
    when job_state = 'awaiting_quality' then
      public.investing_research_jsonb_exact_keys_v1(value, array[
        'kind','provider','providerVersion','providerSymbol','providerRequestId',
        'sourceTimezone','rawHash','normalizedHash','recordCount','observedCoverage','storage'
      ])
      and value->>'kind' = 'acquired'
      and length(btrim(value->>'provider')) > 0
      and length(btrim(value->>'providerVersion')) > 0
      and length(btrim(value->>'providerSymbol')) > 0
      and length(btrim(value->>'sourceTimezone')) > 0
      and value->>'rawHash' ~ '^[a-f0-9]{64}$'
      and value->>'normalizedHash' ~ '^[a-f0-9]{64}$'
      and jsonb_typeof(value->'recordCount') = 'number'
      and (value->>'recordCount')::integer > 0
      and public.investing_research_jsonb_exact_keys_v1(
        value->'observedCoverage',
        array['observedStart','observedEnd','firstTimestamp','lastTimestamp']
      )
      and (value#>>'{observedCoverage,observedStart}')::timestamptz
        <= (value#>>'{observedCoverage,firstTimestamp}')::timestamptz
      and (value#>>'{observedCoverage,lastTimestamp}')::timestamptz
        <= (value#>>'{observedCoverage,observedEnd}')::timestamptz
      and (value#>>'{observedCoverage,firstTimestamp}')::timestamptz
        <= (value#>>'{observedCoverage,lastTimestamp}')::timestamptz
      and public.investing_research_jsonb_exact_keys_v1(
        value->'storage',
        array['contractVersion','key','rawContentHash','normalizedContentHash','mediaType','schemaVersion','byteSize','integrityState']
      )
      and value#>>'{storage,rawContentHash}' = value->>'rawHash'
      and value#>>'{storage,normalizedContentHash}' = value->>'normalizedHash'
      and value#>>'{storage,integrityState}' = 'verified'
      and value#>>'{storage,key}' !~ '(^/|^[A-Za-z]:|(^|/)\.\.(/|$))'
    when job_state = 'confirmed_no_data' then
      public.investing_research_jsonb_exact_keys_v1(
        value, array['kind','provider','providerRequestId','evidence','range']
      )
      and value->>'kind' = 'confirmed_no_data'
      and length(btrim(value->>'provider')) > 0
      and length(btrim(value->>'evidence')) > 0
      and public.investing_research_jsonb_exact_keys_v1(
        value->'range', array['startInclusive','endExclusive']
      )
      and (value#>>'{range,startInclusive}')::timestamptz
        < (value#>>'{range,endExclusive}')::timestamptz
    when job_state = 'provider_unavailable' then
      public.investing_research_jsonb_exact_keys_v1(
        value, array['kind','provider','classification','retryable','retryAfterSeconds']
      )
      and value->>'kind' = 'provider_unavailable'
      and length(btrim(value->>'provider')) > 0
      and length(btrim(value->>'classification')) > 0
      and jsonb_typeof(value->'retryable') = 'boolean'
      and (value->'retryAfterSeconds' = 'null'::jsonb
        or (jsonb_typeof(value->'retryAfterSeconds') = 'number'
          and (value->>'retryAfterSeconds')::integer >= 0))
    when job_state = 'acquisition_failed' and value->>'kind' = 'failed' then
      public.investing_research_jsonb_exact_keys_v1(
        value, array['kind','reasonCode','classification','retryable','sanitizedError']
      )
      and length(btrim(value->>'reasonCode')) > 0
      and length(btrim(value->>'classification')) > 0
      and jsonb_typeof(value->'retryable') = 'boolean'
      and length(btrim(value->>'sanitizedError')) > 0
    when job_state = 'acquisition_failed' and value->>'kind' = 'unsupported' then
      public.investing_research_jsonb_exact_keys_v1(value, array['kind','provider','reasonCode'])
      and length(btrim(value->>'provider')) > 0
      and length(btrim(value->>'reasonCode')) > 0
    when job_state = 'cancelled' then
      public.investing_research_jsonb_exact_keys_v1(value, array['kind','reasonCode'])
      and value->>'kind' = 'cancelled'
      and length(btrim(value->>'reasonCode')) > 0
    else false
  end
$$;

create table public.investing_research_acquisition_jobs (
  tenant_id uuid not null,
  owner_id text not null,
  portfolio_id text not null,
  account_id uuid not null,
  acquisition_job_id text not null,
  request_id text not null,
  attempt integer not null,
  acquisition_policy_version text not null,
  idempotency_key text not null,
  requested_by text not null,
  correlation_id text not null,
  provider_preference text,
  provider_used text,
  priority text not null,
  state text not null,
  state_version bigint not null default 0,
  requested_at timestamptz not null,
  started_at timestamptz,
  completed_at timestamptz,
  outcome jsonb,
  reason_code text,
  operational_provenance jsonb not null default '{}'::jsonb,
  rate_limit_metadata jsonb,
  provider_request_id text,
  lease_token text,
  lease_owner text,
  leased_at timestamptz,
  heartbeat_at timestamptz,
  expires_at timestamptz,
  fencing_token bigint,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, owner_id, portfolio_id, account_id, acquisition_job_id),
  unique (tenant_id, owner_id, portfolio_id, account_id, request_id, attempt),
  unique (tenant_id, owner_id, portfolio_id, account_id, request_id, acquisition_job_id, attempt),
  constraint investing_research_acquisition_attempt_positive check (attempt > 0),
  constraint investing_research_acquisition_state_version check (state_version >= 0),
  constraint investing_research_acquisition_priority check (priority in ('low','normal','high')),
  constraint investing_research_acquisition_state check (state in (
    'requested','acquiring','acquired_raw','normalized','awaiting_quality',
    'confirmed_no_data','provider_unavailable','acquisition_failed','cancelled'
  )),
  constraint investing_research_acquisition_no_future_state check (
    state not in ('valid','research_ready','scientifically_validated','promotion_eligible')
  ),
  constraint investing_research_acquisition_times check (
    created_at >= requested_at
    and updated_at >= created_at
    and (started_at is null or started_at >= requested_at)
    and (completed_at is null or completed_at >= coalesce(started_at, requested_at))
  ),
  constraint investing_research_acquisition_terminal_outcome check (
    public.investing_research_acquisition_outcome_valid_v1(state, outcome)
    and (
      (state in ('confirmed_no_data','provider_unavailable','acquisition_failed','cancelled','awaiting_quality') and completed_at is not null)
      or (state not in ('confirmed_no_data','provider_unavailable','acquisition_failed','cancelled','awaiting_quality') and completed_at is null)
    )
  ),
  constraint investing_research_acquisition_sanitized check (
    operational_provenance::text !~* '(api[_-]?key|authorization|bearer |https?://)'
    and coalesce(outcome::text, '') !~* '(api[_-]?key|authorization|bearer |https?://)'
  ),
  foreign key (tenant_id, owner_id, portfolio_id, account_id, request_id)
    references public.investing_research_dataset_requests(
      tenant_id, owner_id, portfolio_id, account_id, request_id
    ) on delete restrict
);

create or replace function public.investing_research_acquisition_attempt_guard_v1()
returns trigger language plpgsql
set search_path = pg_catalog, public
as $$
declare expected_attempt integer;
begin
  perform 1
  from public.investing_research_dataset_requests
  where tenant_id = new.tenant_id and owner_id = new.owner_id
    and portfolio_id = new.portfolio_id and account_id = new.account_id
    and request_id = new.request_id
  for update;
  if not found then
    raise exception using errcode='23503', message='investing_research_requirement_not_found';
  end if;
  select coalesce(max(attempt), 0) + 1 into expected_attempt
  from public.investing_research_acquisition_jobs
  where tenant_id = new.tenant_id and owner_id = new.owner_id
    and portfolio_id = new.portfolio_id and account_id = new.account_id
    and request_id = new.request_id;
  if new.attempt <> expected_attempt then
    raise exception using errcode='23514', message='investing_research_acquisition_attempt_not_next';
  end if;
  return new;
end $$;

create trigger investing_research_acquisition_attempt_guard
before insert on public.investing_research_acquisition_jobs
for each row execute function public.investing_research_acquisition_attempt_guard_v1();

create unique index investing_research_acquisition_active_idempotency
  on public.investing_research_acquisition_jobs(
    tenant_id, owner_id, portfolio_id, account_id, request_id,
    acquisition_policy_version
  )
  where state in ('requested','acquiring','acquired_raw','normalized');

create index investing_research_acquisition_request_history
  on public.investing_research_acquisition_jobs(
    tenant_id, owner_id, portfolio_id, account_id, request_id, attempt desc
  );

create table public.investing_research_datasets (
  tenant_id uuid not null,
  owner_id text not null,
  portfolio_id text not null,
  account_id uuid not null,
  dataset_id text not null,
  request_id text not null,
  dataset_contract_version text not null,
  state text not null default 'awaiting_quality',
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id, owner_id, portfolio_id, account_id, dataset_id),
  unique (tenant_id, owner_id, portfolio_id, account_id, request_id),
  constraint investing_research_dataset_state check (state = 'awaiting_quality'),
  foreign key (tenant_id, owner_id, portfolio_id, account_id, request_id)
    references public.investing_research_dataset_requests(
      tenant_id, owner_id, portfolio_id, account_id, request_id
    ) on delete restrict
);

create table public.investing_research_dataset_versions (
  tenant_id uuid not null,
  owner_id text not null,
  portfolio_id text not null,
  account_id uuid not null,
  dataset_version_id text not null,
  dataset_id text not null,
  request_id text not null,
  acquisition_job_id text not null,
  acquisition_attempt integer not null,
  manifest_hash text not null,
  content_hash text not null,
  schema_version text not null,
  quality_state text not null,
  qualified_at timestamptz,
  canonical_payload jsonb not null,
  primary key (tenant_id, owner_id, portfolio_id, account_id, dataset_version_id),
  unique (tenant_id, owner_id, portfolio_id, account_id, dataset_id, manifest_hash, content_hash),
  constraint investing_research_dataset_version_hashes check (
    manifest_hash ~ '^[a-f0-9]{64}$' and content_hash ~ '^[a-f0-9]{64}$'
  ),
  constraint investing_research_dataset_version_state check (
    quality_state = 'awaiting_quality' and qualified_at is null
  ),
  constraint investing_research_dataset_version_attempt check (acquisition_attempt > 0),
  constraint investing_research_dataset_version_payload check (
    jsonb_typeof(canonical_payload) = 'object'
    and canonical_payload ->> 'state' = 'awaiting_quality'
    and canonical_payload ->> 'requirementId' = request_id
    and canonical_payload ->> 'acquisitionJobId' = acquisition_job_id
    and (canonical_payload ->> 'acquisitionAttempt')::integer = acquisition_attempt
    and canonical_payload #>> '{storage,integrityState}' = 'verified'
    and canonical_payload #>> '{storage,normalizedContentHash}' = content_hash
    and canonical_payload #>> '{storage,key}' !~ '(^/|^[A-Za-z]:|(^|/)\.\.(/|$))'
  ),
  foreign key (tenant_id, owner_id, portfolio_id, account_id, dataset_id)
    references public.investing_research_datasets(
      tenant_id, owner_id, portfolio_id, account_id, dataset_id
    ) on delete restrict,
  foreign key (tenant_id, owner_id, portfolio_id, account_id, request_id)
    references public.investing_research_dataset_requests(
      tenant_id, owner_id, portfolio_id, account_id, request_id
    ) on delete restrict,
  foreign key (tenant_id, owner_id, portfolio_id, account_id, request_id, acquisition_job_id, acquisition_attempt)
    references public.investing_research_acquisition_jobs(
      tenant_id, owner_id, portfolio_id, account_id, request_id, acquisition_job_id, attempt
    ) on delete restrict
);

create table public.investing_research_dataset_lineage (
  tenant_id uuid not null,
  owner_id text not null,
  portfolio_id text not null,
  account_id uuid not null,
  lineage_event_id text not null,
  parent_dataset_version_id text not null,
  child_dataset_version_id text not null,
  transformation_version text not null,
  event_hash text not null,
  created_at timestamptz not null default statement_timestamp(),
  canonical_payload jsonb not null,
  primary key (tenant_id, owner_id, portfolio_id, account_id, lineage_event_id),
  unique (tenant_id, owner_id, portfolio_id, account_id, event_hash),
  constraint investing_research_lineage_distinct check (
    parent_dataset_version_id <> child_dataset_version_id
    and event_hash ~ '^[a-f0-9]{64}$'
  ),
  foreign key (tenant_id, owner_id, portfolio_id, account_id, parent_dataset_version_id)
    references public.investing_research_dataset_versions(
      tenant_id, owner_id, portfolio_id, account_id, dataset_version_id
    ) on delete restrict,
  foreign key (tenant_id, owner_id, portfolio_id, account_id, child_dataset_version_id)
    references public.investing_research_dataset_versions(
      tenant_id, owner_id, portfolio_id, account_id, dataset_version_id
    ) on delete restrict
);

create or replace function public.investing_research_dataset_version_job_guard_v1()
returns trigger language plpgsql
set search_path = pg_catalog, public
as $$
declare job public.investing_research_acquisition_jobs%rowtype;
begin
  select * into job
  from public.investing_research_acquisition_jobs
  where tenant_id = new.tenant_id and owner_id = new.owner_id
    and portfolio_id = new.portfolio_id and account_id = new.account_id
    and request_id = new.request_id
    and acquisition_job_id = new.acquisition_job_id
    and attempt = new.acquisition_attempt
  for key share;
  if not found or job.state <> 'awaiting_quality' or job.outcome->>'kind' <> 'acquired' then
    raise exception using errcode='23514', message='investing_research_dataset_version_job_not_eligible';
  end if;
  if job.outcome->>'rawHash' <> new.canonical_payload#>>'{storage,rawContentHash}'
    or job.outcome->>'normalizedHash' <> new.canonical_payload#>>'{storage,normalizedContentHash}'
    or (job.outcome->>'recordCount')::integer <> (new.canonical_payload#>>'{coverage,recordCount}')::integer
    or job.outcome#>>'{observedCoverage,observedStart}' <> new.canonical_payload#>>'{coverage,observedStart}'
    or job.outcome#>>'{observedCoverage,observedEnd}' <> new.canonical_payload#>>'{coverage,observedEnd}'
    or job.outcome#>>'{observedCoverage,firstTimestamp}' <> new.canonical_payload#>>'{coverage,firstTimestamp}'
    or job.outcome#>>'{observedCoverage,lastTimestamp}' <> new.canonical_payload#>>'{coverage,lastTimestamp}'
    or job.outcome->>'provider' <> new.canonical_payload#>>'{provider,id}'
    or job.outcome->>'providerVersion' <> new.canonical_payload#>>'{provider,version}'
    or job.outcome->>'providerSymbol' <> new.canonical_payload#>>'{provider,symbol}'
    or coalesce(job.outcome->>'providerRequestId','') <> coalesce(new.canonical_payload#>>'{provider,requestId}','')
    or job.outcome->>'sourceTimezone' <> new.canonical_payload->>'sourceTimezone'
    or job.outcome->'storage' <> new.canonical_payload->'storage' then
    raise exception using errcode='23514', message='investing_research_dataset_version_job_material_mismatch';
  end if;
  return new;
end $$;

create trigger investing_research_dataset_version_job_guard
before insert on public.investing_research_dataset_versions
for each row execute function public.investing_research_dataset_version_job_guard_v1();

create or replace function public.investing_research_acquisition_transition_guard_v1()
returns trigger language plpgsql
set search_path = pg_catalog, public
as $$
declare allowed boolean;
begin
  if new.attempt <> old.attempt or new.request_id <> old.request_id
     or new.tenant_id <> old.tenant_id or new.owner_id <> old.owner_id
     or new.portfolio_id <> old.portfolio_id or new.account_id <> old.account_id then
    raise exception using errcode='23514', message='investing_research_acquisition_identity_immutable';
  end if;
  if new.state_version <> old.state_version + 1 then
    raise exception using errcode='40001', message='investing_research_acquisition_stale_state_version';
  end if;
  allowed := case old.state
    when 'requested' then new.state in ('acquiring','cancelled')
    when 'acquiring' then new.state in ('acquired_raw','confirmed_no_data','provider_unavailable','acquisition_failed','cancelled')
    when 'acquired_raw' then new.state in ('normalized','acquisition_failed')
    when 'normalized' then new.state in ('awaiting_quality','acquisition_failed')
    else false end;
  if not allowed then
    raise exception using errcode='23514', message='investing_research_acquisition_transition_invalid';
  end if;
  new.updated_at := statement_timestamp();
  return new;
end $$;

create trigger investing_research_acquisition_transition_guard
before update on public.investing_research_acquisition_jobs
for each row execute function public.investing_research_acquisition_transition_guard_v1();

create or replace function public.investing_research_immutable_guard_v1()
returns trigger language plpgsql
set search_path = pg_catalog, public
as $$ begin
  raise exception using errcode='55000', message='investing_research_immutable';
end $$;

create trigger investing_research_dataset_request_immutable
before update or delete on public.investing_research_dataset_requests
for each row execute function public.investing_research_immutable_guard_v1();
create trigger investing_research_dataset_immutable
before update or delete on public.investing_research_datasets
for each row execute function public.investing_research_immutable_guard_v1();
create trigger investing_research_dataset_version_immutable
before update or delete on public.investing_research_dataset_versions
for each row execute function public.investing_research_immutable_guard_v1();
create trigger investing_research_lineage_immutable
before update or delete on public.investing_research_dataset_lineage
for each row execute function public.investing_research_immutable_guard_v1();

create or replace function public.investing_research_has_exact_scope_v1(
  p_tenant_id uuid, p_owner_id text, p_portfolio_id text, p_account_id uuid
) returns boolean
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select count(*) = 1
  from public.investing_accounts a
  where a.tenant_id = p_tenant_id
    and a.owner_user_id = p_owner_id
    and a.portfolio_id = p_portfolio_id
    and a.id = p_account_id
    and public.investing_has_scope_permission_v1(
      p_tenant_id, p_owner_id, 'investing:read'
    )
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'investing_research_dataset_requests','investing_research_acquisition_jobs',
    'investing_research_datasets','investing_research_dataset_versions',
    'investing_research_dataset_lineage'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (
        public.investing_research_has_exact_scope_v1(
          tenant_id, owner_id, portfolio_id, account_id
        )
      )', t || '_select_member', t
    );
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('grant select, insert, update on table public.%I to service_role', t);
  end loop;
end $$;

revoke all on function public.investing_research_acquisition_transition_guard_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.investing_research_immutable_guard_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.investing_research_has_exact_scope_v1(uuid,text,text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.investing_research_has_exact_scope_v1(uuid,text,text,uuid)
  to authenticated;

comment on table public.investing_research_acquisition_jobs is
  'Phase 6E: one append-retained row per acquisition attempt; no network trigger.';
comment on column public.investing_research_dataset_versions.quality_state is
  'Phase 6E permits awaiting_quality only; Phase 6F owns future qualification.';
