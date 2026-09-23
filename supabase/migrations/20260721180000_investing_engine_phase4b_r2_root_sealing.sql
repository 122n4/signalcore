-- FASE 4B-R2: reject case variants of the reserved authorization key and
-- persist an explicit manifest-v3 marker. Existing v2 runs remain NULL and
-- are not backfilled or converted.

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
      if pg_catalog.lower(entry.key) = 'authorization' then
        if entry.key <> 'authorization' or jsonb_typeof(entry.value) <> 'object' then
          return false;
        end if;
        select coalesce(array_agg(key order by key), array[]::text[])
          into authorization_keys
          from jsonb_object_keys(entry.value) as keys(key);
        if authorization_keys <> array['environment', 'expectedAccountId', 'expectedUserId']::text[]
          or jsonb_typeof(entry.value -> 'expectedUserId') <> 'string'
          or length(btrim(entry.value ->> 'expectedUserId')) = 0
          or jsonb_typeof(entry.value -> 'expectedAccountId') <> 'string'
          or length(btrim(entry.value ->> 'expectedAccountId')) = 0
          or entry.value ->> 'environment' <> 'paper'
        then
          return false;
        end if;
      end if;
      if not public.investing_engine_authorization_shape_valid_v1(entry.value) then
        return false;
      end if;
    end loop;
  elsif jsonb_typeof(payload) = 'array' then
    for item in select value from jsonb_array_elements(payload)
    loop
      if not public.investing_engine_authorization_shape_valid_v1(item) then
        return false;
      end if;
    end loop;
  end if;
  return true;
end;
$$;

alter table public.investing_engine_artifacts
  drop constraint if exists investing_engine_artifacts_authorization_shape_check;

alter table public.investing_engine_artifacts
  add constraint investing_engine_artifacts_authorization_shape_check
  check (public.investing_engine_authorization_shape_valid_v1(canonical_payload::jsonb))
  not valid;

alter table public.investing_engine_artifacts
  validate constraint investing_engine_artifacts_authorization_shape_check;

alter table public.investing_engine_runs
  add column if not exists manifest_version text;

alter table public.investing_engine_runs
  drop constraint if exists investing_engine_runs_manifest_v3_check;

-- NOT VALID deliberately preserves old NULL v2 rows while enforcing v3 on
-- every new or subsequently updated root row.
alter table public.investing_engine_runs
  add constraint investing_engine_runs_manifest_v3_check
  check (
    manifest_version is not null
    and manifest_version = 'investing-engine-persistence-manifest/v3'
  ) not valid;

revoke all on function public.investing_engine_authorization_shape_valid_v1(jsonb)
  from public, anon, authenticated, service_role;

grant execute on function public.investing_engine_authorization_shape_valid_v1(jsonb)
  to service_role;
