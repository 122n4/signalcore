-- SECURITY-NON-REVERSIBLE.
-- R3 cannot be rolled back to R2 because R2 accepts percent-encoded reserved
-- keys and cannot prove the raw JSON representation. Reapply is idempotent;
-- rollback is deliberately refused and leaves the safe schema unchanged.
do $$
begin
  raise exception 'investing_engine_phase4b_r3_security_rollback_refused'
    using errcode = '55000';
end;
$$;
