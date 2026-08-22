begin;

alter table public.daily_snapshots
  alter column mode drop default;

alter table public.journal_entries
  alter column mode drop default;

alter table public.portfolio_items
  alter column mode drop default;

alter table public.portfolios
  alter column mode drop default;

alter table public.user_settings
  alter column active_mode drop default;

commit;
