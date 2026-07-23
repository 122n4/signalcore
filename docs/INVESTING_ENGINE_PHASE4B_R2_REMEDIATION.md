# FASE 4B-R2 remediation

FASE 4B-R2 is limited to the three blockers found by the independent R1
reaudit. It does not introduce an operational caller and does not enable Live.

## Authorization casing

TypeScript and PostgreSQL reserve `authorization` case-insensitively while
accepting only the exact canonical lowercase spelling. All alternative casing
is rejected before the value can be treated as neutral payload data.

## Root metadata and versioning

The material manifest now includes `rootMetadata.confidence` and
`rootMetadata.selectedCandidateId`. Loaded root values are compared with the
sealed final result before replay or idempotent retry.

This is a material manifest semantic change, so the contract is
`investing-engine-persistence-manifest/v3`. The incremental migration adds a
nullable persisted `manifest_version` marker. Existing v2 rows remain `NULL`
and fail closed; they are not backfilled or converted. New and updated root
rows must carry v3 through the R2 new-write constraint.

## Destructive QA target guard

The local/disposable/exact-confirmation requirements remain. Database names
with delimited production, prod, staging, stage, live, main, or primary tokens
are rejected before any destructive QA action, even when a QA/test token is
also present.

Synthetic 4A SQL and concurrency fixtures now declare manifest v3 explicitly
so they continue to exercise the schema without representing migrated
production history.
