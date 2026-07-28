-- Phase 6G: reusable fenced orchestration applied only to Phase 6E acquisition jobs.
begin;

create function public.investing_research_retry_backoff_valid_v1(
  value integer[], maximum_attempts integer
) returns boolean language sql immutable
set search_path = pg_catalog
as $$
  select coalesce(cardinality(value) = maximum_attempts - 1, false)
    and coalesce((select bool_and(item between 0 and 3600)
      from unnest(value) item), true)
    and coalesce((select bool_and(value[index] <= value[index + 1])
      from generate_subscripts(value, 1) index
      where index < cardinality(value)), true)
$$;

alter table public.investing_research_acquisition_jobs
  add column retry_policy_version text not null
    default 'investing-research-orchestration-retry-policy/v1',
  add column max_attempts integer not null default 3,
  add column retry_backoff_seconds integer[] not null default array[5,30],
  add column execution_timeout_seconds integer not null default 300,
  add column not_before timestamptz not null default statement_timestamp(),
  add constraint investing_research_acquisition_retry_policy check (
    retry_policy_version = 'investing-research-orchestration-retry-policy/v1'
    and max_attempts between 1 and 10
    and execution_timeout_seconds between 15 and 3600
    and public.investing_research_retry_backoff_valid_v1(
      retry_backoff_seconds, max_attempts
    )
  ),
  add constraint investing_research_acquisition_lease_shape check (
    (state not in ('acquiring','acquired_raw','normalized'))
    or (
      lease_token ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,255}$'
      and lease_owner ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$'
      and leased_at is not null and heartbeat_at is not null and expires_at is not null
      and expires_at > leased_at
      and fencing_token between 1 and 9007199254740991
    )
  );

create index investing_research_acquisition_claimable_phase6g
  on public.investing_research_acquisition_jobs(not_before, requested_at)
  where state = 'requested';
create index investing_research_acquisition_expired_phase6g
  on public.investing_research_acquisition_jobs(expires_at)
  where state = 'acquiring';

create or replace function public.investing_research_acquisition_transition_guard_v1()
returns trigger language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if (new.tenant_id,new.owner_id,new.portfolio_id,new.account_id,new.request_id,
      new.acquisition_job_id,new.attempt,new.idempotency_key)
     is distinct from
     (old.tenant_id,old.owner_id,old.portfolio_id,old.account_id,old.request_id,
      old.acquisition_job_id,old.attempt,old.idempotency_key) then
    raise exception using errcode='23514', message='investing_research_acquisition_identity_immutable';
  end if;
  if new.state_version <> old.state_version + 1 then
    raise exception using errcode='40001', message='investing_research_acquisition_stale_state_version';
  end if;
  if new.state = old.state and old.state in ('acquiring','acquired_raw','normalized') then
    if old.state = 'acquiring' and old.expires_at < statement_timestamp()
       and new.lease_token is distinct from old.lease_token
       and new.fencing_token = old.fencing_token + 1
       and new.outcome is not distinct from old.outcome then
      return new;
    end if;
    if new.outcome is distinct from old.outcome
       or new.completed_at is distinct from old.completed_at
       or new.fencing_token <> old.fencing_token
       or new.lease_token is distinct from old.lease_token
       or new.lease_owner is distinct from old.lease_owner then
      raise exception using errcode='23514', message='investing_research_acquisition_heartbeat_invalid';
    end if;
    return new;
  end if;
  if not (case old.state
    when 'requested' then new.state = 'acquiring'
    when 'acquiring' then new.state in
      ('acquired_raw','confirmed_no_data','provider_unavailable','acquisition_failed','cancelled')
    when 'acquired_raw' then new.state in ('normalized','acquisition_failed')
    when 'normalized' then new.state in ('awaiting_quality','acquisition_failed')
    else false end) then
    raise exception using errcode='23514', message='investing_research_acquisition_transition_invalid';
  end if;
  return new;
end $$;

