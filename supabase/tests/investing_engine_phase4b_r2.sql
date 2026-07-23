\set ON_ERROR_STOP on

do $$
declare
  variant text;
  candidate jsonb;
begin
  if not public.investing_engine_authorization_shape_valid_v1(
    '{"authorization":{"environment":"paper","expectedAccountId":"account","expectedUserId":"user"}}'::jsonb
  ) then raise exception 'canonical authorization rejected'; end if;

  foreach variant in array array['Authorization', 'AUTHORIZATION', 'authoriZation']
  loop
    if public.investing_engine_authorization_shape_valid_v1(jsonb_build_object(
      variant,
      jsonb_build_object('environment', 'paper', 'expectedAccountId', 'account', 'expectedUserId', 'user')
    )) then raise exception 'authorization casing variant accepted: %', variant; end if;

    for candidate in select value from jsonb_array_elements('[
      {"environment":"paper","expectedAccountId":"account","expectedUserId":"user","credential":"secret"},
      {"environment":"paper","expectedAccountId":"account","expectedUserId":"user","cookie":"secret"},
      {"environment":"paper","expectedAccountId":"account","expectedUserId":"user","headers":{"xCustomAuth":"secret"}},
      {"environment":"paper","expectedAccountId":"account","expectedUserId":"user","client_secret":"secret"},
      {"environment":"live","expectedAccountId":"account","expectedUserId":"user"},
      {"environment":"real","expectedAccountId":"account","expectedUserId":"user"}
    ]'::jsonb)
    loop
      if public.investing_engine_authorization_shape_valid_v1(jsonb_build_object(
        'nested', jsonb_build_array(jsonb_build_object(variant, candidate))
      )) then raise exception 'nested authorization casing variant accepted: % %', variant, candidate; end if;
    end loop;
  end loop;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'investing_engine_runs' and column_name = 'manifest_version'
  ) then raise exception 'manifest version marker absent'; end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.investing_engine_runs'::regclass
       and conname = 'investing_engine_runs_manifest_v3_check'
       and not convalidated
  ) then raise exception 'manifest v3 new-write constraint absent'; end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.investing_engine_artifacts'::regclass
       and conname = 'investing_engine_artifacts_authorization_shape_check'
       and convalidated
  ) then raise exception 'authorization artifact CHECK is absent or unvalidated'; end if;

  if has_function_privilege('anon', 'public.investing_engine_authorization_shape_valid_v1(jsonb)', 'execute')
    or has_function_privilege('authenticated', 'public.investing_engine_authorization_shape_valid_v1(jsonb)', 'execute')
  then raise exception 'browser role retained authorization validator EXECUTE'; end if;

  if not has_function_privilege('service_role', 'public.investing_engine_authorization_shape_valid_v1(jsonb)', 'execute')
  then raise exception 'service role cannot evaluate authorization CHECK'; end if;
end;
$$;
