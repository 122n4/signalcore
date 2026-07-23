-- Safe R2 rollback: restore the R1 authorization semantics and remove the
-- new-write v3 constraint. The nullable marker column is intentionally kept
-- so rollback never discards version evidence from rows already written.

alter table if exists public.investing_engine_runs
  drop constraint if exists investing_engine_runs_manifest_v3_check;

create or replace function public.investing_engine_authorization_shape_valid_v1(payload jsonb)
returns boolean
language plpgsql
immutable
strict
set search_path = pg_catalog, public
as $$
declare
  entry record;
  item jsonb;
  authorization_keys text[];
begin
  if jsonb_typeof(payload) = 'object' then
    for entry in select key, value from jsonb_each(payload)
    loop
      if entry.key = 'authorization' then
        if jsonb_typeof(entry.value) <> 'object' then return false; end if;
        select coalesce(array_agg(key order by key), array[]::text[])
          into authorization_keys
          from jsonb_object_keys(entry.value) as keys(key);
        if authorization_keys <> array['environment', 'expectedAccountId', 'expectedUserId']::text[]
          or jsonb_typeof(entry.value -> 'expectedUserId') <> 'string'
          or length(btrim(entry.value ->> 'expectedUserId')) = 0
          or jsonb_typeof(entry.value -> 'expectedAccountId') <> 'string'
          or length(btrim(entry.value ->> 'expectedAccountId')) = 0
          or entry.value ->> 'environment' <> 'paper'
        then return false; end if;
      end if;
      if not public.investing_engine_authorization_shape_valid_v1(entry.value) then return false; end if;
    end loop;
  elsif jsonb_typeof(payload) = 'array' then
    for item in select value from jsonb_array_elements(payload)
    loop
      if not public.investing_engine_authorization_shape_valid_v1(item) then return false; end if;
    end loop;
  end if;
  return true;
end;
$$;

revoke all on function public.investing_engine_authorization_shape_valid_v1(jsonb)
  from public, anon, authenticated, service_role;

grant execute on function public.investing_engine_authorization_shape_valid_v1(jsonb)
  to service_role;