create function public.investing_research_acquisition_claim_v1(
  p_tenant_id uuid, p_owner_id text, p_portfolio_id text, p_account_id uuid,
  p_job_id text, p_lease_token text, p_lease_owner text, p_lease_seconds integer,
  p_policy_version text, p_max_attempts integer, p_backoff_seconds integer[],
  p_execution_timeout_seconds integer
) returns setof public.investing_research_acquisition_jobs
language sql security definer
set search_path = pg_catalog, public
as $$
  update public.investing_research_acquisition_jobs
  set state='acquiring',state_version=state_version+1,lease_token=p_lease_token,
      lease_owner=p_lease_owner,leased_at=statement_timestamp(),
      heartbeat_at=statement_timestamp(),
      expires_at=statement_timestamp()+make_interval(secs=>p_lease_seconds),
      fencing_token=coalesce(fencing_token,0)+1,
      retry_policy_version=case when attempt=1 and fencing_token is null
        then p_policy_version else retry_policy_version end,
      max_attempts=case when attempt=1 and fencing_token is null
        then p_max_attempts else max_attempts end,
      retry_backoff_seconds=case when attempt=1 and fencing_token is null
        then p_backoff_seconds else retry_backoff_seconds end,
      execution_timeout_seconds=case when attempt=1 and fencing_token is null
        then p_execution_timeout_seconds else execution_timeout_seconds end,
      updated_at=statement_timestamp(),
      started_at=coalesce(started_at,statement_timestamp())
  where tenant_id=p_tenant_id and owner_id=p_owner_id and portfolio_id=p_portfolio_id
    and account_id=p_account_id and acquisition_job_id=p_job_id
    and attempt<=case when attempt=1 and fencing_token is null
      then p_max_attempts else max_attempts end
    and ((attempt=1 and fencing_token is null) or (
      retry_policy_version=p_policy_version and max_attempts=p_max_attempts
      and retry_backoff_seconds=p_backoff_seconds
      and execution_timeout_seconds=p_execution_timeout_seconds
    ))
    and ((state='requested' and not_before<=statement_timestamp())
      or (state='acquiring' and expires_at<statement_timestamp()))
  returning *
$$;

create function public.investing_research_acquisition_claim_next_v1(
  p_tenant_id uuid, p_owner_id text, p_portfolio_id text, p_account_id uuid,
  p_lease_token text, p_lease_owner text, p_lease_seconds integer,
  p_policy_version text, p_max_attempts integer, p_backoff_seconds integer[],
  p_execution_timeout_seconds integer
) returns setof public.investing_research_acquisition_jobs
language sql security definer
set search_path = pg_catalog, public
as $$
  with candidate as (
    select acquisition_job_id
    from public.investing_research_acquisition_jobs
    where tenant_id=p_tenant_id and owner_id=p_owner_id
      and portfolio_id=p_portfolio_id and account_id=p_account_id
      and attempt<=case when attempt=1 and fencing_token is null
        then p_max_attempts else max_attempts end
      and ((attempt=1 and fencing_token is null) or (
        retry_policy_version=p_policy_version and max_attempts=p_max_attempts
        and retry_backoff_seconds=p_backoff_seconds
        and execution_timeout_seconds=p_execution_timeout_seconds
      ))
      and ((state='requested' and not_before<=statement_timestamp())
        or (state='acquiring' and expires_at<statement_timestamp()))
    order by case when state='acquiring' then 0 else 1 end,
      coalesce(expires_at,not_before),requested_at,acquisition_job_id
    for update skip locked
    limit 1
  )
  update public.investing_research_acquisition_jobs job
  set state='acquiring',state_version=job.state_version+1,lease_token=p_lease_token,
      lease_owner=p_lease_owner,leased_at=statement_timestamp(),
      heartbeat_at=statement_timestamp(),
      expires_at=statement_timestamp()+make_interval(secs=>p_lease_seconds),
      fencing_token=coalesce(job.fencing_token,0)+1,
      retry_policy_version=case when job.attempt=1 and job.fencing_token is null
        then p_policy_version else job.retry_policy_version end,
      max_attempts=case when job.attempt=1 and job.fencing_token is null
        then p_max_attempts else job.max_attempts end,
      retry_backoff_seconds=case when job.attempt=1 and job.fencing_token is null
        then p_backoff_seconds else job.retry_backoff_seconds end,
      execution_timeout_seconds=case when job.attempt=1 and job.fencing_token is null
        then p_execution_timeout_seconds else job.execution_timeout_seconds end,
      updated_at=statement_timestamp(),
      started_at=coalesce(job.started_at,statement_timestamp())
  from candidate
  where job.tenant_id=p_tenant_id and job.owner_id=p_owner_id
    and job.portfolio_id=p_portfolio_id and job.account_id=p_account_id
    and job.acquisition_job_id=candidate.acquisition_job_id
  returning job.*
