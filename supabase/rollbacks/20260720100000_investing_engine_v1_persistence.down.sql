-- Safe only before any FASE 4A run is retained. There is intentionally no
-- automated runtime purge or rollback path for audit-bearing data.
do $$
begin
  if exists (select 1 from public.investing_engine_runs limit 1) then
    raise exception using
      errcode = 'P0001',
      message = 'investing_engine_rollback_requires_empty_schema';
  end if;
end;
$$;

drop table if exists public.investing_engine_idempotency_keys;
drop table if exists public.investing_engine_shadow_packages;
drop table if exists public.investing_engine_reason_evidence;
drop table if exists public.investing_engine_phase_summaries;
drop table if exists public.investing_engine_artifacts;
drop table if exists public.investing_engine_runs;

drop function if exists public.investing_engine_assert_complete_run_v1();
drop function if exists public.investing_engine_validate_artifact_hash_owner_v1();
drop function if exists public.investing_engine_validate_run_scope_v1();
drop function if exists public.investing_engine_block_append_only_v1();
drop function if exists public.investing_engine_set_persistence_txid_v1();
