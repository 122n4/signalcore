-- Phase 6I: experiments, fenced runs and scientific jobs. No validation or promotion.
begin;

create table public.investing_research_experiments (
  tenant_id uuid not null,
  owner_id text not null,
  portfolio_id text not null,
  account_id uuid not null,
  experiment_id text not null,
  scientific_digest text not null,
  identity_version text not null,
  canonicalization_version text not null,
  hash_algorithm text not null,
  candidate_id text not null,
  candidate_version text not null,
  dataset_version_id text not null,
  created_at timestamptz not null,
  canonical_material text not null,
  primary key (tenant_id,owner_id,portfolio_id,account_id,experiment_id),
  unique (tenant_id,owner_id,portfolio_id,account_id,scientific_digest),
  unique (tenant_id,owner_id,portfolio_id,account_id,experiment_id,scientific_digest),
  constraint investing_research_experiment_identity check (
    experiment_id='irexp_v1_'||scientific_digest
    and scientific_digest ~ '^[a-f0-9]{64}$'
    and hash_algorithm='sha256'
    and identity_version='investing-scientific-identity/v1'
    and canonicalization_version='investing-research-canonical-json/v1'
    and canonical_material::jsonb #>> '{scientificScope,tenantId}'=tenant_id::text
    and canonical_material::jsonb #>> '{scientificScope,ownerId}'=owner_id
    and canonical_material::jsonb #>> '{scientificScope,portfolioId}'=portfolio_id
    and canonical_material::jsonb #>> '{scientificScope,accountId}'=account_id::text
    and canonical_material::jsonb ->> 'candidateId'=candidate_id
    and canonical_material::jsonb ->> 'candidateVersion'=candidate_version
    and canonical_material::jsonb ->> 'datasetVersionId'=dataset_version_id
  ),
  foreign key (tenant_id,owner_id,portfolio_id,account_id,candidate_id,candidate_version)
    references public.investing_research_candidates(
      tenant_id,owner_id,portfolio_id,account_id,candidate_id,candidate_version
    ) on delete restrict,
  foreign key (tenant_id,owner_id,portfolio_id,account_id,dataset_version_id)
    references public.investing_research_dataset_versions(
      tenant_id,owner_id,portfolio_id,account_id,dataset_version_id
    ) on delete restrict
);

create function public.investing_research_experiment_eligibility_guard_v1()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare candidate_state text;
declare latest_candidate_version text;
declare dataset_state text;
begin
  select state,candidate_version into candidate_state,latest_candidate_version
  from public.investing_research_candidates
  where tenant_id=new.tenant_id and owner_id=new.owner_id
    and portfolio_id=new.portfolio_id and account_id=new.account_id
    and candidate_id=new.candidate_id
  order by version_sequence desc limit 1 for key share;
  select quality_state into dataset_state
  from public.investing_research_dataset_versions
  where tenant_id=new.tenant_id and owner_id=new.owner_id
    and portfolio_id=new.portfolio_id and account_id=new.account_id
    and dataset_version_id=new.dataset_version_id for key share;
  if candidate_state is distinct from 'ready'
    or latest_candidate_version is distinct from new.candidate_version
    or dataset_state is distinct from 'research_ready' then
    raise exception using errcode='23514',
      message='investing_research_experiment_input_ineligible';
  end if;
  return new;
end $$;

create trigger investing_research_experiment_eligibility_guard
before insert on public.investing_research_experiments
for each row execute function public.investing_research_experiment_eligibility_guard_v1();
create trigger investing_research_experiment_immutable
before update or delete on public.investing_research_experiments
for each row execute function public.investing_research_immutable_guard_v1();

