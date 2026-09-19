# I5 Dataset & Run Scientific Closure Owner Contract V1

Status: CURRENT ACCEPTED OWNER CONTRACT - DATASET & RUN SCIENTIFIC CLOSURE - UNNUMBERED

## Purpose

This current accepted unnumbered slice closes the scientific input chain required
to create and durably persist a reproducible PURE_RESEARCH historical RunInput.

It does not assign a permanent A-number.

The accepted chain is:

```text
Experiment
-> DatasetSeries / DatasetSnapshot
-> MetricRequestSet
-> ExecutionConfig
-> ResearchSpec scientific identity
-> RunInput scientific identity
```

This is RunInput scientific closure. It is not Run execution lifecycle closure.

## Accepted Hash-Domain State

```text
SYNTRAKE:RESEARCH_SPEC:V1 = OWNER_PAYLOAD_EXACT
SYNTRAKE:DATASET_SERIES:V1 = OWNER_PAYLOAD_EXACT
SYNTRAKE:DATASET_SNAPSHOT:V1 = OWNER_PAYLOAD_EXACT
SYNTRAKE:METRIC_REQUEST_SET:V1 = OWNER_PAYLOAD_EXACT
SYNTRAKE:EXECUTION_CONFIG:V1 = OWNER_PAYLOAD_EXACT
SYNTRAKE:RUN_INPUT:V1 = PREIMAGE_ENVELOPE_EXACT
SYNTRAKE:ACCOUNT_RESEARCH_CONTEXT:V1 = DECLARED_BUT_HASHING_DISABLED
```

ResearchSpec workflow status may remain `CANDIDATE_ONLY`; workflow status is not
scientific identity.

## Scientific Identity

DatasetSeries binds immutable provider dataset/version, instrument/field,
frequency, interpretation metadata, exact coverage, observation count and
content SHA-256.

DatasetSnapshot binds the exact canonical set of DatasetSeries HashRefs.

MetricRequestSet binds an immutable metric registry version and exact versioned
metric requests.

ExecutionConfig binds the immutable behavioral policy/version surface required
for deterministic historical execution configuration. It is configuration
identity, not the execution engine.

ResearchSpec scientific identity binds the exact source Draft HashRef,
Hypothesis binding state and accepted objective semantics while excluding
operational revision IDs, tenant/account/principal, pointers, timestamps,
idempotency and correlation metadata.

RunInput preserves the existing `RUN_INPUT_HASH_PAYLOAD_V1` envelope and binds
ResearchSpec, Research IR, Experiment, DatasetSnapshot, MetricRequestSet,
ExecutionConfig, engine/registry versions, material policies and deterministic
seed when present.

The sanctioned public scientific authority path is
`admitScientificRunInputV1`. Raw low-level RunInput hashing is not the public
authority boundary.

## Cross-Object Admission

The accepted admission layer recomputes supplied scientific proofs and fails
closed on mix-and-match inputs.

It proves at least:

- DatasetSeries payloads recompute to the exact DatasetSnapshot series set;
- Experiment identity is valid;
- RunInput Research IR matches the Experiment Research IR;
- MetricRequestSet registry matches the RunInput registry version;
- ExecutionConfig engine compatibility matches the RunInput engine version;
- ResearchSpec scientific identity corresponds to the authoritative operational
  ResearchSpec revision used by the persisted Experiment.

## Persistence Authority

The accepted migration and writer/service establish append-only scientific
identity persistence for:

- DatasetSeries;
- DatasetSnapshot;
- MetricRequestSet;
- ExecutionConfig;
- ResearchSpec;
- RunInput.

Persisted canonical payload and scientific hash envelope originate from the same
canonical runtime representation.

RunInput persistence retains operational Investigation, Experiment and
ResearchSpec revision lineage without including those operational UUIDs in
scientific hash identity.

The six surfaces are written in one transaction. A late failure rolls back the
scientific persistence operation.

## Authority Scope

Accepted durable authority is intentionally limited to:

