# Investing Phase 6C — Reproducibility and Schema Plan

## Boundary

Phase 6C closes deterministic identity and a testable future persistence
blueprint. It creates no PostgreSQL objects, migrations, repositories,
providers, workers, backtests, statistical validation, promotion path, UI, or
operational process.

The Phase 6B contracts remain frozen. Phase 6C consumes
`ExperimentIdentityMaterial`, `DatasetVersionRef`, and `ResearchArtifactRef`
and uses `canonicalizeResearchContract` as its only canonicalization boundary.

## Identity layers

Three identities remain distinct:

1. Scientific experiment identity describes what is being scientifically
   tested.
2. Reproducible execution identity describes a concrete reproducible software
   and runtime environment for that experiment.
3. A `ScientificRun` remains an operational attempt. Its run ID, attempt,
   lease, worker, and timestamps do not change either scientific identity.

Operational metadata such as hostname, username, PID, paths, worker, lease,
creation time, authenticated actor, and membership is excluded from identity.

## Versions and SHA-256

The implementation freezes literal versions for:

- SHA-256;
- canonicalization;
- scientific identity;
- reproducible execution identity;
- manifest;
- artifact identity;
- schema blueprint.

Digests are complete 64-character lowercase hexadecimal SHA-256 values. IDs
use:

```text
irexp_v1_<digest>
irexec_v1_<digest>
irman_v1_<digest>
irart_v1_<digest>
```

No payload can select the algorithm, domain, prefix, or version.

## Domain separation and canonicalization

Every digest hashes the UTF-8 bytes of:

```text
<versioned-domain>
<canonical-material>
```

Scientific, execution, manifest, and artifact domains are distinct. The same
canonical material therefore produces different digests in different
domains.

Canonical material comes exclusively from the accepted Phase 6B
`canonicalizeResearchContract`. Phase 6C does not copy or weaken that
implementation.

## Scientific experiment identity

The scientific identity binds:

- tenant, owner, portfolio, and account;
- hypothesis and candidate IDs/versions;
- strategy contract and canonical parameters;
- dataset version, manifest hash, and aggregate content hash;
- engine contract and validation profile;
- portfolio configuration, cost model, and benchmark;
- splits, explicit seed or null, and configuration version.

Authenticated user and membership are authorization/audit inputs, not
scientific inputs. Creation time, run, attempt, worker, lease, host, path, and
PID are also excluded.

The result includes canonical material, digest, `irexp_v1_…` ID, algorithm,
domain, canonicalization version, and identity contract version.

## Reproducible execution identity

`ReproducibleExecutionIdentityMaterial` wraps the scientific identity with:

- stable repository identity and Git commit;
- explicit clean/dirty/unavailable source state;
- optional source content hash;
- dependency lock hash;
- engine build hash;
- runtime name/version;
- platform and architecture;
- RNG algorithm/version;
- numeric policy/version;
- calendar/time policy/version;
- required Phase 6B contract versions.

Dirty and unavailable source revisions can be represented diagnostically but
cannot produce an official reproducible execution identity. Git is not read by
this phase; a server boundary must supply the already-resolved contract.

Changes to code, dependencies, build, runtime, platform, architecture, RNG,
numeric policy, or calendar policy change `irexec_v1_…`.

## Reproducibility manifest

`ReproducibilityManifestCore` contains only deterministic reproduction
material:

- scientific and execution identities;
- immutable dataset version;
- hypothesis and candidate references;
- source and execution environment;
- strategy, engine, validation, and configuration versions;
- seed and artifact expectations;
- concrete, content-identified artifact references bound to the same
  scientific experiment and reproducible execution.

Artifact references are sorted by artifact identity before the core is
hashed. Reordering the same set therefore does not change the manifest.
Duplicates, cross-experiment/cross-execution references, and missing required
expectations fail closed.

The canonical artifact projection is a closed contract containing exactly its
contract version, experiment ID, execution ID, content hash, kind, media type,
schema version, and logical role. It is reconstructed and canonicalized again
before its digest is accepted. Every concrete artifact must match exactly one
declared expectation, and every expectation may match at most one concrete
artifact. Required expectations match exactly one; optional expectations
match zero or one. Any other cardinality fails closed.

The canonical material embedded in both identities is parsed, validated with
the complete official validators, and re-derived before the manifest is
accepted. A digest over incomplete JSON is not sufficient.

The core alone produces `irman_v1_…`. The envelope adds `createdAt`,
`createdByProcess`, and warnings. Changing this operational metadata does not
change the core digest or manifest ID.

Envelope metadata is treated as untrusted input. Its descriptors and exact
schema are checked before any property is read or cloned; Symbols,
non-enumerable properties, accessors, and unexpected keys are rejected.

This is not storage, signing, object lock, or proof that referenced bytes
exist.

## Artifact identity

Artifact identity binds the supplied content hash to:

- kind;
- media and schema version;
- logical role;
- scientific experiment identity;
- reproducible execution identity.

The function does not read files or calculate their content hash. Different
content, role, kind, schema, or execution context produces a different
`irart_v1_…`.

Derivation receives the complete scientific identity, execution identity, and
validated execution material. It re-derives both identities and proves that
the execution belongs to the declared experiment. Formatted IDs without that
structural evidence are insufficient. Size, logical storage ID, provenance,
retention, location, and timestamps remain outside the artifact digest.

## Runtime validation

External/persistible inputs use closed schemas and structured results:

```text
{ ok: true, value }
{ ok: false, issues }
```

