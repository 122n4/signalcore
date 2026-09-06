# Syntrake Investing Genesis I4 — Master Checkpoint

Status: CANONICAL FREEZE CANDIDATE.

This checkpoint becomes `I4 = FROZEN` only when the exact Git commit containing this document passes every gate in **Freeze gates** below. The final canonical SHA is therefore the checked commit itself, not a SHA written into this file.

This document supersedes the status line in `I4C_RECONCILIATION.md`. That file remains historical reconciliation evidence and remains authoritative where it classifies the alternate four-argument SQL runtime and the old I4-D SQL rehearsal as non-canonical.

## Scope and safety boundary

This checkpoint covers Investing Genesis I4 source, authority composition, persistence/writer semantics, PostgreSQL-17 hardening, automated verification, and non-production rehearsal.

It does **not** authorize or perform:

- merge to `main`;
- production deploy;
- production migration or other production DDL/DML;
- promotion of the old four-argument SQL runtime;
- any financial recommendation, return, probability, price target, or execution claim.

Trading and Investing remain isolated.

## Canonical lineage

- Pre-I4 frozen base: `c993bc7b88b5fe1eb84cb4dda5cec305b1bcb328`.
- I4-A frozen design: `8d45b1f57305f3d9b1e44705915739c6c5796269`.
- I4-B frozen baseline: `812b2ea11f8696abcc55f00d70beff85f0701733`.
- Original frozen I4-C writer commit: `8b0376a3d76eaf16e05a07770749fe562e4880c7`.
- Original frozen I4-C SQL blob: `d30a02d36acbac46446e7a8eb5bc0ab577f6f3ca`.
- Frozen-writer lineage restore checkpoint: `8d8d0ff3c113a3dd6cc95b890742bf6745e1bfb7`.
- Reconciled stale-writer repair: `e3b64cec44fbf455b90bf63cd141dcc5700b89de`.
- Reconciled PostgreSQL-17 denial-audit type repair: `01d934fb90b408e41399c1bc388276df7aa393e0`.

The current reconciled writer is intentionally not byte-identical to the original frozen I4-C writer. The only post-restore writer changes are the two audited repairs above.

## Reconciled writer contract

The canonical application writer remains `lib/investing/plan/writer.ts`.

Current required semantics:

1. revision mutation carries explicit `expectedActiveRevisionId` and `expectedActiveVersion`;
2. the material request identity binds the expected predecessor/version;
3. the active pointer move is compare-and-swap, not last-write-wins;
4. a stale writer using a fresh/different idempotency key loses with `CONFLICT`, including when its content bytes equal the winner;
5. exact replay by the original idempotency key remains historical and canonical;
6. conflict evidence and authority-denial evidence are durable according to the writer contract;
7. the PostgreSQL-17 denial audit writes the account UUID with explicit type handling while preserving the canonical text `object_id` representation;
8. failed/stale mutation must not create a successor revision or partially move the active pointer.

The stale-writer repair strengthens the original I4-A/I4-C rule that a stale writer loses cleanly. It does not introduce last-write-wins or broaden replay semantics.

## Authority and public service boundary

`lib/investing/plan/service.ts` is server-only and composes the canonical account authority resolver with the low-level Plan writer.

The public Plan service must not accept a client-supplied branded authority context, tenant ID, principal ID, membership ID, account-access ID, role, access object, external subject, or equivalent ownership proof. `accountId` is only a target selector. Ownership and authorization are resolved server-side through the canonical Investing authority graph.

`service_role` remains capability, never authorization, and is not an alternate Plan authority path.

## PostgreSQL 17 hardening

`lib/investing/plan/pg17Hardening.ts` is pinned to:

- original frozen I4-C commit `8b0376a3d76eaf16e05a07770749fe562e4880c7`;
- original frozen I4-C SQL blob `d30a02d36acbac46446e7a8eb5bc0ab577f6f3ca`.

The renderer fails closed unless the frozen source contains exactly the expected PostgreSQL-17 catalog compatibility surface: three column-ACL occurrences and one policy-role occurrence. These transformations do not redefine Plan business semantics, authority semantics, accounting, Trading, recommendation, or execution behavior.

## Current pinned artifact blobs

At checkpoint preparation time the reconciled branch contains:

- `lib/investing/plan/writer.ts`: `5dcc5b1351e31ca521a102632ad898b737cb44c3`;
- `lib/investing/plan/pg17Hardening.ts`: `b72566774d8ff74f4b7c9f0779b9916a8e6c2f83`;
- `lib/investing/plan/service.ts`: `3e6e1b58587ad5b4a17c6e1bace8e0e24fcb66f0`;
- `tests/investingGenesisI4PlanServiceBoundary.test.ts`: `73dc473197bca1d999f0a87226a6b7d633d21911`;
- `tests/investingGenesisI0ToI4Pg17Rehearsal.test.ts`: `9a7c315bdce9ac38067be2d5cd7ba52c52f99c3f`;
- `docs/investing-genesis/sql/I4B_PLAN_PERSISTENCE_CANDIDATE.sql`: `3f41bbef0f5d0d0ce8be88b3c8a5ffa5a5e561b9`;
- `docs/investing-genesis/I4C_PLAN_WRITER_DESIGN.md`: `7aa65fc2ab1edcd3c1e458a256fd5c595020282e`.

