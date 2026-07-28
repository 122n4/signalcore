begin;
do $$
begin
  if exists (
    select 1 from public.investing_research_acquisition_jobs
    where state='acquiring' or fencing_token is not null or lease_token is not null
  ) then
    raise exception using errcode='55000', message='phase6g_rollback_refused_orchestration_state_exists';
  end if;
end $$;
drop index public.investing_research_acquisition_expired_phase6g;
drop index public.investing_research_acquisition_claimable_phase6g;
drop function public.investing_research_acquisition_cancel_v1(uuid,text,text,uuid,text,text,bigint,jsonb);
drop function public.investing_research_acquisition_retry_v1(uuid,text,text,uuid,text,text,text,bigint,bigint,text,jsonb,text);
drop function public.investing_research_acquisition_finalize_v1(uuid,text,text,uuid,text,text,text,bigint,bigint,text,jsonb);
drop function public.investing_research_acquisition_heartbeat_v1(uuid,text,text,uuid,text,text,text,bigint,bigint,integer);
drop function public.investing_research_acquisition_claim_next_v1(uuid,text,text,uuid,text,text,integer,text,integer,integer[],integer);
drop function public.investing_research_acquisition_claim_v1(uuid,text,text,uuid,text,text,text,integer,text,integer,integer[],integer);
alter table public.investing_research_acquisition_jobs
  drop constraint investing_research_acquisition_lease_shape,
  drop constraint investing_research_acquisition_retry_policy,
  drop column not_before,
  drop column execution_timeout_seconds,
  drop column retry_backoff_seconds,
  drop column max_attempts,
  drop column retry_policy_version;
drop function public.investing_research_retry_backoff_valid_v1(integer[],integer);
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
grant update on public.investing_research_acquisition_jobs to service_role;
commit;
