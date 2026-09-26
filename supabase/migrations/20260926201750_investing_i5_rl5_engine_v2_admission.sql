begin;

do $$
declare
  expected_current_user constant text := 'postgres';
begin
  if current_user <> expected_current_user then
    raise exception 'investing_i5_rl5_engine_v2_admission must be executed by %, got %', expected_current_user, current_user;
  end if;
end $$;

set local role investing_owner;

do $$
declare
  expected_v1 constant text := 'CHECK ((engine_version = ''ENGINE_V20260918''::text))';
  expected_closed constant text := 'CHECK ((engine_version = ANY (ARRAY[''ENGINE_V20260918''::text, ''ENGINE_V20260926''::text])))';
  item record;
begin
  for item in
    select *
    from (values
      ('investing'::name, 'research_execution_runs'::name, 'research_execution_runs_engine_version_check'::name),
      ('investing'::name, 'research_results_scientific_identities'::name, 'research_results_scientific_identities_engine_version_check'::name),
      ('investing'::name, 'research_validation_child_results_scientific_identities'::name, 'research_validation_child_results_scientif_engine_version_check'::name),
      ('investing'::name, 'research_validation_execution_runs'::name, 'research_validation_execution_runs_engine_version_check'::name),
      ('investing'::name, 'research_validation_run_inputs_scientific_identities'::name, 'research_validation_run_inputs_scientific__engine_version_check'::name)
    ) as expected(schema_name, relation_name, constraint_name)
  loop
    if not exists (
      select 1
      from pg_constraint c
      join pg_class r on r.oid = c.conrelid
      join pg_namespace n on n.oid = r.relnamespace
      where n.nspname = item.schema_name
        and r.relname = item.relation_name
        and c.conname = item.constraint_name
        and c.contype = 'c'
        and pg_get_constraintdef(c.oid) = expected_v1
    ) then
      raise exception 'unexpected prestate for %.% constraint %', item.schema_name, item.relation_name, item.constraint_name;
    end if;
  end loop;

  alter table investing.research_execution_runs
    drop constraint research_execution_runs_engine_version_check,
    add constraint research_execution_runs_engine_version_check
      check (engine_version in ('ENGINE_V20260918', 'ENGINE_V20260926'));

  alter table investing.research_results_scientific_identities
    drop constraint research_results_scientific_identities_engine_version_check,
    add constraint research_results_scientific_identities_engine_version_check
      check (engine_version in ('ENGINE_V20260918', 'ENGINE_V20260926'));

  alter table investing.research_validation_child_results_scientific_identities
    drop constraint research_validation_child_results_scientif_engine_version_check,
    add constraint research_validation_child_results_scientif_engine_version_check
      check (engine_version in ('ENGINE_V20260918', 'ENGINE_V20260926'));

  alter table investing.research_validation_execution_runs
    drop constraint research_validation_execution_runs_engine_version_check,
    add constraint research_validation_execution_runs_engine_version_check
      check (engine_version in ('ENGINE_V20260918', 'ENGINE_V20260926'));

  alter table investing.research_validation_run_inputs_scientific_identities
    drop constraint research_validation_run_inputs_scientific__engine_version_check,
    add constraint research_validation_run_inputs_scientific__engine_version_check
      check (engine_version in ('ENGINE_V20260918', 'ENGINE_V20260926'));

  for item in
    select *
    from (values
      ('investing'::name, 'research_execution_runs'::name, 'research_execution_runs_engine_version_check'::name),
      ('investing'::name, 'research_results_scientific_identities'::name, 'research_results_scientific_identities_engine_version_check'::name),
      ('investing'::name, 'research_validation_child_results_scientific_identities'::name, 'research_validation_child_results_scientif_engine_version_check'::name),
      ('investing'::name, 'research_validation_execution_runs'::name, 'research_validation_execution_runs_engine_version_check'::name),
      ('investing'::name, 'research_validation_run_inputs_scientific_identities'::name, 'research_validation_run_inputs_scientific__engine_version_check'::name)
    ) as expected(schema_name, relation_name, constraint_name)
  loop
    if not exists (
      select 1
      from pg_constraint c
      join pg_class r on r.oid = c.conrelid
      join pg_namespace n on n.oid = r.relnamespace
      where n.nspname = item.schema_name
        and r.relname = item.relation_name
        and c.conname = item.constraint_name
        and c.contype = 'c'
        and pg_get_constraintdef(c.oid) = expected_closed
    ) then
      raise exception 'unexpected poststate for %.% constraint %', item.schema_name, item.relation_name, item.constraint_name;
    end if;
  end loop;
end $$;

commit;
