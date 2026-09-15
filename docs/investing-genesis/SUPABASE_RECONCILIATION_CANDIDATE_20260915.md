# Investing Supabase Reconciliation Candidate — 2026-09-15

Status: `IMPLEMENTED_CANDIDATE / PRODUCTION NOT AUTHORIZED`

Accepted predecessor: `986c96f8d1d4ed9f3d0245451e7a14acdc6add39`

This candidate reconciles evidence and prepares an executable repair/rehearsal path. It does **not** authorize or perform production DDL, production DML, migration-history mutation, Genesis deployment, merge, or promotion.

## Independently verified Production facts

Read-only audit against Supabase project `qdnvbamoamtkujzwrxdb` on 2026-09-15 established:

- Supabase project state: `ACTIVE_HEALTHY`.
- Current source migration count: `31`.
- Production migration-ledger count: `73`.
- Versions present in both source and ledger: `20`.
- Source versions missing from production ledger: `11`.
- Production-ledger versions absent from current source: `53`.
- The `53` ledger-only versions are the retired pre-Genesis Investing lineage enumerated by `tests/investingPreGenesisPurgeProof.test.ts`; they are historical evidence and MUST remain recorded remotely.
- `20260822140500_recover_zero_genesis_shared_preconditions` is present in current source but absent from the production migration ledger.
- Its material shared preconditions are physically present in Production: `public.setup_status`, `public.set_updated_at()`, canonical `plans_mode_check`, and canonical `portfolio_items_mode_check`.
- The current Genesis namespace is not deployed in Production: schema `investing` does not exist; roles `investing_owner` and `investing_app` do not exist; Investing relations/functions are absent.
- The canonical Zero-Genesis residual assertion currently returns `1`, not `0`.
- The only residual class is `public.journal_entries` with `mode='investing'`.
- Exactly one such row exists.
- Independently verified non-sensitive residual identity: `type='conversion_event'`, `created_at='2026-09-05 13:59:12.762+00'`.
- Audit fingerprint of the complete residual row set at verification time: SHA-256 `5833faf5ca3ab62250f460c1e35ede4b30e20caa58ba87c7b34a4563eb615248`.
- No raw user identifier, row id, title, or details payload is copied into this candidate.

## Classification

### 1. Historical ledger-only lineage — PRESERVE

The `53` pre-Genesis Investing versions that remain in `supabase_migrations.schema_migrations` but were purged from the current source tree are historical facts. They MUST NOT be marked reverted or deleted merely to make CLI output look clean.

Their runtime was retired by the accepted Zero-Genesis teardown lineage. Retaining their ledger records preserves what Production actually executed.

### 2. `20260822140500` — ledger gap with compatible physical state

`20260822140500_recover_zero_genesis_shared_preconditions.sql` is absent from the production migration ledger, while the material objects it owns are present and compatible with the migration's fail-closed contract.

The intended reconciliation operation, **only after an independent preflight against the exact approved SHA**, is migration-history metadata repair:

```text
supabase migration repair 20260822140500 --status applied
```

That operation changes migration tracking only; it MUST NOT be used as a substitute for schema verification.

Production execution remains unauthorized by this candidate.

### 3. Zero-Genesis residual — repair before Genesis deployment

Candidate migration:

```text
supabase/migrations/20260823000000_reconcile_zero_genesis_journal_residual.sql
```

The migration is intentionally ordered after the accepted Zero-Genesis retirement/ACL boundary and before current Genesis materialization.

It fails closed unless:

- executor is `postgres`;
- schema `investing` is still absent;
- roles `investing_owner` and `investing_app` are still absent;
- `public.journal_entries` has the required identity columns;
- retired-Investing journal residual count is `0` or exactly `1`;
- if one row exists, it matches the independently verified non-sensitive identity above.

It then:

1. installs a `NOT VALID` constraint that immediately blocks any new `journal_entries.mode='investing'` write without first touching the existing residual;
2. removes only the independently verified residual if it still exists;
3. validates the anti-recurrence constraint;
4. re-runs the complete canonical Zero-Genesis residual calculation and requires `0`;
5. does not create any Investing Genesis schema, role, table, function, or financial state.

The production row deletion is DML and therefore still requires explicit production authorization after candidate audit/rehearsal.

### 4. Current Genesis/I5 — not deployed

The following current source migrations are absent from the production ledger and their Investing runtime is absent physically:

```text
20260825120000_investing_genesis_i2_authority_materialization
20260825123000_investing_genesis_i2_authorized_context
20260828105111_investing_genesis_i2_atomic_personal_bootstrap
20260831221500_investing_genesis_i2_ledger_schema
20260909100000_investing_i5_research_authority_audit_contract
20260910120000_investing_i5_a1_research_investigation_persistence
20260910130000_investing_i5_a2_research_draft_persistence
20260911110000_investing_i5_research_runtime_lock_contract_repair
20260912050000_investing_i5_a3_research_material_revisions
20260912070000_investing_i5_a4_research_spec_persistence
```

No production deployment of these migrations is authorized by this candidate.

## Required rehearsal sequence

Before any production change, a PostgreSQL 17 disposable environment must prove this exact progression:

```text
verified Zero-Genesis shared substrate
→ synthetic retired-Investing journal residual
→ 20260823000000 residual repair/recurrence guard
→ Genesis I2 migrations in timestamp order
→ I5 migrations in timestamp order
→ RLS/role/schema/table postconditions
```

The rehearsal must prove both paths for `20260823000000`:

- existing verified residual is removed and recurrence is blocked;
- clean Zero-Genesis with no residual remains valid.

The existing independent I0→I4 PostgreSQL 17 rehearsal remains separate evidence for I3/I4 accounting/plan contracts.

## Production gate — required order

Production remains `BLOCKED` until all of the following are true:

1. candidate CI and PostgreSQL 17 rehearsal are green;
2. candidate diff is independently audited against predecessor `986c96f8...`;
3. exact production preflight is repeated immediately before mutation;
4. explicit owner authorization is given for the DML/DDL/history operations;
5. `20260822140500` migration-history metadata is repaired only after physical-state proof;
6. `20260823000000` is applied from the exact approved SHA and Zero-Genesis becomes `0` again;
7. production migration state is re-read and archived;
8. Genesis/I5 deployment is authorized separately and applied in exact timestamp order;
9. post-deploy RLS, ACL, ownership, isolation, migration ledger and runtime invariants are independently re-audited.

## Explicit prohibitions

Do not:

- delete or mark reverted the `53` historical pre-Genesis migration records merely to obtain cosmetic parity;
- run `supabase db reset --linked` against Production;
- run a blind `db push` before a dry-run/reconciliation gate;
- apply Genesis while the Zero-Genesis residual count is non-zero;
- treat `service_role` as ownership/authority;
- mutate the residual without exact fail-closed identity checks;
- merge or deploy this candidate solely because CI is green.

## Gate classification

```text
SOURCE CANDIDATE                 = IMPLEMENTED_CANDIDATE
PRODUCTION SUPABASE              = HEALTHY / UNRECONCILED
ZERO-GENESIS CURRENT PROD        = BLOCKED (1 verified residual)
GENESIS/I5 PRODUCTION            = NOT DEPLOYED
PRODUCTION DDL/DML               = NOT AUTHORIZED
MIGRATION-HISTORY MUTATION       = NOT AUTHORIZED
MERGE                            = NOT AUTHORIZED
```
