create table if not exists public.marketing_content_items (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null,
  title text not null,
  campaign text not null,
  channel text not null check (channel in ('reddit', 'facebook', 'linkedin', 'x', 'email', 'video')),
  status text not null default 'draft' check (status in ('draft', 'review', 'approved', 'scheduled', 'published', 'rejected')),
  audience text,
  objective text,
  body text not null,
  safety jsonb not null default '{"ok": true, "severity": "ok", "flags": []}'::jsonb,
  utm_url text,
  scheduled_for timestamptz,
  published_at timestamptz,
  metrics jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketing_content_items_owner_status_idx
  on public.marketing_content_items (owner_user_id, status, created_at desc);

create index if not exists marketing_content_items_schedule_idx
  on public.marketing_content_items (scheduled_for asc)
  where scheduled_for is not null;

create table if not exists public.marketing_leads (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null,
  name text,
  email text,
  source text,
  status text not null default 'new' check (status in ('new', 'contacted', 'trial', 'paid', 'closed')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketing_leads_owner_status_idx
  on public.marketing_leads (owner_user_id, status, created_at desc);

create or replace function public.set_marketing_ops_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_marketing_content_items_updated_at
  on public.marketing_content_items;

create trigger set_marketing_content_items_updated_at
before update on public.marketing_content_items
for each row
execute function public.set_marketing_ops_updated_at();

drop trigger if exists set_marketing_leads_updated_at
  on public.marketing_leads;

create trigger set_marketing_leads_updated_at
before update on public.marketing_leads
for each row
execute function public.set_marketing_ops_updated_at();

