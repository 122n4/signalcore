# Syntrake Canonical Integration R0

R0 establishes the canonical integration foundation for Syntrake after the production dirty-tree recovery audit. It is governance, lineage, and contract documentation only.

R0 does not implement product behavior, API routes, database behavior, RLS, migrations, Supabase changes, or Vercel production changes.

## Technical Base

The canonical technical base for this integration line is:

```text
6269c1b9a8744cbc35b438310255fec723537fe8
```

This is the accepted architecture/security head containing:

- PR #28 Trust Boundary: `36d4d438c03df7ef371263157f2fb9cfc225e311`
- PR #29 Migration History Recovery: `2e9660828b0ac8d001c883671d5a08614f4381c9`
- PR #30 DB Security Hardening Phase 1: `6269c1b9a8744cbc35b438310255fec723537fe8`

R0 must not be based on `main`, clean `57ac`, `145dddec`, the production dirty worktree, or a GitHub-synthesized merge commit.

## Production Baseline

Production Git base:

```text
57ac0c96a45afd7774ae3001b835244945e61308
```

Production source reconstructibility:

```text
PARTIALLY_RECONSTRUCTIBLE
```

The exact production deploy worktree remains unknown. The live production deployment was a dirty CLI deployment and must not be treated as clean Git source.

Production Vercel project:

```text
signalcore-site
prj_RSSHviION9QODmd2Qa6L4qf4D4mQ
dpl_89RNMRTmgQSAM3CLpqWeBHuXVw52
syntrake.com
www.syntrake.com
gitDirty = true
```

The `signalcore` Vercel project is the PR/preview project. R0 does not rename or modify either project.

## Endpoint Decision Registry

### `/api/investing/accounts`

Decision: `KEEP_ROUTE`

Target slice: `R1`

Initial R1 scope: read-oriented.

Canonical meaning: authenticated read/list of canonical Investing accounts through:

```text
Clerk authenticated user
-> active tenant
-> canonical Investing account
-> account_id
```

R1 must not restore old dirty RPCs. Opening or creation lifecycle is not automatically part of R1.

### `/api/investing/accounts/[accountId]/movements`

Decision: `DEFER_TO_ACCOUNTING_TRUTH`

This endpoint must not be implemented in R0 or R1. Financial movement exposure must follow the canonical ledger/accounting model and must not fabricate movements or expose cross-account data.

### `/api/investing/broker/connections`

Decision: `DEFER_TO_LIVE_MANUAL_EXECUTION`

Broker connection semantics belong to the LIVE manual execution architecture. Broker connection presence must never establish account ownership, and no credentials or secrets may be exposed.

### `/api/investing/plan`

Decision: `FOUNDATION_NOW`

Target slice: `R3`

Canonical meaning: plan/version contract. No fake return assumptions, fake Goal Probability, or resurrection of old dirty RPC names is allowed. Unavailable modelling remains explicitly unavailable.

### `/api/investing/preferences`

Decision: `KEEP_USER_LEVEL_PREFERENCE_CAPABILITY`

Target slice: `R3`

Preferred storage direction: existing canonical `user_settings` path with an Investing-specific namespace, unless R3 proves a concrete reason not to.

Preferences must never authorize tenant, account, portfolio, or financial ownership.

## Dead Dirty RPC Registry

The following recovered/local RPC names are not part of the canonical target architecture and must not be resurrected:

- `open_investing_account_mode_v1`
- `read_investing_account_truth_v1`
- `list_investing_account_truth_v1`
- `propose_investing_live_manual_order_v1`
- `decide_investing_live_manual_order_v1`
- `read_investing_canonical_plan_v1`
- `read_investing_canonical_plan_version_v1`
- `list_investing_canonical_plan_history_v1`
- `replace_investing_canonical_plan_version_v2`
- `read_investing_dashboard_preferences_v1`
- `save_investing_dashboard_preferences_v1`

Dirty production functional intent may be preserved. Its old database/runtime contract is not canonical.

## Trust Contract

Accepted Syntrake Investing trust path:

```text
Clerk authenticated user
-> active personal tenant
-> active owner membership
-> canonical Investing account
-> account_id
-> financial data
```

Non-negotiable rules:

- `service_role` is a capability, not authorization.
- Client-supplied `userId` cannot establish financial authorization.
- Client-supplied `tenantId` cannot establish financial authorization.
- Client-supplied `portfolioId` cannot establish financial ownership.
- Client-supplied account ownership claims cannot establish financial ownership.
- Ambiguity must fail closed.

## Financial Truth Contract

Canonical availability vocabulary:

- `REAL`
- `STALE`
- `ESTIMATED`
- `SIMULATED`
- `DEMO`
- `UNAVAILABLE`

Rules:

- Unknown provider response is not `REAL`.
- A cash-only canonical account can be `REAL`.
- Zero-quantity positions are not active holdings.
- Unavailable financial values must not be rendered as normal real values.

## Product Harvest Policy

The product feature harvest line is:

```text
145dddec3bf9f2948702e3553f62f38c17de59f5
```

This is a `PRODUCT_FEATURE_HARVEST_LINE`, not the canonical technical base.

Approved behavior to evaluate and harvest later:

- rebuilt Investing customer experience;
- independent first-screen loading;
- bounded quote loading;
- new-customer journey;
- funded portfolio journey;
- stale-price explanation;
- Overview/Advisor consistency;
- cash-flow-adjusted performance intent;
- valid shadow parity / Research behavior.

Architecture, security, and financial truth semantics always win over legacy implementations.

## Migration Policy

R0 must not add a migration.

Recovered production migration history is immutable. PR #29 historical migration files must not be edited to introduce new behavior.

PR #30 migration remains:

```text
20260812133000_investing_db_security_hardening_phase1.sql
```

Any genuinely new persistence introduced after canonical integration begins must use a new forward migration with version strictly greater than:

```text
20260812133000
```

Never create migrations merely to recreate dead production dirty RPC names.

## Future Slice Order

Canonical sequence:

1. R0 - canonical integration foundation
2. R1 - canonical account/auth contract
3. R2 - production UX + truth contract reconciliation
4. R3 - plan/preferences canonicalization
5. R4 - Accounting Truth + performance
6. R5 - Research/shadow parity harvest
7. R6 - DB Security integration verification
8. R7 - full QA / release readiness

After these gates:

1. Market Truth / Accounting Truth completion
2. Engine/Research integration
3. Risk / Goal Probability
4. Investing LIVE Manual
5. Automated DEMO
6. Automated LIVE
7. Trading leveling

None of these later slices start in R0.

## Repository Governance Target

Future invariant:

```text
ONE canonical Git lineage
-> clean reproducible commit
-> CI
-> Vercel Preview
-> controlled production promotion
```

Future production deployments must have clean Git provenance:

```text
gitDirty = 0
```

Dirty CLI production deployment is prohibited operational debt. Current GitHub `main` is legacy/stale and must not be used as the automatic integration target. R0 does not change GitHub default branch settings.

## R0 Scope Guard

R0 changes are limited to documentation and machine-readable manifest files.

R0 explicitly does not change:

- runtime behavior;
- API route behavior;
- business logic;
- migrations;
- RLS;
- Supabase;
- Vercel production;
- PR #28;
- PR #29;
- PR #30.
