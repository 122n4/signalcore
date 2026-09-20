# I5 RL-1 Evidence Object Scientific Closure Owner Contract V1

Status: `CURRENT ACCEPTED OWNER CONTRACT - RL-1 EVIDENCE OBJECT SCIENTIFIC CLOSURE - UNNUMBERED`

Classification: `CURRENT_ACCEPTED / RL-1_EVIDENCE_OBJECT_SCIENTIFIC_CLOSURE / UNNUMBERED`

Canonical predecessor:

`f723a1dfa75007799c296eeb4ead74f994557458`

Parent completion program:

`I5_RESEARCH_LAB_COMPLETION_PROGRAM_V1.md`

Permanent A-number:

`NOT ASSIGNED`

Production Supabase mutation:

`NONE / NOT PERFORMED`

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

## Accepted Provenance

Canonical predecessor:

`f723a1dfa75007799c296eeb4ead74f994557458`

Final independently audited technical candidate:

`c47baa4e0d95b5f94b2e18d60bb2f69b3b9d229d`

PR:

`#80`

CI:

`35509460004 - SUCCESS`

Full CI suite:

- test files: `213 passed / 17 skipped`;
- tests: `1165 passed / 36 skipped`;
- lint: `PASS`;
- TypeScript: `PASS`;
- production build: `PASS`;
- production dependency audit: `0 vulnerabilities`.

PostgreSQL 17 rehearsal:

`35509460002 - SUCCESS`

PostgreSQL:

`17.11`

Dedicated Research Execution + RL-1 PG17:

`2/2 PASS`

Accepted evidence:

- historical A2 Evidence content-preimage bytes/hash compatibility: `PASS`;
- generic Evidence hashing remains internal and is not exported through the public Research barrel: `PASS`;
- exact Result / RunInput / DatasetSnapshot / DatasetSeries / metric / artifact binding: `PASS`;
- Result-to-RunInput composite database binding: `PASS`;
- repeated scientifically identical execution reuses Evidence identity/hash: `PASS`;
- Evidence conflict participates in atomic success-finalization rollback: `PASS`;
- content SHA-256 and byte-length database integrity checks: `PASS`;
- append-only UPDATE/DELETE rejection: `PASS`;
- RLS + FORCE RLS: `PASS`;
- minimal `investing_app` SELECT/INSERT authority: `PASS`;
- Vercel: `SUCCESS`;
- independent auditor verdict: `PASS`.

Permanent A-number:

`NOT ASSIGNED`

Production Supabase mutation:

`NONE`

Production migration application:

`NOT PERFORMED`

`I5 RL-1 EVIDENCE OBJECT SCIENTIFIC CLOSURE = CURRENT_ACCEPTED / UNNUMBERED`