create table public.investing_research_experiment_runs (
  tenant_id uuid not null,
  owner_id text not null,
  portfolio_id text not null,
  account_id uuid not null,
  run_id text not null,
  experiment_id text not null,
  execution_id text not null,
  attempt integer not null,
  state text not null,
  state_version integer not null default 0,
  lease_token text,
  lease_owner text,
  leased_at timestamptz,
  heartbeat_at timestamptz,
  expires_at timestamptz,
  fencing_token bigint not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  result_hash text,
  canonical_result jsonb,
  failure_reason text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id,owner_id,portfolio_id,account_id,run_id),
  unique (tenant_id,owner_id,portfolio_id,account_id,experiment_id,attempt),
  unique (tenant_id,owner_id,portfolio_id,account_id,execution_id,attempt),
  unique (tenant_id,owner_id,portfolio_id,account_id,run_id,attempt),
  constraint investing_research_run_identity check (
    run_id ~ '^irrun_v1_[a-f0-9]{64}$'
    and execution_id ~ '^irexec_v1_[a-f0-9]{64}$'
    and attempt>0 and state_version>=0 and fencing_token>=0
  ),
  constraint investing_research_run_state check (
    state in ('defined','queued','leased','running','completed','failed','blocked','cancelled')
  ),
  constraint investing_research_run_lifecycle check (
    (state in ('defined','queued') and lease_token is null and lease_owner is null
      and leased_at is null and heartbeat_at is null and expires_at is null
      and started_at is null and completed_at is null and result_hash is null
      and canonical_result is null)
    or
    (state='leased' and lease_token is not null and lease_owner is not null
      and leased_at is not null and heartbeat_at is not null and expires_at>heartbeat_at
      and started_at is null and completed_at is null and result_hash is null
      and canonical_result is null)
    or
    (state='running' and lease_token is not null and lease_owner is not null
      and leased_at is not null and heartbeat_at is not null and expires_at>heartbeat_at
      and started_at is not null and completed_at is null and result_hash is null
      and canonical_result is null)
    or
    (state='completed' and started_at is not null and completed_at is not null
      and result_hash ~ '^[a-f0-9]{64}$' and jsonb_typeof(canonical_result)='object'
      and canonical_result->>'contractVersion'='investing-experiment-result-envelope/v1'
      and canonical_result->>'experimentId'=experiment_id
      and canonical_result->>'runId'=run_id
      and canonical_result->>'completionStatus'='completed'
      and canonical_result#>>'{scope,tenantId}'=tenant_id::text
      and canonical_result#>>'{scope,ownerId}'=owner_id
      and canonical_result#>>'{scope,portfolioId}'=portfolio_id
      and canonical_result#>>'{scope,accountId}'=account_id::text
      and failure_reason is null)
    or
    (state in ('failed','blocked','cancelled') and completed_at is not null
      and result_hash is null and canonical_result is null and failure_reason is not null)
  ),
  foreign key (tenant_id,owner_id,portfolio_id,account_id,experiment_id)
    references public.investing_research_experiments(
      tenant_id,owner_id,portfolio_id,account_id,experiment_id
    ) on delete restrict
);

create table public.investing_research_jobs (
  tenant_id uuid not null,
  owner_id text not null,
  portfolio_id text not null,
  account_id uuid not null,
  job_id text not null,
  experiment_id text not null,
  run_id text not null,
  idempotency_key text not null,
  state text not null,
  attempt integer not null,
  lease_token text,
  lease_owner text,
  leased_at timestamptz,
  heartbeat_at timestamptz,
  expires_at timestamptz,
  fencing_token bigint not null default 0,
  state_version integer not null default 0,
  not_before timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id,owner_id,portfolio_id,account_id,job_id),
  unique (tenant_id,owner_id,portfolio_id,account_id,idempotency_key),
  unique (tenant_id,owner_id,portfolio_id,account_id,run_id,attempt),
  constraint investing_research_job_identity check (
    job_id ~ '^irjob_v1_[a-f0-9]{64}$' and attempt>0
    and state_version>=0 and fencing_token>=0
  ),
  constraint investing_research_job_state check (
    state in ('queued','leased','running','completed','failed','blocked','cancelled')
  ),
  constraint investing_research_job_lease check (
    (state='queued' and lease_token is null and lease_owner is null
      and leased_at is null and heartbeat_at is null and expires_at is null)
    or
    (state in ('leased','running') and lease_token is not null and lease_owner is not null
      and leased_at is not null and heartbeat_at is not null and expires_at>heartbeat_at)
    or
    (state in ('completed','failed','blocked','cancelled')
      and expires_at is null and lease_token is null and lease_owner is null)
  ),
  foreign key (tenant_id,owner_id,portfolio_id,account_id,experiment_id)
    references public.investing_research_experiments(
      tenant_id,owner_id,portfolio_id,account_id,experiment_id
    ) on delete restrict,
  foreign key (tenant_id,owner_id,portfolio_id,account_id,run_id,attempt)
    references public.investing_research_experiment_runs(
      tenant_id,owner_id,portfolio_id,account_id,run_id,attempt
    ) on delete restrict
);

create index investing_research_jobs_claim_idx on public.investing_research_jobs
  (tenant_id,owner_id,portfolio_id,account_id,state,not_before,created_at)
  where state in ('queued','leased','running');

