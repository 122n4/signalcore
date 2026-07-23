\set ON_ERROR_STOP on

do $$
begin
  if not public.investing_engine_authorization_shape_valid_v1(
    '{"authorization":{"environment":"paper","expectedAccountId":"account","expectedUserId":"user"}}'::jsonb
  ) then
    raise exception 'valid exact authorization object was rejected';
  end if;

  if public.investing_engine_authorization_shape_valid_v1(
    '{"authorization":{"environment":"paper","expectedAccountId":"account","expectedUserId":"user","credential":"secret"}}'::jsonb
  ) then
    raise exception 'unexpected authorization property was accepted';
  end if;

  if public.investing_engine_authorization_shape_valid_v1(
    '{"nested":[{"authorization":{"environment":"live","expectedAccountId":"account","expectedUserId":"user"}}]}'::jsonb
  ) then
    raise exception 'nested non-paper authorization object was accepted';
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.investing_engine_artifacts'::regclass
       and conname = 'investing_engine_artifacts_authorization_shape_check'
       and convalidated
  ) then
    raise exception 'authorization shape constraint is absent or unvalidated';
  end if;
end;
$$;
