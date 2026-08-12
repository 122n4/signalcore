# Syntrake Canonical Integration R3

Parent R2 SHA: `f277d3bff1d93c3850c22f1d84040d516feb3527`

R3 establishes the canonical read contract for Investing plans and the user-level UI preference contract. It does not start R4 and does not certify financial suitability, expected return, or goal probability.

## Canonical Plan Contract

Storage source: `public.plans`.

Canonical selection is scoped by server-derived Clerk user only:

```text
user_id = authenticated user
mode = investing
status = active
is_active = true
limit 2
```

Outcomes:

- Zero active rows: valid empty state, `UNAVAILABLE / plan_missing`; no write, seed, or synthetic plan.
- One active row: validate material fields and project a minimal DTO.
- More than one active row: fail closed. `/api/investing/plan` returns HTTP 409 with `investing_plan_ambiguous`; the dashboard keeps independently valid portfolio truth and returns plan truth as unavailable.

The public plan DTO never exposes `user_id` or raw `payload`. The legacy `plans.goal` field is exposed only as a human-readable `summary` after basic string validation. It is not interpreted as target amount, risk, expected return, probability, horizon, allocation, or execution authority.

Structured payload v1 is closed and limited to user mandate inputs:

```text
schemaVersion
objective.type
objective.targetAmount
objective.timeframeMonths
objective.monthlyContribution
risk.profile
guardrails.maxSinglePositionPct
guardrails.maxTop5Pct
```

Unknown keys and modelling outputs such as expected return, projected value, goal probability, alpha, performance, or guaranteed return make the structured section unavailable. Empty `{}` payload means the row can exist, while structured mandate, target, and risk remain unavailable.

Plan writes are intentionally deferred because the current schema does not prove one active plan per `user_id + mode`, does not prove immutable version history, and R1 does not establish a plan write authorization contract.

## Canonical Preferences Contract

Route: `/api/investing/preferences`.

Storage source: `public.user_settings.investing_ui_state`.

Preferences are user-level UI state only. They do not establish tenant, account, portfolio, broker, execution, plan, risk, or financial authority.

V1 schema:

```ts
{
  schemaVersion: 1,
  defaultScreen: "overview" | "portfolio" | "plan" | "insights" | null
}
```

GET is read-only. A missing `user_settings` row returns the default preference state and performs zero writes. PUT validates strictly and upserts only `user_id`, `investing_ui_state`, and `updated_at`, preserving unrelated columns.

Financial/security keys and truth-hiding keys are rejected, including tenant/account identity, portfolio identity, risk, goal, broker, execution, permissions, and provenance-hiding preferences.

## Legacy Isolation

The following routes remain compatibility-only and are not canonical R3 authority:

- `/api/plans`
- `/api/plan/apply`
- `/api/user-settings`

Canonical R3 does not call `planFromSettings()` or `upsertDefaultPlanIfMissing()`. It does not synthesize EUR 50k, Balanced, Long, default guardrails, fixed-return assumptions, goal probability, or projected value.

Dead recovered RPC names remain banned from the canonical path.

## Dashboard And UI

The dashboard no longer selects plan truth by newest `plans.created_at`. It reuses the canonical active-plan selector and returns the same minimal projection used by `/api/investing/plan`.

The Investing Plan screen consumes the canonical plan envelope:

- Missing plan: `Plan not available`, no target.
- Ambiguous plan: `Plan unavailable`, no selected plan, no target.
- Text-only legacy plan: summary/version may show; structured target remains unavailable.
- Valid structured v1: only present fields are displayed.

Portfolio/cash truth remains independent from plan truth.

## Database Scope

R3 adds zero migrations and performs zero production writes. The preflight observed production Supabase max migration:

```text
20260812132000 drop_broken_remote_investing_onboarding_rpcs
```

The next canonical migration remains present in Git and not live:

```text
20260812133000_investing_db_security_hardening_phase1.sql
```

Observed read-only plan aggregate at R3 preflight:

```text
28 Investing user scopes
15 scopes with multiple plan rows
1 scope with multiple active plan rows
max plan version observed = 1
```

This remains a warning and is not repaired by R3.

## Validation

Local focused R3 validation before commit:

```text
npx vitest run tests/investingCanonicalPlan.test.ts tests/investingPlanRoute.test.ts tests/investingPreferences.test.ts tests/investingPreferencesRoute.test.ts tests/investingDashboardCompactRead.test.ts tests/investingExperienceModel.test.ts tests/investingExperience.test.tsx
7 files / 65 tests passed

npx tsc --noEmit
passed
```

Additional gates are recorded in the PR report.

## Non-Scope

R3 does not modify:

- `lib/investing/server/authz.ts`
- migrations or recovered migration history
- Supabase production schema/data
- Research Lab
- Engine Phase3C/3D/3E/3F internals
- broker connections
- account movements
- canonical plan mutation

R3 DOES NOT CERTIFY FINANCIAL SUITABILITY.
R3 DOES NOT CERTIFY EXPECTED RETURN.
R3 DOES NOT CERTIFY GOAL PROBABILITY.
R3 ESTABLISHES THE CONTRACT NEEDED FOR THOSE LATER VALIDATIONS.
