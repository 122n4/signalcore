# Investing pre-change audit - 2026-07-19

## Confirmed violations

- FALHOU: `lib/investing/reconciliation.ts` imports `@/lib/broker/shared` and `@/lib/supabase/admin`.
- PARCIALMENTE PROVADO: `lib/investing/opsAudit.ts` imports the shared Supabase admin helper instead of an Investing-owned server boundary.
- FALHOU: `app/api/daily-snapshot/route.ts` persists one financial cycle through independent `upsert` calls to `daily_snapshots`, `investing_mandate_snapshots`, `investing_rebalance_ledger`, `investing_research_snapshots`, `investing_execution_queue`, and `journal_entries`.
- FALHOU: `app/api/ops/investing/approvals/route.ts` updates the queue and writes approval history as separate operations.
- NAO PROVADO: there is no Investing-owned accounting ledger, order table, fill table, fee table, cash movement table, corporate action table, or paper broker adapter.
- NAO PROVADO: no PostgreSQL lock/RPC layer proves atomic rollback for daily cycles, approvals, or execution submission.
- PARCIALMENTE PROVADO: audit fingerprints exist, but historical tables permit normal update policies in existing migrations.
- FALHOU: local environment contains sensitive variable names with real local values. Values were not copied into this report.

## Affected files

- `lib/investing/reconciliation.ts`
- `lib/investing/opsAudit.ts`
- `lib/investing/persistence.ts`
- `lib/investing/execution.ts`
- `app/api/daily-snapshot/route.ts`
- `app/api/ops/investing/approvals/route.ts`
- `supabase/migrations/20260717110000_create_investing_audit_tables.sql`
- `supabase/migrations/20260707190000_create_investing_core_tables.sql`

## Migration plan

1. Add new append-only Investing schema migration for accounts, balances, movements, orders, fills, fees, positions/lots, corporate actions, ledger transactions/entries, execution events, control evaluations, reconciliation runs/items, and readiness gates.
2. Add database trigger guards to prevent UPDATE/DELETE on historical Investing audit and ledger tables.
3. Add RPC functions for atomic daily cycle persistence, approval decisions, live-blocked execution attempts, and ledger-balanced transaction insertion.
4. Keep previous migrations intact and add compatibility columns rather than rewriting history.

## Compatibility risks

- Existing code may expect `approval_status` to be mutable in `investing_execution_queue`; the new RPC will be the supported mutation path.
- Existing rows cannot be converted into a valid trade ledger without fabricated fills, so backfill must mark them as `legacy_unverified` or `reconciliation_required`.
- Any client code importing `lib/investing/reconciliation.ts` with `BrokerSnapshot` must move to Investing-owned snapshot contracts.

## Strictly necessary changes

- Remove prohibited `lib/investing -> lib/broker` imports.
- Introduce Investing-owned broker contracts, money helpers, repository/admin boundary, execution state machine, paper/live-disabled adapters, ledger and reconciliation logic.
- Replace multi-step route writes with RPC calls where feasible.
- Add architecture, ledger, state, adapter, rollback/idempotency and security tests.
