\set ON_ERROR_STOP on

do $$
declare
  alias_key text;
  raw_payload text;
begin
  if not public.investing_engine_authorization_shape_valid_v1(
    '{"authorization":{"environment":"paper","expectedAccountId":"account","expectedUserId":"user"}}'::jsonb
  ) then raise exception 'canonical authorization rejected'; end if;

  foreach alias_key in array array[
    'Authorization', 'AUTHORIZATION', 'authoriZation',
    '%61uthorization', 'author%69zation', '%41uthorization',
    '%2561uthorization', 'author%2569zation', '%61uthori%7Aation',
    'author%ization', 'authorization%', '%GGauthorization'
  ]
  loop
    if public.investing_engine_authorization_shape_valid_v1(jsonb_build_object(
      'nested', jsonb_build_array(jsonb_build_object(
        alias_key,
        jsonb_build_object(
          'environment', 'live', 'expectedAccountId', 'account',
          'expectedUserId', 'user', 'credential', 'secret', 'cookie', 'secret',
          'headers', jsonb_build_object('authorization', 'secret'),
          'client_secret', 'secret'
        )
      ))
    )) then raise exception 'authorization alias accepted: %', alias_key; end if;
  end loop;

  if not public.investing_engine_canonical_raw_valid_v1('{"a":"x","b":{"c":true}}')
    or public.investing_engine_canonical_raw_valid_v1('{"b":{"c":true},"a":"x"}')
    or public.investing_engine_canonical_raw_valid_v1('{"a":"\u0078"}')
  then
    raise exception 'canonical raw validator mismatch';
  end if;

  create temporary table investing_engine_r3_raw_boundary_probe(
    canonical_payload text not null,
    constraint investing_engine_r3_raw_boundary_probe_check check (
      public.investing_engine_canonical_raw_valid_v1(canonical_payload)
      and public.investing_engine_authorization_shape_valid_v1(canonical_payload::jsonb)
    )
  ) on commit drop;

  foreach raw_payload in array array[
    '{"a":"first","a":"second"}',
    '{"authorization":{"environment":"paper","expectedAccountId":"a","expectedUserId":"u"},"authorization":{"environment":"live","expectedAccountId":"a","expectedUserId":"u"}}',
    '{"Authorization":{"environment":"paper","expectedAccountId":"a","expectedUserId":"u"},"authorization":{"environment":"paper","expectedAccountId":"a","expectedUserId":"u"}}',
    '{"nested":{"a":"first","a":"second"}}',
    '{"nested":[{"a":"first","a":"second"}]}',
    '{"a":"\u0078"}',
    '{"%61uthorization":{"credential":"first"},"%61uthorization":{"credential":"second"}}',
    '{"authorization":{"environment":"paper","expectedAccountId":"a","expectedUserId":"u"},"authorization":{"credential":"danger"}}',
    '{"authorization":{"credential":"danger"},"authorization":{"environment":"paper","expectedAccountId":"a","expectedUserId":"u"}}'
  ]
  loop
    begin
      insert into investing_engine_r3_raw_boundary_probe(canonical_payload) values(raw_payload);
      raise exception 'raw duplicate or alias unexpectedly accepted: %', raw_payload;
    exception when check_violation then null;
    end;
  end loop;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.investing_engine_artifacts'::regclass
       and conname = 'investing_engine_artifacts_canonical_raw_check'
       and not convalidated
  ) then raise exception 'raw canonical new-write boundary absent'; end if;

  if has_function_privilege('anon', 'public.investing_engine_canonical_raw_valid_v1(text)', 'execute')
    or has_function_privilege('authenticated', 'public.investing_engine_canonical_raw_valid_v1(text)', 'execute')
    or has_function_privilege('anon', 'public.investing_engine_percent_key_valid_v1(text)', 'execute')
    or has_function_privilege('authenticated', 'public.investing_engine_percent_key_valid_v1(text)', 'execute')
  then raise exception 'browser role retained R3 validator EXECUTE'; end if;

  if not has_function_privilege('service_role', 'public.investing_engine_canonical_raw_valid_v1(text)', 'execute')
    or not has_function_privilege('service_role', 'public.investing_engine_percent_key_valid_v1(text)', 'execute')
  then raise exception 'service role cannot evaluate R3 CHECKs'; end if;
end;
$$;
