# RL-9C3B2A — Atomic Embargo Fence Storage Foundation V1

Status: `CANDIDATE / STACKED_ON_PR_138 / NOT_ACCEPTED / PRODUCTION_NOT_APPLIED / NO_REAL_HOLDOUTS`.

Accepted main predecessor: `f9b377668b1eea56ee8b18afa9151a24291e385c`.
Unaccepted immediate predecessor (PR #138 RL-9C3B1): `a6084e94ea7dc679c64b13289c7d29449cdf7efe`.

## Exact scope and why this is NOT the whole RL-9C3B

The predecessor PR #138 removes the ordinary application registration grant until
the accepted embargo contract can be proved. This **stacked** slice installs a
separate durable scope metadata relation and an AFTER INSERT trigger on the accepted
RL-9B scientific registration relation. PostgreSQL executes the trigger and the
registration insertion inside the same transaction: trigger errors abort both.
No new read authorization is granted by this.

The fence relation, `investing.research_blind_truth_embargo_fences_v1`, stores ONLY
public canonical scope metadata, tenant/principal/investigation authority,
registration identity/hash, scope digest and timestamp. No secret ciphertext,
plaintext, data locator, HMAC key or salt is admitted.

- Primary key on accepted registration identity, FK to the registration table,
  tenant-scoped registration uniqueness, canonical scope validator plus
  domain-separated SHA-256 digest check.
- FORCE RLS, dedicated RL-9 writer INSERT and tenant/investigation-scoped SELECT
  policies; no frontend/app/service_role table privileges.
- A `SECURITY DEFINER` AFTER INSERT trigger **owned by the restricted**
  `investing_rl9_writer`, pinned `search_path=pg_catalog`, validates actual
  server-side registration identities/GUC authority and records the scope in
  the same SQL transaction. Any trigger failure cancels the registration insert.
- Append-only UPDATE/DELETE trigger, reuse of existing accepted immutability
  rejection, no key material or additional public table grants.
- Temporarily grants schema CREATE to the restricted function owner during
  migration, then revokes it. Explicit `pg_auth_members` inspection rules out
  residual effective SET/INHERIT grants in managed PostgreSQL 17.
- Migration refuses installations with already persisted Blind Truth registrations
  because previous access/exposure cannot be reconstructed from missing evidence.
  Production was independently observed to have zero registrations at design time;
  this precondition is re-evaluated upon rehearsal/application.
- **Registration EXECUTE to `investing_app` stays DENIED** as in PR #138.

## Required rehearsal and limitations

New dedicated PostgreSQL 17 job performs an isolated replay through C3B2A and
checks RLS/FORCE, exact table/trigger/function owner, no forbidden grants,
actual ordinary-app SQLSTATE 42501 denials, scope hash CHECK, lack of
confidential payload columns and no residual role grants. The existing managed-role,
RL-9B1/B2, cumulative and full Genesis PG17 gates must also pass.

**This first foundation does NOT yet prove the positive atomic registration+fence
flow on a valid scientific promotion fixture**; it still requires an actual
positive and rollback/concurrent-writer PG17 rehearsal, with a fully valid
scientific registration, before that invariant is accepted. Such testing may
reveal corrections needed in the migration. It is NOT sufficient to reason only
from the existence of an AFTER INSERT trigger.

More fundamentally, a persisted fence is NOT an operational embargo. The same
accepted contract also requires:
- complete prior materialization/access audit and proof of no earlier exposure;
- server-owned, exact point-in-time provider/market/field mapping;
- every ordinary provider/cache/dataset/preview/optimizer path to synchronize
  against a durable fence and reject overlapping reads even across providers
  or requested frequencies;
- no read-versus-registration race; no stale or incomplete fence snapshot;
- tenant-scoped negative tests and actual concurrent race/rollback/recovery;
- independent real Vault security tests with *synthetic* canary before any secret;
- no optimistic permission return from RL-9C3A `UNPROVEN`.

A read or registration is still BLOCKED unless every condition is proved.
No new paid project, VPS, KMS, Production DDL/DML, Vault or real holdout is
authorized by this candidate. The agreed potential US$10/month extra compute
remains unspent and needs later authorization.

## Gate

Do not merge without owner authorization and independent SHA/diff, full CI,
targeted PostgreSQL 17, managed-role replay, production drift checks and
rehearsal proof. Do not apply migration to Production without a separately
explicitly authorized exact-SHA migration gate. PR #138 remains DRAFT,
unmerged and an **unaccepted dependency**. This stacked candidate never promotes
its predecessor to accepted automatically.

RL-9 remains `IN_PROGRESS`; Investing and Trading Core do not depend on Lab.