create function public.investing_research_job_claim_v1(
  p_tenant uuid,p_owner text,p_portfolio text,p_account uuid,p_job text,
  p_lease_token text,p_lease_owner text,p_lease_seconds integer
) returns setof public.investing_research_jobs language plpgsql
security definer set search_path=pg_catalog,public as $$
declare claimed public.investing_research_jobs%rowtype;
begin
  if p_lease_seconds<1 or p_lease_seconds>3600 or length(p_lease_token)<16
    or length(p_lease_owner)<1 then return; end if;
  select * into claimed from public.investing_research_jobs
  where tenant_id=p_tenant and owner_id=p_owner and portfolio_id=p_portfolio
    and account_id=p_account and job_id=p_job
    and not_before<=statement_timestamp()
    and (state='queued' or (state in ('leased','running') and expires_at<=statement_timestamp()))
  for update;
  if not found then return; end if;
  update public.investing_research_jobs set state='leased',
    lease_token=p_lease_token,lease_owner=p_lease_owner,
    leased_at=statement_timestamp(),heartbeat_at=statement_timestamp(),
    expires_at=statement_timestamp()+make_interval(secs=>p_lease_seconds),
    fencing_token=fencing_token+1,state_version=state_version+1,
    updated_at=statement_timestamp()
  where tenant_id=p_tenant and owner_id=p_owner and portfolio_id=p_portfolio
    and account_id=p_account and job_id=p_job returning * into claimed;
  update public.investing_research_experiment_runs set state='leased',
    lease_token=claimed.lease_token,lease_owner=claimed.lease_owner,
    leased_at=claimed.leased_at,heartbeat_at=claimed.heartbeat_at,
    expires_at=claimed.expires_at,fencing_token=claimed.fencing_token,
    state_version=state_version+1,updated_at=statement_timestamp()
  where tenant_id=p_tenant and owner_id=p_owner and portfolio_id=p_portfolio
    and account_id=p_account and run_id=claimed.run_id
    and state in ('defined','queued','leased','running');
  return next claimed;
end $$;

create function public.investing_research_job_heartbeat_v1(
  p_tenant uuid,p_owner text,p_portfolio text,p_account uuid,p_job text,
  p_lease_token text,p_lease_owner text,p_fence bigint,p_state_version integer,
  p_lease_seconds integer
) returns setof public.investing_research_jobs language sql
security definer set search_path=pg_catalog,public as $$
  update public.investing_research_jobs set heartbeat_at=statement_timestamp(),
    expires_at=statement_timestamp()+make_interval(secs=>p_lease_seconds),
    state_version=state_version+1,updated_at=statement_timestamp()
  where tenant_id=p_tenant and owner_id=p_owner and portfolio_id=p_portfolio
    and account_id=p_account and job_id=p_job and state in ('leased','running')
    and lease_token=p_lease_token and lease_owner=p_lease_owner
    and fencing_token=p_fence and state_version=p_state_version
    and expires_at>statement_timestamp() returning *
$$;

create function public.investing_research_job_start_v1(
  p_tenant uuid,p_owner text,p_portfolio text,p_account uuid,p_job text,
  p_lease_token text,p_lease_owner text,p_fence bigint,p_state_version integer
) returns setof public.investing_research_jobs language plpgsql
security definer set search_path=pg_catalog,public as $$
declare started public.investing_research_jobs%rowtype;
begin
  update public.investing_research_jobs set state='running',
    state_version=state_version+1,updated_at=statement_timestamp()
  where tenant_id=p_tenant and owner_id=p_owner and portfolio_id=p_portfolio
    and account_id=p_account and job_id=p_job and state='leased'
    and lease_token=p_lease_token and lease_owner=p_lease_owner
    and fencing_token=p_fence and state_version=p_state_version
    and expires_at>statement_timestamp() returning * into started;
  if not found then return; end if;
  update public.investing_research_experiment_runs set state='running',
    started_at=coalesce(started_at,statement_timestamp()),
    state_version=state_version+1,updated_at=statement_timestamp()
  where tenant_id=p_tenant and owner_id=p_owner and portfolio_id=p_portfolio
    and account_id=p_account and run_id=started.run_id and state='leased'
    and lease_token=p_lease_token and lease_owner=p_lease_owner
    and fencing_token=p_fence;
  if not found then raise exception using errcode='40001',
    message='investing_research_run_start_fence_mismatch'; end if;
  return next started;
end $$;

