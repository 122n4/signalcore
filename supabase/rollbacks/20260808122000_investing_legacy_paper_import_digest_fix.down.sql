begin;
do $$ begin
  raise exception 'investing_legacy_import_digest_fix_rollback_refused';
end $$;
rollback;
