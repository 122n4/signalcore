# RL-9C3B2B4 — Persistent Fence Preflight, No Read Grant

Status: `CODE_CANDIDATE / DENY_ONLY / PRODUCTION_NOT_APPLIED / OPERATIONAL_EMBARGO_NOT_PROVED`.

Main accepted predecessor: `f9b377668b1eea56ee8b18afa9151a24291e385c`.
Stacked unaccepted PRs: #138 → #139 → #140 → #141 → #142 → #143.
Immediate candidate predecessor (#143): `989200a31671f31312963717886308a803577c2a`.

## Executable addition

Git-only migration `20261012190000_investing_i5_rl9c3b2b4_persisted_fence_deny_preflight.sql` extends the existing append-only denied-read journal (C3B2B2) with an *internal*, constrained `preflight_observation` field. Previously persisted events are tagged `NOT_EVALUATED`; no historical exposure is inferred or backfilled.

The `investing_rl9_writer`-owned, `SECURITY DEFINER` function `rl9c3b2b4_record_persisted_fence_preflight_v1(text,text[],text[],date,date)` validates strictly scoped, claimed tenant/request data, locks on the same transaction key as the C3B2B2 registration trigger, inspects only the RLS-visible persisted embargo fences, and appends an immutable denial event with either:

- `CLAIMED_SCOPE_INTERSECTS_VISIBLE_FENCE`
- `NO_OVERLAP_IN_VISIBLE_FENCES_NOT_AUTHORIZATION`

**In both cases the only external return is `UNPROVEN_NOT_AUTHORIZED`.** Front-end, service_role, anon and authenticated roles cannot SELECT the fence/audit table or invoke the new procedure. `investing_app` can invoke this **denial recorder only**; no ALLOW or provider data is returned. The registration EXECUTE revocation remains intact.

Cross-provider and cross-frequency potential intersection uses *claimed canonical market/field/coverage*, not provider-specific IDs, and inclusive civil-day overlap. No caller list (or empty RLS view) proves complete authoritative embargo state. Malformed/unbounded/duplicate arrays, inconsistent dates and missing context fail closed. Scope matching does not leak embargo details through the return value.

### PostgreSQL tests

New dedicated PG17 test replays all migrations through B4, verifies permissions and FORCE RLS inheritance, empty-embargo denial, adversarial input rejection, immutable audit, no temporary role capabilities and continued registration lock. Existing real RL-9B2/C3B2A integration fixture is extended to install B4 *after* valid committed scientific registration and test matching-vs-disjoint claimed scope against real same-tenant persisted fences: **both are externally denied**, with different internal observations. The latter fixture runs only on disposable PostgreSQL 17.

## Security non-claims and next slice

A claimed canonical market/field mapping and GUCs do not prove ownership, point-in-time instrument mapping or snapshot completeness. The journal is not a complete before-registration access history and does not establish absence of earlier exposure. The database lock ends with the preflight transaction, **not** the full series byte retrieval/delivery. Because the ordinary Research/Validation reader seam is not yet wired to this SQL and its inputs are not server-verified, this candidate **does not protect real observation access paths** or create an operational embargo. Never treat the two journal observation labels as scientific evidence of no exposure.

Next must authenticate read authorization server-side, derive canonical market/field mapping from trusted registered adapters, ensure a complete atomic fence snapshot and append-only *all-read* audit, hold synchronization across actual provider/cache read/return, test concurrent registration and real byte delivery on PG17, and prevent alternate provider/frequency/API bypasses. No real holdout admission, Vault provisioning, fee, production migrations, merge, or Core/Trading coupling are authorized.
