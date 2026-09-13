# Syntrake Investing I5 - Experiment Baseline Admission Owner Contract V1

Status: `CANDIDATE OWNER CONTRACT - RUNTIME ONLY`

Canonical predecessor:

`216bec5e09bfa81a771048f1d693210942f02368`

## Purpose

This slice admits the first structural Experiment boundary after the accepted I5-A5 Research IR without inventing execution, data, parameter or scientific-hash authority that does not yet exist.

The admitted V1 surface is deliberately narrow:

```text
ResearchSpecRevision structural identity
+
admitted A5 Research IR HashRef
->
BASELINE Experiment structural admission
```

This contract does not assign a new permanent A-number. Numbering becomes current authority only after independent audit and gate acceptance.

## Controlling predecessors

This contract consumes, but does not redefine:

- the accepted I0-I4 Genesis contracts;
- `I5A_MATERIAL_REVISIONS_OWNER_CONTRACT_V1.md` for the structural Experiment boundary and active-pointer law;
- accepted I5-A4 ResearchSpec candidate persistence;
- `I5A_RESEARCH_IR_OWNER_CONTRACT_V1.md` for exact `SYNTRAKE:RESEARCH_IR:V1` bytes/hash semantics;
- `I5A_CANONICAL_HASH_DOMAINS_V1.md` for the rule that declared hash domains remain unusable until explicitly admitted.

The product blueprint remains reference only and is not numbering or implementation-sequence authority.

## Exact admitted runtime shape

```ts
type ExperimentBaselineCandidateV1 = {
  schemaVersion: "EXPERIMENT_BASELINE_CANDIDATE_V1";
  relation: "BASELINE";
  researchSpecRevisionId: string;
  researchIr: HashRefV1;
};
```

Admission returns only the normalized structural binding:

```ts
type AdmittedExperimentBaselineV1 = {
  schemaVersion: "EXPERIMENT_BASELINE_CANDIDATE_V1";
  relation: "BASELINE";
  researchSpecRevisionId: CanonicalUuidV1;
  researchIr: HashRefV1;
};
```

The Experiment owner does not accept or re-hash a raw Research IR payload. The accepted A5 owner remains the sole authority that validates Research IR content and produces its scientific hash. This slice validates only the canonical `HashRefV1` envelope and exact Research IR domain before binding that reference structurally.

## Invariants

1. Only `relation = BASELINE` is admitted.
2. `researchSpecRevisionId` is canonical lowercase UUID text and is record/lineage identity, not a fake `SYNTRAKE:RESEARCH_SPEC:V1` scientific hash.
3. `researchIr.hashDomain` must equal `SYNTRAKE:RESEARCH_IR:V1`.
4. The Research IR reference must satisfy the canonical `HashRefV1` algorithm/domain/version/hash-text contract.
5. This slice does not claim to prove that arbitrary payload bytes correspond to the supplied Research IR reference; that proof belongs to the accepted A5 owner that produces the reference.
6. Raw Research IR payloads are not accepted by the Experiment boundary.
7. Undeclared fields fail closed.
8. Parent Experiment lineage is not admitted by this runtime subset.
9. Parameter sets, parameter overrides, variants, sensitivity and validation relations are not admitted by this runtime subset.
10. No material default is inferred.
11. No Experiment scientific hash is emitted.
12. No ResearchSpec scientific hash is enabled.
13. No persistence success, active-pointer move or authority is claimed by a pure runtime admission.

## Hash boundary

The following states remain unchanged:

```text
SYNTRAKE:RESEARCH_SPEC:V1          = DECLARED_BUT_HASHING_DISABLED
SYNTRAKE:EXPERIMENT:V1             = DECLARED_BUT_HASHING_DISABLED
SYNTRAKE:EXPERIMENT_PARAMETERS:V1  = DECLARED_BUT_HASHING_DISABLED
```

This slice must not export `hashExperimentV1`.

The accepted A5 domain remains:

```text
SYNTRAKE:RESEARCH_IR:V1 = OWNER_PAYLOAD_EXACT
```

Experiment scientific identity will require a separate owner contract after all material Experiment fields are frozen. This runtime admission must not be cited as scientific Experiment hashing authority.

## Ownership boundary

Production Experiment code must not deep-import the A5 Research IR owner module. The public/canonical reference is the boundary between owners:

```text
A5 owner: ResearchIrV1 -> validate/canonicalize/hash -> HashRefV1
Experiment owner: admitted Research IR HashRefV1 -> structural binding
```

This prevents a later Experiment implementation from silently inheriting or redefining A5 canonicalization semantics.

## Persistence and authority boundary

This slice does **not** add or reuse a database writer.

The current material-revision authority resolver owns Draft/Hypothesis/ResearchSpec revision operations. Experiment creation must not be smuggled through that resolver merely because it already has `RESEARCH_MUTATE`.

A future Experiment persistence slice must define a dedicated operation and prove, transactionally:

- server-side Research authority resolution;
- owning Investigation and scope match;
- the referenced ResearchSpecRevision belongs to that Investigation;
- the referenced ResearchSpecRevision is the expected active Spec under aggregate pointer CAS;
- the expected active Experiment predecessor matches;
- the exact A5 Research IR reference is durably bound without claiming an unowned compiler derivation;
- idempotency and concurrent same-key convergence;
- stale writer loses cleanly;
- active Experiment pointer changes atomically;
- RLS/grants are minimal and fail closed;
- no Paper, broker, Plan, ledger, accounting or financial state is mutated.

Until that slice exists, `admitExperimentBaselineV1` proves only deterministic structural input validation and exact reference-domain binding.

## Explicit non-scope

Not admitted here:

- `SYNTRAKE:RESEARCH_SPEC:V1` finalization/hash;
- `SYNTRAKE:EXPERIMENT:V1` hash;
- `SYNTRAKE:EXPERIMENT_PARAMETERS:V1` hash;
- Experiment DB schema or persistence;
- parent/variant/sensitivity/validation Experiment creation;
- arbitrary `Record<string, unknown>` overrides;
- ResearchSpec-to-IR compiler truth;
- DatasetSnapshot or data acquisition;
- MetricRequestSet;
- ExecutionConfig;
- engine/adapter/backtest execution;
- Run, Result or Evidence admission;
- workers/queues;
- Paper/broker/Live;
- Trading;
- financial recommendation or account mutation;
- production migration, DDL/DML or deploy.

## What this slice supersedes

For the exact admitted BASELINE runtime subset, this contract supersedes loose historical/blueprint Experiment examples that allow arbitrary metadata, raw IR payload ownership or untyped parameter overrides to be treated as current executable authority.

It does not supersede the A3 structural Experiment lineage law, A4 ResearchSpec persistence, A5 Research IR, or any future owner contract.

## Acceptance requirements

A candidate can be accepted only if:

- lineage descends from exact predecessor `216bec5e09bfa81a771048f1d693210942f02368`;
- diff is limited to this runtime/contract/tests/public exports;
- targeted tests pass;
- full tests, lint, TypeScript and build pass;
- dependency audits remain clean;
- production Experiment code does not deep-import the A5 Research IR owner module;
- no migration, Supabase state, Vercel production, `main`, canonical alias, Paper, broker or financial state is changed;
- independent audit confirms Experiment/ResearchSpec hash domains remain disabled;
- independent audit confirms no authority or persistence widening occurred.
