# Syntrake Canonical Integration R1

R1 establishes the canonical customer-facing Investing account/auth read contract.

R1 parent:

```text
335ddb6581bd3e909d5d601d9d67b8893000612d
```

R1 branch:

```text
integration/syntrake-canonical-r1
```

The exact final R1 commit SHA is the Git commit containing this document and is recorded in PR metadata and the final review report.

## Implemented Trust Chain

R1 hardens the server-side trust chain:

```text
Clerk authenticated user
-> active personal tenant
-> active owner membership
-> canonical Investing account rows
-> account_id
```

Membership resolution requires exactly one active, non-revoked candidate for the authenticated Clerk user. The membership must prove:

- `user_id` equals the authenticated Clerk user;
- `status = active`;
- `revoked_at is null`;
- `role = owner`;
- `permissions` contains `investing:read`;
- `tenant_id` is non-empty.

The tenant must independently prove:

- `id` equals the resolved membership tenant;
- `owner_user_id` equals the authenticated Clerk user;
- `kind = personal`;
- `status = active`.

Malformed cross-owner membership rows fail closed. Ambiguous active membership candidates return the existing ambiguity semantics. `service_role` remains a database capability, not authorization.

## GET `/api/investing/accounts`

R1 adds only the collection `GET` route:

```text
GET /api/investing/accounts
```

The route is read-only and returns:

```json
{
  "ok": true,
  "accounts": [
    {
      "id": "account_id",
      "portfolioId": "primary",
      "environment": "paper",
      "status": "active",
      "baseCurrency": "EUR"
    }
  ]
}
```

Empty state is valid:

```json
{
  "ok": true,
  "accounts": []
}
```

The response deliberately does not expose:

- `user_id`;
- `owner_user_id`;
- `tenant_id`;
- membership IDs;
- permissions;
- service-role details;
- database internals.

The route ignores client-supplied identity or ownership inputs such as `userId`, `tenantId`, `ownerUserId`, `portfolioId`, and account ownership claims.

## Account Read Service

R1 adds a small server-side account read service that queries `public.investing_accounts` with server-derived scope only:

```text
tenant_id = resolved tenantId
user_id = authenticated Clerk userId
owner_user_id = authenticated Clerk userId
```

The service selects explicit columns only:

```text
id,user_id,owner_user_id,tenant_id,portfolio_id,base_currency,environment,status
```

It does not use RPCs and does not call any recovered dirty RPC contract.

Returned account rows are validated before customer DTO conversion. Material trust/identity mismatch, malformed portfolio IDs, malformed base currency, unknown environment, or unknown account status fail closed.

Ordering is deterministic:

```text
portfolioId -> environment -> id
```

## Fail-Closed Rules

R1 preserves these status classes:

- unauthenticated request: `401`;
- missing, invalid, wrong-owner, inactive tenant or invalid membership: `403`;
- ambiguous membership resolution: `409`;
- database/auth infrastructure unavailable: existing `financial_data_unavailable` / `503` semantics;
- unexpected route error: sanitized `500`.

No route should leak whether another user's tenant or account exists.

## Dirty RPC Ban

The following recovered/local RPC names remain `DO_NOT_RESURRECT`:

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

R1 introduces no runtime calls, wrappers, aliases, or migrations for these names.

## Zero-Write / Zero-Migration Guarantee

R1 does not:

- create accounts;
- open accounts;
- mutate accounts;
- expose movements;
- expose broker connections;
- change plan/preferences;
- change Research;
- change Engine internals;
- add migrations;
- modify historical migrations;
- change Supabase;
- deploy production.

Supabase live max migration observed before R1 implementation:

```text
20260812132000
```

The already defined architecture migration remains unapplied to production by R1:

```text
20260812133000_investing_db_security_hardening_phase1.sql
```

## Validation

R1 targeted validation:

```text
npx vitest run tests/investingTrustBoundary.test.ts tests/investingCanonicalAccounts.test.ts tests/investingAccountsRoute.test.ts
```

Affected Investing caller validation:

```text
npx vitest run tests/investingTrustBoundary.test.ts tests/investingCanonicalAccounts.test.ts tests/investingAccountsRoute.test.ts tests/investingDashboardCompactRead.test.ts tests/investingDailyCycleRoute.test.ts tests/investingCashActionsRoute.test.ts tests/investingApprovalsRoute.test.ts
```

Final validation results are recorded in the PR description and final review report.

## Non-Scope

R1 does not start R2.

R1 does not implement:

- account opening;
- account creation;
- account movements;
- broker connections;
- plan/preferences canonicalization;
- Accounting Truth;
- Market Truth;
- Research harvest;
- Engine/Research integration;
- Risk / Goal Probability;
- Investing LIVE Manual;
- Automated DEMO;
- Automated LIVE;
- Trading leveling.
