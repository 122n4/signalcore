# RL-9C3A — Canonical Embargo Intersection Prefilter V1

Status: `CODE_CANDIDATE / NON_AUTHORITATIVE_PREFILTER / REAL_VAULT_UNAVAILABLE`.

Accepted Git predecessor: `60f6a9d9e5690415a962002e73d042a278a977fc`.
Previous reviewed candidate: `fa3009b2cb402f5fcaf2da883d1f127b522716d7` (same executable and tests; predecessor rebased to accepted PR #136).

## Why this executable exists

The accepted RL-9 design requires that all ordinary Research data resolver routes refuse holdout-overlapping canonical market facts before reveal, independent of provider or frequency. A single absent provider check can break the embargo. The earliest useful executable is a pure, deterministic intersection prefilter with adversarial tests. It has **no external service dependency or added paid hosting cost**.

`lib/investing/research/blindTruthEmbargoIntersection.ts` exports `inspectBlindTruthEmbargoIntersectionV1` and input/output types. This function:
- Validates a canonical request shape, exact market IDs, exact field IDs, inclusive civil-date coverage, and explicit canonical mapping state.
- Validates each supplied holdout scope using the **accepted RL-9 canonicalization** (`canonicalBlindTruthHoldoutScopeV1`) rather than inventing a second holdout hash/canonical law.
- Returns `DENY / EMBARGO_INTERSECTION` when the market intersection, field intersection, and inclusive date-window intersection all hold, **ignoring provider and requested frequency**.
- Returns `UNPROVEN / MAPPING_NOT_VERIFIED` for ambiguous/missing adapter mapping; `UNPROVEN / MALFORMED_EVIDENCE` for invalid inputs; `UNPROVEN / NO_EMBARGO_SNAPSHOT` for an empty supplied list; `UNPROVEN / NO_INTERSECTION_NOT_AUTHORIZATION` when the supplied list contains no intersection.
- Never returns `ALLOW`, never opens a dataset, and never authorizes any query. A resolver must treat all `UNPROVEN` results as fail-closed until separate server-side, durable, tenant-bound evidence proves that access is permitted.
- Does not accept privileged clients, credentials, provider requests, holdout ciphertext, financial data, storage locators, or key material.

## What this does NOT prove

The caller-provided `mappingState: VERIFIED` is an untrusted assertion until a future server adapter resolves provider-specific market/field identifiers using authoritative point-in-time mapping. The caller-provided `embargoScopes` list is not a proof of current authoritative, complete tenant-scoped embargo state, predecessor freeze, audit integrity, or atomic registration + embargo activation. A scope may have been sealed/revealed/expired: those transitions must be reconstructed from accepted persisted authority, never client input. A `NO_INTERSECTION` observation is **not evidence of no prior holdout exposure**.

This module is intentionally **not wired** to an ordinary resolver yet; doing so safely requires database/adapter contracts, authoritative tenant scope, atomic embargo state and append-only read/access evidence. Until that integration is implemented, running the prefilter alone provides **no operational embargo**. No live holdouts may be accepted.

## Scope, negative tests and owner constraints

Tests in `tests/investingGenesisI5Rl9c3aEmbargoIntersection.test.ts` cover inclusive boundaries, canonical market/field intersections, provider/frequency independence, disjoint sets, empty snapshots, mapping ambiguity, malformed dates and scope, duplicate IDs, inherited prototype, extra/symbol keys, getter attack, and the absence of read-authorization results.

No production SQL/DDL/DML, migration, Auth/Storage policy, new Supabase project/organization, Vercel route or worker, real secret, merge, or deployment operation is authorized by this candidate. Research Lab remains optional; **Core must not depend on this module**.

Acceptance is limited to `RL-9C3A_NONAUTHORITATIVE_PREFILTER_TESTED`. RL-9/10/11, real embargo/secret isolation and one-shot revelation remain `IN_PROGRESS / BLOCKED` until separately audited authority/infra gates. The current user has **no VPS** and requests **no additional paid infrastructure** at this stage.

Supersedes: none of the accepted RL-9 design, canonical V1 hash domains, persistence, ordinary data resolvers or existing authority. This is the first executable prerequisite toward the accepted ordinary resolver embargo, not a replacement for it.
