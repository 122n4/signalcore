# Investing Trust Boundary

This document describes the boundary implemented for Syntrake Investing server routes.

## Request Flow

Financial Investing routes follow this order:

1. Clerk server session identifies the request user.
2. The server resolves one active Investing tenant membership for that user.
3. Account, queue, order or portfolio selectors from the browser are validated server-side.
4. Only after that validation may the route use Supabase service role or call a financial RPC.
5. The response includes availability/provenance when financial values are estimated, stale or unavailable.

Service role is not authorization. It bypasses RLS, so every service-role financial operation must first prove the user, tenant and account/portfolio scope in server code or in a documented RPC validation.

## Tenant Resolution

`lib/investing/server/authz.ts` resolves tenant context from `investing_tenant_memberships`.

Requirements:

- membership `user_id` must match the Clerk user;
- membership must be `active`;
- `revoked_at` must be null;
- the referenced tenant in `investing_tenants` must be `active`;
- zero memberships fail closed;
- multiple active memberships fail closed until multi-tenant selection is implemented.

The browser never supplies trusted `tenantId`.

## Portfolio Scope

There is no separate Investing portfolio registry in this PR.

`primary` is treated as the default portfolio selector for a resolved single-tenant user. Non-primary portfolio IDs require an existing `investing_accounts` row for the same `user_id`, `owner_user_id`, `tenant_id` and `portfolio_id`.

Routes that close a daily cycle require an existing active account for the selected portfolio and environment.

## Account, Queue and Order Scope

Account checks require:

- `accountId`;
- resolved `userId`;
- resolved `tenantId`;
- matching `owner_user_id`;
- optional `portfolioId`;
- optional `environment`;
- active status when the operation requires it.

Queue checks first verify the queue belongs to the authenticated user and Investing mode. If the queue has an account, the account is validated through the same account boundary. If it only has a portfolio, the portfolio boundary is used.

Order checks verify the order belongs to the authenticated user and then validate the order account through the account boundary.

## RLS vs Server Authz

RLS still protects direct Supabase Data API access where policies exist. Server routes that use `SUPABASE_SERVICE_ROLE_KEY` must not rely on RLS. The server authorization boundary is mandatory for those routes.

This PR does not change RLS, grants, SECURITY DEFINER functions or migrations.

## Provenance Vocabulary

Financial responses use a small vocabulary:

- `REAL`: fresh, canonical data for the current environment.
- `STALE`: prior market evidence or provider fallback that must not be treated as fresh.
- `ESTIMATED`: derived from runtime projection or cost basis fallback.
- `SIMULATED`: execution environment is paper/simulation even if market prices are real.
- `UNAVAILABLE`: the value cannot be proven safely.

When identity, ownership, price or provenance cannot be proven, user-facing responses should prefer:

`Dados indisponíveis neste momento`

## Protected Routes

The boundary is applied to:

- `/api/investing/dashboard`
- `/api/investing/accounts`
- `/api/investing/accounts/[accountId]/movements`
- `/api/investing/paper/accounts`
- `/api/investing/paper/accounts/[accountId]/movements`
- `/api/investing/paper/orders`
- `/api/investing/paper/orders/[orderId]`
- `/api/investing/daily-cycle`
- `/api/investing/plan`
- `/api/investing/preferences`
- `/api/investing/broker/connections`
- `/api/ops/investing/approvals`

`/api/ops/investing/approvals` remains path-compatible but is treated as a user-scoped Investing approvals endpoint. A later PR should either rename it or add a separate operator-only endpoint.