$$;

create function public.investing_research_acquisition_heartbeat_v1(
  p_tenant_id uuid, p_owner_id text, p_portfolio_id text, p_account_id uuid,
  p_job_id text, p_lease_token text, p_lease_owner text, p_fencing_token bigint,
  p_state_version bigint, p_lease_seconds integer
) returns setof public.investing_research_acquisition_jobs
language sql security definer
set search_path = pg_catalog, public
as $$
  update public.investing_research_acquisition_jobs
  set state_version=state_version+1,heartbeat_at=statement_timestamp(),
      expires_at=statement_timestamp()+make_interval(secs=>p_lease_seconds),
      updated_at=statement_timestamp()
  where tenant_id=p_tenant_id and owner_id=p_owner_id and portfolio_id=p_portfolio_id
    and account_id=p_account_id and acquisition_job_id=p_job_id
    and lease_token=p_lease_token and lease_owner=p_lease_owner
    and fencing_token=p_fencing_token and state_version=p_state_version
    and state in ('acquiring','acquired_raw','normalized')
    and expires_at>=statement_timestamp()
  returning *
$$;

create function public.investing_research_acquisition_retry_v1(
  p_tenant_id uuid, p_owner_id text, p_portfolio_id text, p_account_id uuid,
  p_job_id text, p_lease_token text, p_lease_owner text, p_fencing_token bigint,
  p_state_version bigint, p_terminal_state text, p_outcome jsonb,
  p_next_job_id text
) returns table (
  scheduled boolean, next_job_id text, next_attempt integer,
  next_not_before timestamptz
)
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare current_job public.investing_research_acquisition_jobs%rowtype;
declare scheduled_job public.investing_research_acquisition_jobs%rowtype;
begin
  if p_terminal_state not in ('provider_unavailable','acquisition_failed')
     or coalesce((p_outcome->>'retryable')::boolean,false) is not true then
    return;
  end if;
  update public.investing_research_acquisition_jobs
  set state=p_terminal_state,outcome=p_outcome,state_version=state_version+1,
      completed_at=statement_timestamp(),updated_at=statement_timestamp()
  where tenant_id=p_tenant_id and owner_id=p_owner_id and portfolio_id=p_portfolio_id
    and account_id=p_account_id and acquisition_job_id=p_job_id
    and lease_token=p_lease_token and lease_owner=p_lease_owner
    and fencing_token=p_fencing_token and state_version=p_state_version
    and state='acquiring' and expires_at>=statement_timestamp()
  returning * into current_job;
  if not found then return; end if;
  if current_job.attempt >= current_job.max_attempts then
    return query select false,null::text,null::integer,null::timestamptz;
    return;
  end if;
  insert into public.investing_research_acquisition_jobs(
    tenant_id,owner_id,portfolio_id,account_id,acquisition_job_id,request_id,
    attempt,acquisition_policy_version,idempotency_key,requested_by,correlation_id,
    provider_preference,priority,state,state_version,requested_at,created_at,updated_at,
    retry_policy_version,max_attempts,retry_backoff_seconds,
    execution_timeout_seconds,not_before
  ) values (
    current_job.tenant_id,current_job.owner_id,current_job.portfolio_id,current_job.account_id,
    p_next_job_id,current_job.request_id,current_job.attempt+1,
    current_job.acquisition_policy_version,current_job.idempotency_key,
    current_job.requested_by,current_job.correlation_id,current_job.provider_preference,
    current_job.priority,'requested',0,statement_timestamp(),statement_timestamp(),
    statement_timestamp(),current_job.retry_policy_version,current_job.max_attempts,
    current_job.retry_backoff_seconds,
    current_job.execution_timeout_seconds,
    statement_timestamp()+make_interval(
      secs=>current_job.retry_backoff_seconds[current_job.attempt]
    )
  ) returning * into scheduled_job;
  return query select true,scheduled_job.acquisition_job_id,scheduled_job.attempt,
    scheduled_job.not_before;
end
$$;