create function public.investing_research_job_cancel_v1(
  p_tenant uuid,p_owner text,p_portfolio text,p_account uuid,p_job text
) returns setof public.investing_research_jobs language plpgsql
security definer set search_path=pg_catalog,public as $$
declare cancelled public.investing_research_jobs%rowtype;
begin
  update public.investing_research_jobs set state='cancelled',
    state_version=state_version+1,updated_at=statement_timestamp()
  where tenant_id=p_tenant and owner_id=p_owner and portfolio_id=p_portfolio
    and account_id=p_account and job_id=p_job and state='queued'
    returning * into cancelled;
  if not found then return; end if;
  update public.investing_research_experiment_runs set state='cancelled',
    completed_at=statement_timestamp(),failure_reason='backtest_cancelled',
    state_version=state_version+1,updated_at=statement_timestamp()
  where tenant_id=p_tenant and owner_id=p_owner and portfolio_id=p_portfolio
    and account_id=p_account and run_id=cancelled.run_id and state='defined';
  if not found then raise exception using errcode='40001',
    message='investing_research_run_cancel_conflict'; end if;
  return next cancelled;
end $$;

create function public.investing_research_job_finalize_v1(
  p_tenant uuid,p_owner text,p_portfolio text,p_account uuid,p_job text,
  p_lease_token text,p_lease_owner text,p_fence bigint,p_state_version integer,
  p_state text,p_result_hash text,p_result jsonb,p_failure text
) returns setof public.investing_research_jobs language plpgsql
security definer set search_path=pg_catalog,public as $$
declare finalized public.investing_research_jobs%rowtype;
begin
  if p_state not in ('completed','failed','blocked','cancelled') then return; end if;
  update public.investing_research_jobs set state=p_state,lease_token=null,
    lease_owner=null,leased_at=null,heartbeat_at=null,expires_at=null,
    state_version=state_version+1,updated_at=statement_timestamp()
  where tenant_id=p_tenant and owner_id=p_owner and portfolio_id=p_portfolio
    and account_id=p_account and job_id=p_job and state in ('leased','running')
    and lease_token=p_lease_token and lease_owner=p_lease_owner
    and fencing_token=p_fence and state_version=p_state_version
    and expires_at>statement_timestamp() returning * into finalized;
  if not found then return; end if;
  update public.investing_research_experiment_runs set state=p_state,
    completed_at=statement_timestamp(),result_hash=p_result_hash,
    canonical_result=p_result,failure_reason=p_failure,
    lease_token=null,lease_owner=null,leased_at=null,heartbeat_at=null,expires_at=null,
    state_version=state_version+1,updated_at=statement_timestamp()
  where tenant_id=p_tenant and owner_id=p_owner and portfolio_id=p_portfolio
    and account_id=p_account and run_id=finalized.run_id
    and fencing_token=p_fence and state in ('leased','running');
  if not found then raise exception using errcode='40001',
    message='investing_research_run_finalize_fence_mismatch'; end if;
  return next finalized;
end $$;

create function public.investing_research_job_retry_v1(
  p_tenant uuid,p_owner text,p_portfolio text,p_account uuid,p_job text,
  p_fence bigint,p_next_run text,p_next_job text,p_maximum_attempts integer
) returns table(scheduled boolean,next_attempt integer,next_job_id text)
language plpgsql security definer set search_path=pg_catalog,public as $$
declare prior public.investing_research_jobs%rowtype;
declare prior_run public.investing_research_experiment_runs%rowtype;
begin
  if p_maximum_attempts<1 or p_maximum_attempts>10 then return; end if;
  select * into prior from public.investing_research_jobs
  where tenant_id=p_tenant and owner_id=p_owner and portfolio_id=p_portfolio
    and account_id=p_account and job_id=p_job and state='failed'
    and fencing_token=p_fence for key share;
  if not found then return; end if;
  if prior.attempt>=p_maximum_attempts then
    return query select false,null::integer,null::text; return;
  end if;
  select * into prior_run from public.investing_research_experiment_runs
  where tenant_id=p_tenant and owner_id=p_owner and portfolio_id=p_portfolio
    and account_id=p_account and run_id=prior.run_id and state='failed'
    and fencing_token=p_fence for key share;
  if not found then return; end if;
  insert into public.investing_research_experiment_runs(
    tenant_id,owner_id,portfolio_id,account_id,run_id,experiment_id,
    execution_id,attempt,state,created_at,updated_at)
  values(p_tenant,p_owner,p_portfolio,p_account,p_next_run,prior.experiment_id,
    prior_run.execution_id,prior.attempt+1,'defined',statement_timestamp(),statement_timestamp());
  insert into public.investing_research_jobs(
    tenant_id,owner_id,portfolio_id,account_id,job_id,experiment_id,run_id,
    idempotency_key,state,attempt,not_before,created_at,updated_at)
  values(p_tenant,p_owner,p_portfolio,p_account,p_next_job,prior.experiment_id,p_next_run,
    prior.idempotency_key||'/retry/'||(prior.attempt+1)::text,'queued',prior.attempt+1,
    statement_timestamp(),statement_timestamp(),statement_timestamp());
  return query select true,prior.attempt+1,p_next_job;
