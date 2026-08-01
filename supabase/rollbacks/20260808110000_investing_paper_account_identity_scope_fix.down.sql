begin;
do $$ begin
  raise exception using errcode='55000',message='paper_account_identity_scope_fix_rollback_refused';
end $$;
rollback;
