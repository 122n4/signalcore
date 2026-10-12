# RL-9C3B2B0 — Investing Research Read-Surface Inventory Gate V1

Status: `CANDIDATE / NON_AUTHORITATIVE_INVENTORY / OPERATIONAL_EMBARGO_NOT_IMPLEMENTED / PRODUCTION_UNCHANGED`.

Accepted main predecessor: `f9b377668b1eea56ee8b18afa9151a24291e385c`.
Stacked predecessor (PR #138, unaccepted): `a6084e94ea7dc679c64b13289c7d29449cdf7efe`.
Immediate predecessor (PR #139, unaccepted): `0fcc19dd0522825583b8ed70f58d94effea1e108`.

## Why this gate exists

RL-9C3B2A proves atomic creation of a durable canonical holdout fence with a scientific registration. It does **not** connect that fence to Research/Validation reads or prove complete prior non-exposure. Until that work is done, real holdout admission is BLOCKED; the RL-9B registration `investing_app` EXECUTE grant remains revoked by C3B1.

A source-code review at the exact predecessor found the following *actual Investing Research* access path:

1. `lib/investing/research/researchExecutionService.ts` passes a `ResearchDatasetMaterialProviderV1` into `researchExecutionWriter.ts`.
2. `lib/investing/research/validationExecutionService.ts` passes the same provider contract into `validationExecutionWriter.ts`.
3. Both writers call `provider.loadSeriesContent(seriesRef)` to obtain observation bytes.
4. `lib/investing/research/datasetMaterial.ts` defines that method as a hash-only lookup; its in-memory implementation returns bytes by content hash. The signature carries no authoritative tenant-bound market/field/coverage decision, embargo snapshot, lock or access-audit receipt.

The associated Vitest gate inventories direct `provider.loadSeriesContent(...)` call sites recursively under `lib/investing/research`; new such sites break CI until consciously reviewed. It also pins the two service injection paths and the non-authorizing RL-9C3A classification. **This is a coverage regression test, not proof that other access paths do not exist.** Static source matches can be evaded by aliases, indirect calls, dynamic imports, exports, adapters and external resources.

## Additional routes to inventory and control before C3B2B acceptance

- DatasetSeries/DatasetSnapshot persistence, artifacts and historical materialization;
- provider-specific market/field identity and point-in-time mapping;
- Research import/preview/export/optimizer surfaces, cache and dataset reuse;
- alternate frequencies and providers revealing equivalent canonical facts;
- async materialization and reads occurring concurrently with fence activation;
- audit completeness for material previously available to ordinary Research;
- any direct SQL/Storage/HTTP access capable of bypassing the scoped resolver.

The repository also contains `lib/market/marketClient.ts` and individual market adapters, plus trading research paths; their reachability from the **Investing Research** authority boundary is not proved by this gate. Do not merge Lab authorization into Trading or make Investing/Trading Core depend on Lab.

## Next executable slices and their gates

Implement a *server-owned* authoritative mapping and read protocol that connects ordinary Investing Research reads to persisted tenant-bound fences and append-only access evidence, with DB synchronization against registration. Read-vs-registration races must not permit bytes to be returned after an embargo commits. Unknown mapping, missing audit history, incomplete provider/cache coverage and `UNPROVEN` fail closed. Validate with real disposable PostgreSQL 17 read/write concurrency, rollback, crash/recovery and tenant-isolation tests. Only a later independently audited end-to-end gate can justify restoring registration admission.

No SQL migrations, secrets, real holdouts, provider credentials, production changes, paid infrastructure, merge or deployment authority are added by this inventory slice. It provides a runnable change-detection gate while the actual embargo remains **NOT IMPLEMENTED**.
