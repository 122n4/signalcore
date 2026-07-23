-- SECURITY-NON-REVERSIBLE.
-- R4 is a read-only security gate. Its removal would weaken phase admission,
-- so rollback is deliberately refused and leaves the schema unchanged.
do $$
begin
  raise exception 'investing_engine_phase4b_r4_security_rollback_refused'
    using errcode = '55000';
end;
$$;
