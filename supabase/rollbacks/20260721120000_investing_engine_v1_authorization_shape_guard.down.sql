alter table if exists public.investing_engine_artifacts
  drop constraint if exists investing_engine_artifacts_authorization_shape_check;

drop function if exists public.investing_engine_authorization_shape_valid_v1(jsonb);
