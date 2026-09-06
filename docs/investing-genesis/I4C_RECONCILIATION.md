# Syntrake Investing Genesis I4-C Reconciliation

Status: SOURCE RECONCILIATION IN PROGRESS. NOT FROZEN. NOT A MIGRATION. DO NOT EXECUTE I4-D.

## Canonical lineage

- I4-A frozen design: `8d45b1f57305f3d9b1e44705915739c6c5796269`.
- I4-B frozen baseline: `812b2ea11f8696abcc55f00d70beff85f0701733`.
- I4-C frozen writer: `8b0376a3d76eaf16e05a07770749fe562e4880c7`.
- Frozen I4-C SQL blob: `d30a02d36acbac46446e7a8eb5bc0ab577f6f3ca`.
- Later rehearsal branch audited head: `6515496a4fdc65a3f5d64f99465be625a24e12f1`.
- Frozen-writer lineage restore checkpoint: `8d8d0ff3c113a3dd6cc95b890742bf6745e1bfb7`.

The four files from frozen I4-C were restored byte-for-byte at the restore checkpoint. This document does not redefine their semantics.

## Canonical writer semantics

The canonical orchestration remains `lib/investing/plan/writer.ts` from frozen I4-C. In particular, revision mutation requires explicit `expectedActiveRevisionId` and `expectedActiveVersion`; the material request hash binds those expected values; the active pointer move is compare-and-swap; stale writers conflict rather than silently winning; exact terminal replay remains historical; and conflict/authority denial evidence is part of the contract.

## PostgreSQL 17 hardening

The later rehearsal lineage proved two catalog-query corrections that are compatible with the frozen semantics:

1. Column ACL inspection must call `pg_catalog.aclexplode(a.attacl)` directly. PostgreSQL 17 exposed the bad behavior of replacing a NULL column ACL with an empty ACL array. The frozen I4-C SQL contains exactly three legacy occurrences.
2. `pg_policy.polroles` must be compared to an OID array using `array[(select oid from pg_catalog.pg_roles where rolname = 'investing_app')]`, not `array['investing_app'::regrole]`. The frozen I4-C SQL contains exactly one legacy occurrence.

`lib/investing/plan/pg17Hardening.ts` derives a PostgreSQL-17-compatible candidate from the frozen SQL and fails closed unless those exact 3 + 1 source occurrences are present. No business, authority, idempotency, Plan, Trading, accounting, financial, recommendation, or execution semantics are transformed.

## Non-canonical reference

`docs/investing-genesis/sql/I4C_PLAN_RUNTIME_WRITER_CANDIDATE.sql` and its four-argument `investing.i4_plan_write_v1(text,text,bytea,text)` function are retained only as non-canonical reference material for the PostgreSQL/RLS hardening learned during rehearsal.

They are not an acceptable replacement for frozen I4-C because the four-argument interface cannot carry the explicit expected active revision/version required by I4-A/I4-C CAS semantics, and its replay path is tied to the result still being the active revision.

The associated `I4C_PLAN_RUNTIME_AUDIT_READ_PATCH_CANDIDATE.sql` and `I4D_PLAN_FUNCTIONAL_REHEARSAL.sql` therefore remain non-canonical reference material as well.

## Gate

Do not execute I4-D, create a Supabase rehearsal branch, create a migration, merge, deploy, or touch Production from this reconciliation state.

The next gate is:

1. prove the deterministic PostgreSQL 17 derived SQL preserves the frozen I4-C security/RLS contract;
2. reconcile the I4-D functional rehearsal to exercise the canonical TypeScript writer semantics rather than the four-argument SQL runtime;
3. run static tests and compare every failure to the exact `812b2ea11f8696abcc55f00d70beff85f0701733` baseline;
4. only then request/perform a disposable PostgreSQL 17 rehearsal.
