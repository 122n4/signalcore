# Syntrake Investing DB Security Hardening - Phase 1

Date: 2026-08-11

Base: PR #29 HEAD `2e9660828b0ac8d001c883671d5a08614f4381c9`

## Scope

This phase hardens Investing database exposure without production execution:

- normalize future default privileges for future `public` objects created by the migration owner;
- remove `anon` direct table/sequence access from Investing relations;
- remove direct browser DML grants from `authenticated`;
- remove direct browser RPC execution for Investing scope-check `SECURITY DEFINER` helpers;
- pin search paths for Investing functions reported with mutable `search_path`;
- classify RLS-enabled Investing tables that intentionally have no browser policy.

No production DDL, DML, `db push`, migration repair, schema repair, grants outside the migration, Research Lab semantic change, or Engine internal semantic change is part of this PR.

## Production Read-Only Inventory Before

Supabase Security Advisor reported Investing findings:

- `rls_enabled_no_policy` on:
  - `investing_beta_activation_decisions`
  - `investing_effective_beta_readiness`
  - `investing_effective_readiness_revocations`
  - `investing_market_snapshot_items`
  - `investing_market_snapshots`
  - `investing_onboarding_progress`
  - `investing_release_candidates`
  - `investing_research_beta_readiness_reports`
  - `investing_worker_heartbeats`
- `function_search_path_mutable` on:
  - `investing_touch_updated_at()`
  - `investing_block_append_only()`
  - `investing_assert_ledger_balanced(uuid)`
- `authenticated_security_definer_function_executable` on:
  - `investing_has_scope_permission_v1(uuid,text,text)`
  - `investing_research_has_exact_scope_v1(uuid,text,text,uuid)`

Read-only inventory found 61 Investing tables and 82 Investing functions in production. No simple `user_id = auth.uid()` Investing policy was detected in the inventory query.

The production migration history was rechecked read-only before the review fix. The maximum applied production version was:

- `20260812132000_drop_broken_remote_investing_onboarding_rpcs`

The Phase 1 hardening migration is therefore versioned after that recovered production history:

- removed from this PR: `20260811185228_investing_db_security_hardening_phase1.sql`
- current forward migration: `20260812133000_investing_db_security_hardening_phase1.sql`

## Object Classification

Browser-readable with RLS policy:

- tenant/account read models needed by existing browser-authenticated RLS tests;
- historical Research read models that already expose `SELECT` to `authenticated` through tenant/account-scoped RLS.

Browser RPC required:

- none added in this phase.

Server only:

- `investing_beta_activation_decisions`
- `investing_effective_beta_readiness`
- `investing_effective_readiness_revocations`
- `investing_market_snapshot_items`
- `investing_market_snapshots`
- `investing_onboarding_progress`
- `investing_release_candidates`
- `investing_research_beta_readiness_reports`
- `investing_worker_heartbeats`

Internal helpers:

- `investing_internal.has_scope_permission_v1(uuid,text,text)`
- `investing_internal.research_has_exact_scope_v1(uuid,text,text,uuid)`
- public compatibility helpers `investing_has_scope_permission_v1(uuid,text,text)` and `investing_research_has_exact_scope_v1(uuid,text,text,uuid)` remain inaccessible as direct browser RPCs;
- trigger/accounting helpers with no browser execution requirement.

Unknown:

- none changed automatically.

## Grant Model After Migration

- `public`, `anon`: no direct privileges on Investing tables or sequences.
- `authenticated`: existing `SELECT` grants remain where already required by RLS-backed read models; direct table DML is revoked across Investing relations.
- `service_role`: existing explicit service grants are preserved for server-side operations; service role remains an execution credential, not an authorization model.
- Future default privileges for `postgres` in `public` no longer auto-grant tables, sequences, or functions to browser/service roles. This is a deliberate repo-wide secure-default posture for future `public` objects created by `postgres`; PostgreSQL default privileges cannot be filtered by object-name prefix, so this is not Investing-name-scoped.
- Future default privileges for `supabase_admin` are tightened only when the migration role is allowed to alter that owner. The local Supabase reset role is not a member of `supabase_admin`, so the regression test treats that platform-owned default ACL as observed inventory rather than an automatically repairable Investing grant.

## RLS And Helper Exposure

The two public scope helpers are no longer directly executable by `anon`, `authenticated`, or `service_role`.

Browser-facing policies use non-exposed `investing_internal` helpers for policy evaluation. The internal helpers are `SECURITY DEFINER` only to avoid tenant-membership RLS recursion while preserving the old helper semantics exactly:

`authenticated subject -> active owner membership -> active personal tenant -> canonical account scope`.

The `investing_internal` schema is not a PostgREST exposed schema. `authenticated` receives only the minimum schema usage and helper execute grants required for RLS policy evaluation. `anon`, `PUBLIC`, and `service_role` do not receive those internal helper grants.

Research policies keep their existing table-level read semantics and are rewritten to call `investing_internal.research_has_exact_scope_v1(...)`, which checks the exact tenant, owner, portfolio and account tuple before applying the same active owner membership gate.

## Regression Tests

`supabase/tests/investing_security_accounting.sql` now asserts:

- no Investing `SECURITY DEFINER` function is executable by `anon`, `authenticated`, or `PUBLIC`;
- mutable-search-path functions have explicit `search_path = pg_catalog, public`;
- broad future default ACLs are absent for Investing migration owners;
- the RLS no-policy Investing set exactly matches the classified server-only set;
- `anon` cannot read Investing financial tables or execute scope helpers;
- `authenticated` cannot write Investing financial tables directly or execute scope helpers;
- adversarial memberships are hidden when tenant ownership, tenant status, membership status, revocation or JWT subject do not match the canonical active owner boundary;
- representative Research rows are visible only for the exact tenant/owner/portfolio/account tuple and hidden cross-user or malformed-scope;
- existing authenticated same-user reads and cross-user isolation remain intact.

## Production Impact Plan

Apply only after this PR is reviewed and merged through the normal migration pipeline. The migration is designed to be idempotent for policy replacement and privilege revocation. Post-apply validation should compare Supabase Security Advisor output against the before inventory and confirm the Investing helper/search-path findings are gone while non-Investing and out-of-scope findings remain separate.
