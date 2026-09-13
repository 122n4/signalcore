# Syntrake Investing I5 - Experiment Baseline Admission Owner Contract V1

Status: `CANDIDATE OWNER CONTRACT - RUNTIME ONLY`

Canonical predecessor:

`216bec5e09bfa81a771048f1d693210942f02368`

## Purpose

This slice admits the first executable Experiment boundary after the accepted I5-A5 Research IR without inventing execution, data, parameter or scientific-hash authority that does not yet exist.

The admitted V1 surface is deliberately narrow:

```text
active/persisted ResearchSpecRevision identity
+
exact A5 Research IR proof
->
BASELINE Experiment admission
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
  researchIr: {
    ref: HashRefV1;       // exact domain SYNTRAKE:RESEARCH_IR:V1
    payload: ResearchIrV1;
  };
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

The Research IR payload is used to recompute and prove the supplied A5 hash. It is not copied into the admitted structural result.

## Invariants

1. Only `relation = BASELINE` is admitted.
2. `researchSpecRevisionId` is canonical lowercase UUID text and is record/lineage identity, not a fake `SYNTRAKE:RESEARCH_SPEC:V1` scientific hash.
3. `researchIr.ref.hashDomain` must equal `SYNTRAKE:RESEARCH_IR:V1`.
4. The Research IR payload is revalidated through the accepted A5 runtime and its hash must exactly match the supplied ref.
5. A wrong-domain or mismatched Research IR proof fails closed.
6. Undeclared fields fail closed.
7. Parent Experiment lineage is not admitted by this runtime subset.
8. Parameter sets, parameter overrides, variants, sensitivity and validation relations are not admitted by this runtime subset.
9. No material default is inferred.
10. No Experiment scientific hash is emitted.
11. No ResearchSpec scientific hash is enabled.
12. No persistence success, active-pointer move or authority is claimed by a pure runtime admission.

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

## Persistence and authority boundary

This slice does **not** add or reuse a database writer.

The current material-revision authority resolver owns Draft/Hypothesis/ResearchSpec revision operations. Experiment creation must not be smuggled through that resolver merely because it already has `RESEARCH_MUTATE`.

A future Experiment persistence slice must define a dedicated operation and prove, transactionally:

- server-side Research authority resolution;
- owning Investigation and scope match;
- the referenced ResearchSpecRevision belongs to that Investigation;
- the referenced ResearchSpecRevision is the expected active Spec under aggregate pointer CAS;
- the expected active Experiment predecessor matches;
- the exact A5 Research IR proof is durably bound without claiming an unowned compiler derivation;
- idempotency and concurrent same-key convergence;
- stale writer loses cleanly;
- active Experiment pointer changes atomically;
- RLS/grants are minimal and fail closed;
- no Paper, broker, Plan, ledger, accounting or financial state is mutated.

Until that slice exists, `admitExperimentBaselineV1` proves only deterministic runtime shape and A5 IR proof validity.

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

For the exact admitted BASELINE runtime subset, this contract supersedes loose historical/blueprint Experiment examples that allow arbitrary metadata or untyped parameter overrides to be treated as current executable authority.

It does not supersede the A3 structural Experiment lineage law, A4 ResearchSpec persistence, A5 Research IR, or any future owner contract.

## Acceptance requirements

A candidate can be accepted only if:

- exact predecessor is `216bec5e09bfa81a771048f1d693210942f02368`;
- diff is limited to this runtime/contract/tests/public exports;
- targeted tests pass;
- full tests, lint, TypeScript and build pass;
- dependency audits remain clean;
- no migration, Supabase state, Vercel production, `main`, canonical alias, Paper, broker or financial state is changed;
- independent audit confirms Experiment/ResearchSpec hash domains remain disabled;
- independent audit confirms no authority or persistence widening occurred.