create function public.investing_research_acquisition_finalize_v1(
  p_tenant_id uuid, p_owner_id text, p_portfolio_id text, p_account_id uuid,
  p_job_id text, p_lease_token text, p_lease_owner text, p_fencing_token bigint,
  p_state_version bigint, p_next_state text, p_outcome jsonb
) returns setof public.investing_research_acquisition_jobs
language sql security definer
set search_path = pg_catalog, public
as $$
  update public.investing_research_acquisition_jobs
  set state=p_next_state,outcome=p_outcome,state_version=state_version+1,
      completed_at=case when p_next_state in ('acquired_raw','normalized') then null
        else statement_timestamp() end,
      updated_at=statement_timestamp()
  where tenant_id=p_tenant_id and owner_id=p_owner_id and portfolio_id=p_portfolio_id
    and account_id=p_account_id and acquisition_job_id=p_job_id
    and lease_token=p_lease_token and lease_owner=p_lease_owner
    and fencing_token=p_fencing_token and state_version=p_state_version
    and expires_at>=statement_timestamp()
    and (
      (state='acquiring' and p_next_state in
        ('acquired_raw','confirmed_no_data','provider_unavailable','acquisition_failed'))
      or (state='acquired_raw' and p_next_state in ('normalized','acquisition_failed'))
      or (state='normalized' and p_next_state in ('awaiting_quality','acquisition_failed'))
    )
  returning *
$$;

create function public.investing_research_acquisition_cancel_v1(
  p_tenant_id uuid, p_owner_id text, p_portfolio_id text, p_account_id uuid,
  p_job_id text, p_state text, p_state_version bigint, p_outcome jsonb
) returns setof public.investing_research_acquisition_jobs
language sql security definer
set search_path = pg_catalog, public
as $$
  update public.investing_research_acquisition_jobs
  set state='cancelled',outcome=p_outcome,state_version=state_version+1,
      completed_at=statement_timestamp(),updated_at=statement_timestamp()
  where tenant_id=p_tenant_id and owner_id=p_owner_id and portfolio_id=p_portfolio_id
    and account_id=p_account_id and acquisition_job_id=p_job_id
    and state=p_state and state_version=p_state_version and state in ('requested','acquiring')
  returning *
$$;

revoke update on public.investing_research_acquisition_jobs from service_role;
revoke all on function public.investing_research_acquisition_claim_v1(uuid,text,text,uuid,text,text,text,integer,text,integer,integer[],integer)
  from public,anon,authenticated;
revoke all on function public.investing_research_acquisition_claim_next_v1(uuid,text,text,uuid,text,text,integer,text,integer,integer[],integer)
  from public,anon,authenticated;
revoke all on function public.investing_research_acquisition_heartbeat_v1(uuid,text,text,uuid,text,text,text,bigint,bigint,integer)
  from public,anon,authenticated;
revoke all on function public.investing_research_acquisition_finalize_v1(uuid,text,text,uuid,text,text,text,bigint,bigint,text,jsonb)
  from public,anon,authenticated;
revoke all on function public.investing_research_acquisition_cancel_v1(uuid,text,text,uuid,text,text,bigint,jsonb)
  from public,anon,authenticated;
revoke all on function public.investing_research_acquisition_retry_v1(uuid,text,text,uuid,text,text,text,bigint,bigint,text,jsonb,text)
  from public,anon,authenticated;
grant execute on function public.investing_research_acquisition_claim_v1(uuid,text,text,uuid,text,text,text,integer,text,integer,integer[],integer),
  public.investing_research_acquisition_claim_next_v1(uuid,text,text,uuid,text,text,integer,text,integer,integer[],integer),
  public.investing_research_acquisition_heartbeat_v1(uuid,text,text,uuid,text,text,text,bigint,bigint,integer),
  public.investing_research_acquisition_finalize_v1(uuid,text,text,uuid,text,text,text,bigint,bigint,text,jsonb),
  public.investing_research_acquisition_cancel_v1(uuid,text,text,uuid,text,text,bigint,jsonb),
  public.investing_research_acquisition_retry_v1(uuid,text,text,uuid,text,text,text,bigint,bigint,text,jsonb,text)
  to service_role;

comment on column public.investing_research_acquisition_jobs.fencing_token is
  'Phase 6G monotonically increasing per acquisition attempt; stale workers cannot mutate.';
commit;
