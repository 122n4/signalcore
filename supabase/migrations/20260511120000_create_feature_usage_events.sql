create table if not exists public.feature_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  feature text not null,
  plan text not null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists feature_usage_events_user_feature_created_at_idx
  on public.feature_usage_events (user_id, feature, created_at desc);

create index if not exists feature_usage_events_feature_created_at_idx
  on public.feature_usage_events (feature, created_at desc);

