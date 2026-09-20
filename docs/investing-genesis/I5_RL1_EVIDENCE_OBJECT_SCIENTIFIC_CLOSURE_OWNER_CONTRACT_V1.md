# I5 RL-1 Evidence Object Scientific Closure Owner Contract V1

Status: IMPLEMENTED_CANDIDATE / NOT CURRENT_ACCEPTED / UNNUMBERED

## Purpose

RL-1 closes the first durable scientific Evidence Object for the accepted Research Execution chain:

```text
RunInput
-> verified scientific materials
-> deterministic historical execution
-> immutable result artifacts
-> scientific Result
-> scientific Evidence Object
-> SUCCEEDED Run event
```

Evidence is scientific proof only. It is not portfolio truth, Paper state, broker state, recommendation, suitability, capital authorization, Live authority, or product API authority.

## Scientific Identity

Evidence uses the already-declared domain:

```text
SYNTRAKE:EVIDENCE_OBJECT:V1
```

The domain state remains:

```text
CONTENT_PREIMAGE_EXACT
```

The exact preimage is:

```text
"SYNTRAKE:EVIDENCE_OBJECT:V1\n"
+ canonical_json(EVIDENCE_CONTENT_DESCRIPTOR_V1)
+ "\n"
+ exact_content_bytes
```

The descriptor is `EVIDENCE_CONTENT_DESCRIPTOR_V1` with:

```text
kind = RESEARCH_EXECUTION_EVIDENCE
artifactSchemaVersion = RESEARCH_EXECUTION_EVIDENCE_V1
format = CANONICAL_JSON_UTF8_V1
contentByteLength = exact byte length
```

The production Research barrel exposes only typed Research Execution Evidence construction. It does not promote arbitrary generic Evidence hashing as a public Research API.

## Content Contract

`RESEARCH_EXECUTION_EVIDENCE_V1` binds:

- Result HashRef.
- RunInput HashRef.
- ResearchSpec HashRef.
- Research IR HashRef.
- Experiment HashRef.
- DatasetSnapshot HashRef.
- Every DatasetSeries HashRef belonging to that DatasetSnapshot.
- Metric Registry version.
- MetricRequestSet HashRef.
- ExecutionConfig HashRef.
- Engine ID and immutable engine version.
- Result artifact descriptors for execution trace, valuation series, metric result set, and benchmark when present.

Operational provenance is excluded from scientific content, including tenant UUIDs, principal UUIDs, membership UUIDs, Run UUIDs, Evidence persistence UUIDs, timestamps, request IDs, and correlation IDs.

## Binding Rules

Evidence construction fails closed unless:

- The supplied RunInput hashes to the expected RunInput HashRef.
- The supplied Result hashes to the expected Result HashRef.
- The Result binds the same RunInput.
- RunInput and Result engine ID/version match.
- The DatasetSnapshot hashes to the RunInput DatasetSnapshot HashRef.
- The DatasetSeries set exactly matches the DatasetSnapshot membership.

## Persistence

The additive migration creates:

```text
investing.research_evidence_objects_scientific_identities
```

The table stores operational identity, tenant authority tuple, RunInput identity, Result identity, descriptor fields, exact canonical content bytes, raw content SHA-256, raw content byte length, scientific Evidence hash tuple, and `created_at` outside scientific identity.

The database independently enforces Result to RunInput binding through a composite FK. It also enforces:

```text
octet_length(content) = content_byte_length
upper(encode(extensions.digest(content, 'sha256'), 'hex')) = content_sha256
```

Scientific Evidence hash and raw storage SHA-256 remain distinct.

## Runtime Finalization

Successful execution finalization order is:

```text
persist/reuse result artifacts
-> persist/reuse scientific Result
-> construct exact Evidence
-> persist/reuse Evidence
-> append SUCCEEDED event
-> COMMIT
```

Evidence conflict or persistence failure aborts the success transaction. A successful Research Execution must not commit `SUCCEEDED` without Evidence.

## Authority

Evidence is created only under:

```text
operation = RESEARCH_EXECUTION_RUN_V1
capability = RESEARCH_EXECUTE
operation_scope = TENANT_SCOPE
source_context = PURE_RESEARCH
account_id = NULL
```

The table uses RLS and FORCE RLS. Runtime receives only `SELECT` and `INSERT`. Public, anon, authenticated, and service_role receive no Evidence table authority. UPDATE and DELETE are rejected by an append-only trigger independently of grants.

## Scope

RL-1 does not modify `ENGINE_V20260918` behavior and does not implement Evidence Ledger, Passport, OOS, walk-forward, Engine V2, Metric Registry V2, robustness/overfit, scientific promotion, Blind Truth, orchestration closure, product API, UI, Paper, broker, Capital Kernel, Live, user portfolio execution, Monte Carlo, scenario/stress, allocation, suitability, or Trading research changes.