```text
operation_scope = TENANT_SCOPE
source_context = PURE_RESEARCH
account_id = NULL
```

The transaction binds operation, capability, tenant, principal and active tenant
membership.

Account and account-access transaction context must be absent.

`ACCOUNT_SCOPE`, `USER_PORTFOLIO` and durable `TEST_PORTFOLIO` RunInput
authority are not accepted by this slice.

## RLS And ACL

All six scientific identity tables have RLS and FORCE RLS enabled.

The accepted PostgreSQL 17 rehearsal proves INSERT and SELECT policy authority
bindings, tenant/principal/membership isolation and fail-closed non-tenant
contexts.

`investing_app` receives only `SELECT` and `INSERT` on these six tables.
No accepted UPDATE or DELETE path exists.

## Duplicate And Conflict Semantics

Exact component scientific identities may be reused only when the persisted
hash envelope, canonical payload, tenant authority and table-specific immutable
lineage/version fields match.

Hash/content or lineage mismatch fails closed as conflict.

An already-persisted RunInput scientific identity deterministically returns
conflict rather than being reported as a new successful creation.

## Rollback Guarantee

The PostgreSQL 17 rehearsal proves a valid distinct RunInput can exist inside a
transaction before a forced late failure and is absent after rollback.

This is mutation-then-rollback proof, not invalid-insert rejection.

## Accepted Golden Vectors

```text
DatasetSeries
87C9363E3E5EF9B055F9DF76FDB51C60EBA2A64D50B78FEB66339EFC06BCF382

DatasetSnapshot
61BF6FE8CA033A410CFB93E5B4AEAA84C2DE6BD1A29A35A592D5CF8479DFA15E

MetricRequestSet
547B5615C8893BB5B73B7912BD668A4CD013013923D184D5F9CCA6B27D1A2EC2

ExecutionConfig
B72AC58668D720FA6783328CCC14516E01A49DE021B919F9CD5390A60E561210

ResearchSpec
7F6BD62D54BC1AD6305F0B39974FC2D7D1DA5D93F03C8082D0E909DD68CC8A3D

RunInput
D551B5200CB6E15E6A5479FE69CB958E11500BE747B0C911AD59A3098A728749
```

## Accepted Provenance

```text
canonical predecessor:
acd6cf5140bf044281b04381456f8c4fc7e98e88

final independently audited technical candidate:
9cdc89a052dd76b8ed58eb52c434672c4f05ec65

PR:
#74

CI:
35453698054 - SUCCESS

PG17:
35453698064 - SUCCESS

PostgreSQL:
17.11

Existing Experiment Scientific Closure PG17:
3/3 PASS

Dedicated Dataset/Run Scientific Closure PG17:
5/5 PASS

Vercel:
SUCCESS

Independent auditor verdict:
PASS

Permanent A-number:
NOT ASSIGNED

Production Supabase migration application:
NOT PERFORMED
```

## Boundaries And Non-Goals

This acceptance does not establish:

- deterministic execution/backtest engine;
- Run execution lifecycle or execution status;
- Result;
- metric calculation implementation;
- Evidence Object promotion;
- Passport completion;
- Evidence Ledger product surface;
- OOS/walk-forward;
- Monte Carlo;
- optimizer;
- Strategy DNA;
- Strategy Autopsy;
- Paper;
- Trading;
- Capital Kernel;
- broker;
- Live;
- UI;
- AccountResearchContext / USER_PORTFOLIO authority.

Production Supabase migration application remains `NOT PERFORMED`.

## Supersession

This acceptance supersedes the current deferrals for ResearchSpec scientific
hashing, DatasetSeries/DatasetSnapshot scientific identity, MetricRequestSet,
ExecutionConfig and PURE_RESEARCH RunInput scientific persistence.

It does not supersede Experiment scientific identity, standalone raw
ExperimentParameters persistence deferral, AccountResearchContext deferral, Run
execution, Result/Evidence, Paper, Trading or Investing Core.
