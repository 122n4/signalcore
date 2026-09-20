# I5 RL-1 Evidence Object Scientific Closure Owner Contract V1

Status: `IMPLEMENTED_CANDIDATE / NOT CURRENT_ACCEPTED / UNNUMBERED`

Classification: `CANDIDATE / RL-1_EVIDENCE_OBJECT_SCIENTIFIC_CLOSURE / UNNUMBERED`

Canonical predecessor:

`8400d7675788a60ee3399ee5908452b1e6f5e91e`

Parent completion program:

`I5_RESEARCH_LAB_COMPLETION_PROGRAM_V1.md`

Permanent A-number:

`NOT ASSIGNED`

Production Supabase mutation:

`NOT AUTHORIZED / NOT PERFORMED`

## Purpose

RL-1 closes the first accepted scientific Evidence Object for the Investing
Research Lab without modifying the historical V1 execution semantics.

A successful accepted V1 research execution now has the intended atomic chain:

```text
RunInput
-> verified materials
-> deterministic engine
-> immutable Result artifacts
-> scientific Result
-> scientific Evidence Object
-> SUCCEEDED terminal event
```

Evidence is downstream scientific proof. It is not Paper state, portfolio truth,
recommendation, suitability, execution authorization or Live authority.

## Scientific Identity

The existing declared domain remains:

`SYNTRAKE:EVIDENCE_OBJECT:V1 = CONTENT_PREIMAGE_EXACT`

The scientific hash preimage is exactly:

```text
"SYNTRAKE:EVIDENCE_OBJECT:V1\n"
+ canonical_json(EVIDENCE_CONTENT_DESCRIPTOR_V1)
+ "\n"
+ exact_content_bytes
```

The descriptor is:

```text
schemaVersion = EVIDENCE_CONTENT_DESCRIPTOR_V1
kind = RESEARCH_EXECUTION_EVIDENCE
artifactSchemaVersion = RESEARCH_EXECUTION_EVIDENCE_V1
format = CANONICAL_JSON_UTF8_V1
contentByteLength = exact byte length of content
```

Operational UUIDs, tenant IDs, principal IDs, membership IDs, correlation IDs,
timestamps and Run UUIDs are excluded from scientific Evidence identity.

## Evidence Content V1

Exact content schema:

`RESEARCH_EXECUTION_EVIDENCE_CONTENT_V1`

The content binds:

- exact `SYNTRAKE:RESULT:V1` HashRef;
- exact `SYNTRAKE:RUN_INPUT:V1` HashRef;
- exact ResearchSpec HashRef;
- exact Research IR HashRef;
- exact Experiment HashRef;
- exact DatasetSnapshot HashRef;
- exact ordered DatasetSeries HashRefs after canonical sorting;
- exact Metric Registry version;
- exact MetricRequestSet HashRef;
- exact ExecutionConfig HashRef;
- exact engine ID/version;
- exact Result artifact descriptors for execution trace, valuation series,
  metric result set and optional benchmark.

The Evidence content does not re-run strategy logic and does not invent data.
It binds already accepted scientific identities and exact immutable artifact
descriptors.

## Atomicity Law

Evidence creation is part of the same application transaction that finalizes a
successful Result.

The transaction order is:

```text
persist/reuse Result artifacts
-> persist/reuse scientific Result
-> build Evidence from verified Result + RunInput lineage
-> persist/reuse Evidence
-> append SUCCEEDED terminal event
-> COMMIT
```

Any Evidence conflict before commit causes rollback of the entire success
finalization. A Run must not receive `SUCCEEDED` if its Evidence finalization
fails.

Typed operational failure handling remains the existing Research Execution
failure path.

## Exact Reuse / Conflict

Repeated execution of scientifically identical accepted inputs may create
different operational Run UUIDs.

It must reuse:

- the same scientific Result identity;
- the same scientific Evidence hash;
- the same Evidence persistence identity within the tenant.

Same Evidence hash with different bound RunInput, Result, descriptor, raw
content digest/length or raw content is `CONFLICT`.

No last-write-wins behavior exists.

## Persistence

Additive table:

`investing.research_evidence_objects_scientific_identities`

Persistence stores:

- operational Evidence UUID;
- authority tuple;
- RunInput identity FK;
- Result identity FK;
- exact Evidence descriptor fields;
- raw canonical content bytes;
- raw content SHA-256 and byte length;
- scientific Evidence HashRef tuple;
- created timestamp outside scientific identity.

Database content integrity requires:

`octet_length(content) = content_byte_length`

and:

`SHA256(content) = content_sha256`

Evidence scientific rows are append-only. Runtime receives no UPDATE or DELETE
grant. A database append-only trigger independently rejects UPDATE/DELETE.

## Authority And RLS

RL-1 does not create a new browser or client authority surface.

Evidence is minted only inside the accepted server-side Research Execution
authority:

```text
operation = RESEARCH_EXECUTION_RUN_V1
capability = RESEARCH_EXECUTE
operation_scope = TENANT_SCOPE
source_context = PURE_RESEARCH
account_id = NULL
```

The table uses:

- RLS enabled;
- FORCE RLS;
- explicit `investing_app` SELECT/INSERT only;
- no `public`, `anon`, `authenticated` or `service_role` table grants;
- exact tenant/principal/membership transaction-context checks;
- authority-tuple foreign keys to active Genesis identities through existing
  authority resolution.

The application must continue to prove execution through the real
`investing_app` transaction transport in PostgreSQL 17 rehearsal.

## Storage Integrity Versus Scientific Identity

Scientific Evidence identity is the content-preimage hash.

Storage identity, operational Evidence UUID, database timestamp and authority
tuple are not scientific content identity.

Raw content SHA-256 is a storage-integrity digest. It is not a replacement for
the `SYNTRAKE:EVIDENCE_OBJECT:V1` scientific hash.

## Supersession

RL-1 supersedes only the previous I5 limitation that Evidence Object acceptance
was outside the Research Execution Closure.

It does not supersede or change:

- `ENGINE_V20260918` semantics;
- existing Result identity;
- RunInput identity;
- Dataset/Experiment/Research IR identity;
- Research Execution lifecycle semantics except for requiring Evidence before a
  new success finalization commits;
- I6 Quant & Decision Science;
- I7 Paper;
- I9 Product API;
- UI.

## Out Of Scope

Still outside RL-1:

- Evidence Ledger / Passport;
- OOS / walk-forward validation;
- Engine V2;
- Metric Registry V2;
- robustness/overfit comparison;
- scientific promotion state machine;
- Blind Truth / Evidence Vault;
- headless Lab orchestration closure;
- product API;
- UI;
- Paper, broker, Capital Kernel and Live;
- production migration application.

## Acceptance Requirements

RL-1 remains a candidate until independent evidence proves:

- canonical Evidence preimage/hash implementation;
- deterministic content bytes;
- operational IDs excluded from scientific content;
- exact Result/RunInput/dataset/metric/artifact bindings;
- same scientific execution => same Evidence identity;
- conflicting Evidence => rollback / fail closed;
- raw content digest/length DB checks;
- append-only behavior;
- FORCE RLS;
- real `investing_app` application role;
- cross-tenant and wrong-principal isolation;
- PostgreSQL 17 migration/replay;
- existing Research Execution and Dataset/Run rehearsals remain green;
- full tests, lint, TypeScript, build, dependency audit and Vercel pass;
- no production Supabase mutation.