exception when unique_violation then
  return query select true,prior.attempt+1,j.job_id
  from public.investing_research_jobs j
  where j.tenant_id=p_tenant and j.owner_id=p_owner and j.portfolio_id=p_portfolio
    and j.account_id=p_account and j.run_id=p_next_run and j.attempt=prior.attempt+1;
end $$;

create function public.investing_research_phase6i_terminal_guard_v1()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if tg_op='DELETE' or old.state in ('completed','failed','blocked','cancelled') then
    raise exception using errcode='55000',
      message='investing_research_phase6i_terminal_history_immutable';
  end if;
  return new;
end $$;

create trigger investing_research_run_immutable_terminal
before update or delete on public.investing_research_experiment_runs
for each row execute function public.investing_research_phase6i_terminal_guard_v1();
create trigger investing_research_job_immutable_terminal
before update or delete on public.investing_research_jobs
for each row execute function public.investing_research_phase6i_terminal_guard_v1();

alter table public.investing_research_experiments enable row level security;
alter table public.investing_research_experiments force row level security;
alter table public.investing_research_experiment_runs enable row level security;
alter table public.investing_research_experiment_runs force row level security;
alter table public.investing_research_jobs enable row level security;
alter table public.investing_research_jobs force row level security;
create policy investing_research_experiments_select_member
on public.investing_research_experiments for select to authenticated using
 (public.investing_research_has_exact_scope_v1(tenant_id,owner_id,portfolio_id,account_id));
create policy investing_research_runs_select_member
on public.investing_research_experiment_runs for select to authenticated using
 (public.investing_research_has_exact_scope_v1(tenant_id,owner_id,portfolio_id,account_id));
create policy investing_research_jobs_select_member
on public.investing_research_jobs for select to authenticated using
 (public.investing_research_has_exact_scope_v1(tenant_id,owner_id,portfolio_id,account_id));
revoke all on public.investing_research_experiments,
  public.investing_research_experiment_runs,public.investing_research_jobs
  from public,anon,authenticated,service_role;
grant select on public.investing_research_experiments,
  public.investing_research_experiment_runs,public.investing_research_jobs to authenticated;
grant select,insert on public.investing_research_experiments,
  public.investing_research_experiment_runs,public.investing_research_jobs to service_role;
revoke all on function public.investing_research_job_claim_v1(uuid,text,text,uuid,text,text,text,integer)
  from public,anon,authenticated;
revoke all on function public.investing_research_job_heartbeat_v1(uuid,text,text,uuid,text,text,text,bigint,integer,integer)
  from public,anon,authenticated;
revoke all on function public.investing_research_job_start_v1(uuid,text,text,uuid,text,text,text,bigint,integer)
  from public,anon,authenticated;
revoke all on function public.investing_research_job_cancel_v1(uuid,text,text,uuid,text)
  from public,anon,authenticated;
revoke all on function public.investing_research_job_finalize_v1(uuid,text,text,uuid,text,text,text,bigint,integer,text,text,jsonb,text)
  from public,anon,authenticated;
revoke all on function public.investing_research_job_retry_v1(uuid,text,text,uuid,text,bigint,text,text,integer)
  from public,anon,authenticated;
grant execute on function public.investing_research_job_claim_v1(uuid,text,text,uuid,text,text,text,integer)
  to service_role;
grant execute on function public.investing_research_job_heartbeat_v1(uuid,text,text,uuid,text,text,text,bigint,integer,integer)
  to service_role;
grant execute on function public.investing_research_job_start_v1(uuid,text,text,uuid,text,text,text,bigint,integer)
  to service_role;
grant execute on function public.investing_research_job_cancel_v1(uuid,text,text,uuid,text)
  to service_role;
grant execute on function public.investing_research_job_finalize_v1(uuid,text,text,uuid,text,text,text,bigint,integer,text,text,jsonb,text)
  to service_role;
grant execute on function public.investing_research_job_retry_v1(uuid,text,text,uuid,text,bigint,text,text,integer)
  to service_role;
commit;
