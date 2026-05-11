alter table public.marketing_content_items
  add column if not exists creative_kind text not null default 'copy'
    check (creative_kind in ('copy', 'image', 'video')),
  add column if not exists creative_status text not null default 'not_requested'
    check (creative_status in ('not_requested', 'brief_ready', 'rendering', 'ready', 'failed')),
  add column if not exists creative_provider text,
  add column if not exists creative_prompt text,
  add column if not exists creative_render_id text,
  add column if not exists asset_url text,
  add column if not exists asset_thumbnail_url text,
  add column if not exists external_provider text,
  add column if not exists external_status text not null default 'not_sent'
    check (external_status in ('not_sent', 'queued', 'scheduled', 'published', 'failed')),
  add column if not exists external_id text,
  add column if not exists external_url text,
  add column if not exists last_external_error text;

create index if not exists marketing_content_items_external_status_idx
  on public.marketing_content_items (owner_user_id, external_status, created_at desc);

create index if not exists marketing_content_items_creative_status_idx
  on public.marketing_content_items (owner_user_id, creative_status, created_at desc);

