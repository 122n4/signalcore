do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'paper_trades_source_journal_entry_key'
      and conrelid = 'public.paper_trades'::regclass
  ) then
    alter table public.paper_trades
      add constraint paper_trades_source_journal_entry_key unique (source_journal_entry_id);
  end if;
end;
$$;
