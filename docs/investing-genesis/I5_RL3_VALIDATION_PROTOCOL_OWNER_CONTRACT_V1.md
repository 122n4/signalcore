# Syntrake Investing Genesis I5 RL-3A - Validation Protocol Owner Contract V1

State: `IMPLEMENTED_CANDIDATE / NOT_CURRENT_ACCEPTED / RL-3A_VALIDATION_PROTOCOL_FOUNDATION / UNNUMBERED`

This contract defines a deterministic Validation Protocol foundation for I5
Research Lab. It admits the exact owner payload for
`SYNTRAKE:VALIDATION_PROTOCOL:V1` and nothing else.

## Scope

RL-3A defines:

- a closed Validation Protocol owner payload;
- deterministic fold planning over exact XNYS session boundaries;
- no-lookahead dataset prefix material slicing for validation phases;
- phase Research IR derivation that may change only `testPeriod`;
- exact binding to existing Research IR, Experiment, DatasetSnapshot,
  MetricRequestSet and ExecutionConfig HashRefs.

RL-3A does not execute validation runs, persist validation results, create
child RunInput identities, choose winners, promote experiments, expose API/UI
surfaces, or alter Portfolio Core, accounting, brokerage, Paper, Live or
Capital Kernel behavior.

## Scientific Identity

`SYNTRAKE:VALIDATION_PROTOCOL:V1 = OWNER_PAYLOAD_EXACT`.

The hash preimage is:

```text
SYNTRAKE:VALIDATION_PROTOCOL:V1
+ SYNTRAKE_CANONICAL_JSON_V1 bytes of VALIDATION_PROTOCOL_HASH_PAYLOAD_V1
```

The payload is a closed object with:

- `schemaVersion = VALIDATION_PROTOCOL_HASH_PAYLOAD_V1`;
- `methodology = VALIDATION_METHODOLOGY_V1`;
- `boundaryPolicy = EXACT_XNYS_SESSION_BOUNDARIES_V1`;
- `missingDataSemantics = INHERIT_EXECUTION_CONFIG_EXACT_V1`;
- `sourceMaterialPolicy = PREFIX_TO_PHASE_END_NO_FUTURE_DATA_V1`;
- exact HashRefs for Experiment, Research IR, DatasetSnapshot, MetricRequestSet
  and ExecutionConfig;
- immutable `engineId`, `engineVersion` and `metricRegistryVersion`;
- one closed validation mode;
- an ordered fold sequence.

The raw canonical/hash functions define the owner payload bytes only. They do
not, by themselves, admit a scientific Validation Protocol identity. Scientific
admission is performed by `admitValidationProtocolV1`, which re-proves the
payload against exact owner proofs before returning the
`SYNTRAKE:VALIDATION_PROTOCOL:V1` HashRef.

## Admission Boundary

`admitValidationProtocolV1` requires an exact candidate containing the protocol
payload plus the subject Experiment candidate, subject Research IR payload,
source DatasetSnapshot payload, MetricRequestSet payload and ExecutionConfig
payload.

Admission recalculates and compares:

- Experiment hash against `protocol.subjectExperiment`;
- Experiment owner payload `researchIr` against `protocol.subjectResearchIr`;
- Research IR hash against `protocol.subjectResearchIr`;
- DatasetSnapshot hash against `protocol.sourceDatasetSnapshot`;
- MetricRequestSet hash against `protocol.metricRequestSet`;
- ExecutionConfig hash against `protocol.executionConfig`.

This fails closed on mixed lineage such as Experiment A with Research IR B. It
also fails closed when MetricRequestSet `metricRegistryVersion` diverges from
the protocol or ExecutionConfig `engineCompatibilityVersion` diverges from the
protocol engine version.

RL-3A Validation Protocol V1 is bound to the currently accepted V1 execution and
metric registry closure:

```text
engineId = HISTORICAL_EXECUTION_ADAPTER
engineVersion = ENGINE_V20260918
metricRegistryVersion = METRIC_REGISTRY_V20260918
```

Engine V2, Metric Registry V2 or any mutable compatibility alias require a
future explicit/versioned owner contract.

## Validation Modes

Allowed modes are:

- `CHRONOLOGICAL_HOLDOUT`;
- `IS_OOS_SPLIT`;
- `ROLLING_WALK_FORWARD`;
- `EXPANDING_WALK_FORWARD`.

Holdout and IS/OOS split require exactly one fold. Rolling and expanding
walk-forward require at least two folds. Fold ordinals are canonical integers
starting at `0` with no gaps or duplicates.

## Boundary Rules

All fold boundaries are exact civil dates that must be XNYS trading sessions.
Nearest-session substitution, weekend shifting and inferred dates are forbidden.
Every training window must end strictly before its evaluation window starts.
IS/OOS split requires the evaluation start to be the next XNYS session after
training end. Walk-forward folds require non-overlapping evaluation windows and
the next fold's training end to equal the previous fold's evaluation end.

Rolling walk-forward keeps both training-session count and evaluation-session
count constant across folds. Expanding walk-forward keeps the original training
start fixed and the evaluation-session count constant across folds.

## No-Lookahead Material Slicing

Validation phase material slices are derived from verified DatasetSeries
material bytes. A prefix slice includes only observations with
`observation.date <= phaseEndDate`, recomputes canonical material bytes and
content SHA-256, updates coverage end and observation count, and re-verifies
the resulting DatasetSeries material.

The requested `phaseEndDate` must be an exact XNYS session inside the declared
source coverage and must exist as the final observation of the prefix. A source
whose declared coverage ends before the requested phase end fails closed. A
source whose material skips the requested phase end also fails closed. No
nearest-date, previous-session, weekend or missing-data substitution is allowed.

Future observations remain part of the original source material authority but
are not visible inside the phase prefix material.

## Research IR Derivation

Phase Research IR derivation may update only `testPeriod` to the phase window.
Any drift in universe, pipeline, benchmark, valuation currency, starting
capital or any other Research IR field is invalid.

## Explicit Non-Authority

RL-3A creates no scientific hash domain for:

- Validation Result;
- Validation Child Result;
- Validation RunInput;
- promotion decisions;
- blind truth;
- Portfolio Core/accounting/financial ledger;
- Paper, broker, Live or Capital Kernel;
- API/UI validation orchestration.

No migration, RLS policy, SQL function, database role, grant or Production
state is part of this owner contract.
