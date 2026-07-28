# Investing Research Phase 6E

Phase 6E materializes the five frozen Phase 6C data tables and implements a
selective, finite, one-instrument/one-timeframe acquisition path.

`dataset_requests` owns deterministic scientific requirements.
`acquisition_jobs` retains one operational row per attempt.
`datasets` binds the logical dataset to its requirement.
`dataset_versions` binds immutable content to the exact scoped attempt and
stores a closed relative content-addressed storage reference.
`dataset_lineage` retains scoped append-only transformation edges.

Attempts are allocated transactionally under a lock on the scoped requirement;
the database rejects gaps and caller-selected attempt numbers. Active work
converges by scope, requirement and acquisition-policy version. Idempotency
keys, provider preferences, actors and correlation identifiers remain
operational metadata.

A version can be published only from the same scoped requirement and exact
attempt when that job is in `awaiting_quality` with an `acquired` outcome.
PostgreSQL compares provider provenance, hashes, normalized-row count, observed
coverage and the closed relative storage reference before accepting the
immutable version.

Application operations require an injected server-only authorization port;
structural objects, casts and the database service role are not authorization.
The server-only production composition reconstructs authenticated tenant,
membership, owner, portfolio and account scope through the canonical
`@/lib/investing/identity/server` entrypoint, then composes that authorization
with the PostgreSQL repository, event sink and clock. Callers cannot inject an
alternate authorization port.

Structural provider-response failures discovered during parsing or
normalization are translated at the acquisition boundary to a closed,
non-retryable `provider_response_invalid` outcome. Successful cancellation
emits one sanitized `acquisition_cancelled` event only after compare-and-set
persistence succeeds.

The maximum publication state is `awaiting_quality`. Phase 6E makes no quality,
bias, research-ready, experiment, promotion, Engine, Trading, broker or
financial-state claim. Provider credentials exist only in server composition.
