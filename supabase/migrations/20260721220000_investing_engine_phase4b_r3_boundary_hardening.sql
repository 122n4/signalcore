-- FASE 4B-R3: harden reserved-key aliases and preserve the raw canonical JSON
-- boundary. The manifest remains v3 because its material representation does
-- not change; this migration changes validation only.

create or replace function public.investing_engine_percent_key_valid_v1(key_name text)
returns boolean
language plpgsql
immutable
strict
set search_path = pg_catalog, public
as $$
declare
  position_index integer := 1;
  key_length integer := char_length(key_name);
  encoded_bytes bytea := ''::bytea;
  current_character text;
  hexadecimal_byte text;
  decoded_key text;
begin
  if position('%' in key_name) = 0 then
    return pg_catalog.lower(key_name) <> 'authorization' or key_name = 'authorization';
  end if;

  while position_index <= key_length loop
    current_character := substr(key_name, position_index, 1);
    if current_character = '%' then
      if position_index + 2 > key_length then return false; end if;
      hexadecimal_byte := substr(key_name, position_index + 1, 2);
      if hexadecimal_byte !~ '^[0-9A-Fa-f]{2}$' then return false; end if;
      encoded_bytes := encoded_bytes || decode(hexadecimal_byte, 'hex');
      position_index := position_index + 3;
    else
      encoded_bytes := encoded_bytes || convert_to(current_character, 'UTF8');
      position_index := position_index + 1;
    end if;
  end loop;

  begin
    decoded_key := convert_from(encoded_bytes, 'UTF8');
  exception when character_not_in_repertoire or untranslatable_character then
    return false;
  end;

  if position('%' in decoded_key) > 0 then return false; end if;
  return pg_catalog.lower(decoded_key) <> 'authorization';
end;
$$;

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
      if not public.investing_engine_percent_key_valid_v1(entry.key) then return false; end if;
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

-- PostgreSQL `json` preserves object order and duplicate keys. Traverse that
-- representation before any jsonb projection so duplicate detection cannot be
-- defeated by last-value-wins conversion.
create or replace function public.investing_engine_raw_json_structure_valid_v1(payload json)
returns boolean
language plpgsql
immutable
strict
set search_path = pg_catalog, public
as $$
declare
  entry record;
  item json;
  last_key text;
  payload_type text := json_typeof(payload);
begin
  if payload_type = 'number' then return false; end if;
  if payload_type = 'object' then
    for entry in select key, value from json_each(payload)
    loop
      if last_key is not null and (last_key collate "C") >= (entry.key collate "C") then
        return false;
      end if;
      last_key := entry.key;
      if not public.investing_engine_raw_json_structure_valid_v1(entry.value) then return false; end if;
    end loop;
  elsif payload_type = 'array' then
    for item in select value from json_array_elements(payload)
    loop
      if not public.investing_engine_raw_json_structure_valid_v1(item) then return false; end if;
    end loop;
  end if;
  return true;
end;
$$;

-- Enforce the remaining canonical text properties cheaply: root object and no
-- insignificant whitespace outside quoted JSON strings.
create or replace function public.investing_engine_canonical_raw_valid_v1(canonical_payload text)
returns boolean
language plpgsql
immutable
strict
set search_path = pg_catalog, public
as $$
declare
  raw_json json;
  outside_strings text;
  string_token text[];
begin
  begin
    raw_json := canonical_payload::json;
  exception when invalid_text_representation then
    return false;
  end;
  if json_typeof(raw_json) <> 'object' then return false; end if;
  outside_strings := regexp_replace(
    canonical_payload,
    $strings$"(?:\\.|[^"\\])*"$strings$,
    '""',
    'g'
  );
  if outside_strings ~ '[[:space:]]' then return false; end if;

  -- PostgreSQL accepts several equivalent JSON string spellings. Compare every
  -- raw string token (keys and values) with PostgreSQL's canonical serializer
  -- before json/jsonb normalization can erase that distinction.
  for string_token in
    select regexp_matches(
      canonical_payload,
      $strings$("(?:\\.|[^"\\])*")$strings$,
      'g'
    )
  loop
    if string_token[1] <> to_json(string_token[1]::json #>> '{}')::text then
      return false;
    end if;
  end loop;

  return public.investing_engine_raw_json_structure_valid_v1(raw_json);
end;
$$;

-- The validated R2 authorization CHECK already references this function by
-- OID. CREATE OR REPLACE upgrades its policy without dropping validation or
-- rescanning historical rows.

alter table public.investing_engine_artifacts
  drop constraint if exists investing_engine_artifacts_canonical_raw_check;

alter table public.investing_engine_artifacts
  add constraint investing_engine_artifacts_canonical_raw_check
  check (public.investing_engine_canonical_raw_valid_v1(canonical_payload)) not valid;

-- NOT VALID is intentional: existing R2 artifacts were emitted by the
-- canonical TypeScript writer. PostgreSQL still enforces this CHECK for every
-- new INSERT and UPDATE, without a blocking historical-table scan.

revoke all on function public.investing_engine_percent_key_valid_v1(text)
  from public, anon, authenticated, service_role;
revoke all on function public.investing_engine_authorization_shape_valid_v1(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.investing_engine_raw_json_structure_valid_v1(json)
  from public, anon, authenticated, service_role;
revoke all on function public.investing_engine_canonical_raw_valid_v1(text)
  from public, anon, authenticated, service_role;

grant execute on function public.investing_engine_percent_key_valid_v1(text)
  to service_role;
grant execute on function public.investing_engine_authorization_shape_valid_v1(jsonb)
  to service_role;
grant execute on function public.investing_engine_raw_json_structure_valid_v1(json)
  to service_role;
grant execute on function public.investing_engine_canonical_raw_valid_v1(text)
  to service_role;
