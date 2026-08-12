# Syntrake Canonical Integration R2

Date: 2026-08-12

## Scope

R2 reconciles the primary Investing customer experience with the accepted canonical architecture from R1.

Primary experience routes:

- `/app?tab=daily&mode=investing` -> Overview
- `/app?tab=portfolio&mode=investing` -> Portfolio
- `/app?tab=planning&mode=investing` -> Plan
- `/app?tab=research&mode=investing` and legacy `advisor` -> Insights

Compatibility routes remain available through the old operational surface:

- `reports`
- `autonomy`
- `settings`

`welcomeSetup=1` and `offlineSetup=1` continue to use `OfflineSetupClient`.

## Financial Truth

The new primary experience reads only `GET /api/investing/dashboard` with `cache: no-store` and a bounded timeout. It does not perform client Supabase financial reads and does not call account, cash, order, plan, or preference mutation endpoints.

Customer-visible values follow the canonical availability vocabulary:

- `REAL`: numeric value can be shown normally.
- `STALE`: numeric value can be shown with a stale label.
- `ESTIMATED`: numeric value can be shown with an estimated label.
- `UNAVAILABLE`: numeric value is not shown as financial truth.

The backend dashboard now exposes `portfolio.cash`:

```ts
{
  amountEur: number;
  availability: "REAL" | "UNAVAILABLE";
  asOf: string | null;
}
```

`portfolio.cashEur` is preserved for compatibility. The new `portfolio.cash` contract is the customer truth field.

Cash truth rules:

- Canonical EUR cash row for the resolved account, including amount `0`, is `REAL`.
- Missing account or missing EUR cash row is `UNAVAILABLE`.
- Cash-only portfolios use valuation source `cash_only` and do not require market quotes.

## Explicitly Rejected

R2 does not resurrect:

- `loadInvestingExperienceDashboard()`
- `/api/investing/dashboard?view=experience`
- `read_investing_dashboard_compact_v1`
- dirty production RPC contracts that do not exist live
- client-side Supabase financial reads
- account creation from the new primary experience
- funding or order POSTs from the new primary experience
- fake plan targets, fake progress, fake returns, or fake performance

## Database

R2 has zero migrations, zero DDL, zero production DML, zero db push, and zero migration repair.

Any persistence needed by future Plan, Preferences, Accounting, or Broker work must be introduced through new forward migrations after:

`20260812133000_investing_db_security_hardening_phase1.sql`

## Boundaries

R2 does not alter:

- `lib/investing/server/authz.ts`
- Supabase schema
- RPCs
- Research Lab internals
- Engine Phase3C/3D/3E/3F internals
- PR #28, PR #29, PR #30, PR #31, or PR #32

## Validation

Required R2 validation:

- dashboard truth tests
- experience model tests
- experience rendering/static contract tests
- navigation tests
- R1 regression tests
- TypeScript
- ESLint
- build
- `git diff --check`
- baseline comparison against `2b2e771cde258c822862ca0ee343ace9689ed1cf`
- Vercel preview only
