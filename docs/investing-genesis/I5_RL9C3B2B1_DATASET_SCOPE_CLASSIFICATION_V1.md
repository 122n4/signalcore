# RL-9C3B2B1 — Dataset-Series Canonical Scope Classification

Status: `CANDIDATE / PURE_DENY_OR_UNPROVEN / NOT_OPERATIONAL_EMBARGO / NO_REAL_HOLDOUTS`.

Accepted main: `f9b377668b1eea56ee8b18afa9151a24291e385c`.
Stacked PR #138: `a6084e94ea7dc679c64b13289c7d29449cdf7efe`.
Stacked PR #139: `0fcc19dd0522825583b8ed70f58d94effea1e108`.
Immediate unaccepted predecessor PR #140: `976389713cecf8f0f5440c090de3751057352edf`.

## Executable contract

`lib/investing/research/blindTruthDatasetScopeClassification.ts` takes a DatasetSeries V1 scientific descriptor, explicit source-to-canonical instrument/field mapping records and holdout-scope candidates. It reuses the accepted DatasetSeries canonicalizer and RL-9C3A embargo intersection classifier.

It detects **potential** overlap even when request and embargo use different providers or frequencies, because the comparison uses canonical market/field/coverage rather than provider labels. It rejects invalid series, ambiguous/missing mappings, malformed evidence, malicious accessors, prototype pollution and unknown scope; all negative results fail closed. **It never returns ALLOW.**

This step is intentionally honest about authority. Caller-supplied mapping records cannot prove the server registry, point-in-time instrument mapping, completeness or availability of committed embargo fences. Nor can a clean intersection prove absence of prior exposure or a valid persisted access ledger. The module cannot approve actual byte retrieval. It does not alter `ResearchDatasetMaterialProviderV1`, does not wire either Research/Validation writer and does not install a privileged or unsigned bypass.

## Next required slice

1. Authoritative, versioned **server-owned** market/field mapping source; independently prove complete coverage of the actual provider adapters, caches and immutable datasets.
2. DB-backed tenant-bound read admission with append-only access evidence, verification of committed fence completeness and serialized registration-vs-read operations.
3. Connect both concrete Investing Research and Validation material reads to the guard, including cache/snapshot/artifact/preview/optimizer paths that may bypass the provider. Prevent TOCTOU between checking, fetching, returning and consuming observations.
4. Rehearse genuine concurrent readers/registration on disposable PostgreSQL 17, cross-tenant denials and crash recovery. Only then restore controlled registration authority and later authorize actual holdout admission.

No Production DDL/DML, migration, Vault credentials, infrastructure or paid service. No merge. The registered public metadata and fence remain **NOT** an operational embargo. Investing/Trading Core must not depend on this Lab code.
