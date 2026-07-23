-- Supabase installs pgcrypto in the extensions schema. Investing functions keep
-- a deliberately restricted search_path, so qualify digest without widening it.
do $$
declare
  fn record;
  definition text;
  patched_count integer := 0;
begin
  if to_regprocedure('extensions.digest(bytea,text)') is null then
    if to_regprocedure('public.digest(bytea,text)') is null then
      raise exception 'investing_pgcrypto_digest_missing';
    end if;
    return;
  end if;

  for fn in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'investing\_%' escape '\'
      and position('digest(' in p.prosrc) > 0
    order by p.oid
  loop
    definition := pg_get_functiondef(fn.oid);
    definition := replace(definition, 'digest(', 'extensions.digest(');
    execute definition;
    patched_count := patched_count + 1;
  end loop;

  if patched_count = 0 then
    raise exception 'investing_pgcrypto_no_functions_patched';
  end if;
end
$$;