Any drift in a material I4 artifact after this checkpoint requires a new audit and a new freeze decision.

## Canonical rehearsal

The canonical functional execution gate is the `i0-i4-pg17-rehearsal` job in `.github/workflows/i4c-reconciliation-static.yml`.

It runs a fresh `postgres:17` service and executes `tests/investingGenesisI0ToI4Pg17Rehearsal.test.ts` against that database. It applies pinned canonical predecessor bytes, I4-B persistence, the deterministically rendered PostgreSQL-17 I4-C candidate, and the canonical TypeScript service/writer path.

Classification:

- PostgreSQL execution and database constraints/RLS/CAS behavior: **REAL** against disposable PostgreSQL 17;
- shared substrate required to reconstruct the predecessor environment: **SIMULATED / TEST**;
- external identity/Clerk transport in the harness: **SIMULATED / TEST**;
- Plan demo content: explicit `NOT_SUPPLIED` unless a test intentionally supplies a non-financial conflict probe;
- financial return, target, probability, suitability outcome, live price, or execution result: **UNAVAILABLE / NOT PRODUCED** by this gate.

The legacy `I4C_PLAN_RUNTIME_WRITER_CANDIDATE.sql`, its four-argument `investing.i4_plan_write_v1(...)`, the associated runtime audit patch, and the old SQL `I4D_PLAN_FUNCTIONAL_REHEARSAL.sql` remain non-canonical references and cannot approve I4.

## Repository quality and dependency baseline

The repository debt that previously produced six global test failures was repaired before this checkpoint. A full verification subsequently proved 181 test files passing, 811 tests passing, zero test failures, lint/typecheck/build success, and zero npm advisories after a normal non-force lockfile repair.

The permanent CI now gates both the full dependency graph and production-only dependency graph. Production QA steps are restricted to direct pushes of `main`; branch and pull-request CI must not call the production scanner refresh, Trading production audit, or billing entitlement audit.

A non-failing Turbopack build warning remains for dynamic filesystem tracing under `lib/trading/backtest/twelveDataArchiveSync.ts`. It is a packaging/performance warning, not an I4 correctness or ESLint failure, and is not silently reclassified as clean.

## Externally verified production state before freeze candidate

Supabase production project: `qdnvbamoamtkujzwrxdb`.

Verified state before this checkpoint:

- PostgreSQL server version: `17.6`;
- development branches: only `main` exists; no disposable rehearsal branch remains;
- production migration tail: `20260822223021_revoke_legacy_public_function_execute_for_investing_isolation`;
- no I2/I3/I4 Genesis migration from this reconciliation has been applied to production.

GitHub `main` was independently observed at `67393626c3bd3dbb7c18a4ff7235f9ea06f93e13` before this checkpoint. This repair branch has not been merged.

The latest audited pre-safety-patch branch CI did not run the production scanner refresh because both refresh secrets were absent and the step failed closed before invoking `qa:post-deploy`. The permanent CI is now additionally hardened so non-main branch/PR runs skip all production QA steps entirely.

## Freeze gates

The exact commit containing this document may be declared `I4 = FROZEN` only if all of the following are true on that exact SHA:

1. GitHub global CI `dependency-audit` succeeds with both full `npm audit --audit-level=low` and production dependency audit passing.
2. GitHub global CI `verify` succeeds: global tests, ESLint, TypeScript, and production build all pass.
3. On the repair branch, `Post-deploy production smoke`, `Trading production audit`, and `Billing entitlement audit` are `skipped` by branch isolation, not executed.
4. The I4 static workflow succeeds for `i4-tests`, `i4-lint`, exact I4-B baseline reference, typecheck, and build.
5. The `i0-i4-pg17-rehearsal` job succeeds against PostgreSQL 17 and proves its exact checkout SHA.
6. No new failure exists versus the accepted baseline; after repository-debt repair the expected global result is zero test failures.
7. Supabase still has no disposable development/rehearsal branch and production migration tail remains unchanged.
8. GitHub `main` remains unmodified by this operation.
9. No merge, production deploy, production migration, production DDL/DML, or financial-truth mutation is performed as part of the freeze.

If any gate fails, status remains `CANONICAL FREEZE CANDIDATE` and the failure must be resolved and re-audited before a new freeze decision.