Validators reject unknown keys, accessors, Symbol properties, empty
identifiers, invalid hashes, unsupported platforms/architectures, unknown
versions, inconsistent identity references, dirty source state for official
execution, and invalid timestamps. Normal invalid input does not throw.

Phase 6B reason codes are reused. No free-form message is an error identity.

## Declarative schema blueprint

The blueprint freezes names, ownership, relationships, lifecycle, essential
columns, RLS posture, idempotency, retention, and rollback posture for 16
future tables:

### Data

- `investing_research_dataset_requests`
- `investing_research_datasets`
- `investing_research_dataset_versions`
- `investing_research_dataset_lineage`
- `investing_research_acquisition_jobs`

### Scientific research

- `investing_research_hypotheses`
- `investing_research_candidates`
- `investing_research_experiments`
- `investing_research_experiment_runs`
- `investing_research_artifacts`
- `investing_research_validation_reports`
- `investing_research_scientific_decisions`
- `investing_research_promotion_eligibility`

### Operations and memory

- `investing_research_jobs`
- `investing_research_idempotency_records`
- `investing_research_audit_events`

No table exists yet. The blueprint contains no SQL or database client.

## Scope, RLS, and grants

Every planned table is scope-bound with explicit relational columns:

```text
tenant_id
owner_id
portfolio_id
account_id
```

Every relationship between scope-bound tables uses a composite foreign key
containing these four columns plus the referenced entity key. Parent tables
declare the corresponding composite unique key. A local ID alone is never a
valid scoped relationship. A genuinely global future relation must be marked
as global and carry a non-empty justification.

That justification is never sufficient by itself: a global relationship is
valid only when both child and parent tables are explicitly modeled as
global. Any relationship involving a scope-bound table must preserve the
complete relational scope. None of the 16 planned production tables is
global.

Authorization cannot depend on JSON payloads. Planned authenticated reads
require resolved active membership and exact tenant/owner/portfolio/account
scope. Authenticated users receive no arbitrary scientific writes.

Future privileged roles receive minimum grants and remain behind a repository
or application boundary that enforces resolved scope. `service_role` is not an
authorization boundary. No process may select the first N owners.

## Server-only hashing boundary

`hashing.server.ts` and every identity, manifest, or artifact module that
reaches it starts with the official `server-only` guard. The neutral
`reproducibility/index.ts` exports only contracts, constants, and neutral
validators; it does not re-export server modules or pull `node:crypto`
transitively.

## JSONB and explicit columns

Canonical versioned payloads may be stored in JSONB with their hashes. JSONB
cannot be the only representation of:

- scope or authorization;
- primary and foreign keys;
- uniqueness and idempotency;
- states and versions;
- timestamps;
- lease/fencing fields;
- operational queries or recovery.

## Immutability

The blueprint marks experiment definitions immutable and scientific evidence
append-only after finalization. Dataset versions, artifact identities,
validation reports, decisions, and eligibility evidence create new versions
or events rather than overwrite history.

Future enforcement requires grants, constraints/triggers, repository
semantics, content hashes, and append-only guards. It is not implemented here.

## Idempotency

The future experiment repository must uniquely bind scientific digest, ID, and
canonical material:

- the same digest reuses the same experiment;
- the same ID with different canonical material is an integrity failure;
- `(experiment_id, attempt)` is unique;
- retries create new attempts, not experiments;
- identical repeated finalization is idempotent;
- divergent repeated finalization fails closed.

Scoped idempotency records bind operation, key, request hash, and result hash.

## Leases and fencing

Future run and job tables explicitly plan:

- lease token and owner;
- leased, heartbeat, and expiry timestamps;
- fencing token;
- attempt;
- state version.

Claim is atomic. Only the current unexpired lease and fencing token may mutate
a run. A stale worker cannot heartbeat or finalize after a newer claim.
Recovery proves expiry and increments fencing/state versions. It never changes
scientific identity and does not use a global filesystem lock.

## Transaction boundaries

The blueprint declares atomic boundaries for:

1. create or reuse experiment by scientific digest;
2. allocate a unique attempt;
3. claim a job/lease;
4. heartbeat a live fenced lease;
5. finalize result and artifact references;
6. persist an immutable validation report;
7. persist a terminal scientific decision;
8. emit eligibility evidence without promotion;
9. recover a proved-expired lease.

## Recovery

Queued, leased, and running work is recoverable under explicit policy.
Completed, failed, blocked, and cancelled work is terminal.

Recovery records stable failure classification, uses a bounded versioned retry
policy, quarantines orphan artifacts, and handles partial finalization through
transactions/idempotency. It cannot alter scientific material, reopen a
decision, promote a candidate, write orders/positions/accounting, or reuse
Trading queues/locks.

## Migration and rollback plan

Future implementation order:

1. create tables without integration writers;
2. add constraints and foreign keys;
3. enable RLS and minimum grants;
4. implement server-only repositories;
5. add PostgreSQL/RLS tests;
6. introduce shadow writes or a feature flag if required;
7. activate workers;
8. activate read models;
9. activate the Promotion Gateway only in its own phase.

Before data exists, rollback may drop structures only after proving evidence
count is zero. After scientific evidence exists, rollback disables writers and
processes but preserves tables, artifacts, and evidence.

## Deferred responsibilities

- Phase 6D: master architecture and promotion boundary.
- Phase 7: real Dataset Catalog and acquisition.
- Phase 8: data quality and bias controls.
- Phase 9: repositories, orchestration, queue, lease, fencing, and workers.
- Phases 10–14: hypothesis generation, backtesting, validation, risk, and
  scientific memory.
- Phase 15: Promotion Gateway.
- Phases 16–17: OPS/UI, hardening, and beta gate.
