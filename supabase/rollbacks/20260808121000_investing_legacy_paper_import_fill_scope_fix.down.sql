begin;
do $$ begin
  raise exception 'investing_legacy_import_fill_scope_fix_rollback_refused';
end $$;
rollback;
