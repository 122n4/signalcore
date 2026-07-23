-- SECURITY-NON-REVERSIBLE.
-- Restoring the permissive R4 gate could admit existing history, so R5 cannot
-- be rolled back in place. Provision a new empty database instead.
do $$
begin
  raise exception 'investing_engine_phase4b_r5_security_rollback_refused'
    using errcode = '55000';
end;
$$;
