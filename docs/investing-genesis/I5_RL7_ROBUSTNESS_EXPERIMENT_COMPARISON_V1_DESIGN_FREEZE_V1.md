# I5 RL-7 Robustness And Experiment Comparison V1 Design Freeze

Status: CANDIDATE DESIGN FREEZE - RL-7 ROBUSTNESS AND EXPERIMENT COMPARISON V1 - UNNUMBERED

Classification:
`CANDIDATE / RL-7_ROBUSTNESS_EXPERIMENT_COMPARISON_V1_DESIGN_FREEZE / UNNUMBERED`

Canonical predecessor:
`f21371b9d0cbf79773c198d0dd34b512a7eab46b`

RL-7 acceptance:
`NOT ACCEPTED`

Runtime implementation:
`NOT IMPLEMENTED BY THIS SLICE`

Migration:
`NONE`

Production mutation:
`NONE`

Supabase Production:
`UNCHANGED`

Permanent A-number:
`NOT ASSIGNED`

## Purpose

RL-7 turns accepted BASELINE/VARIANT scientific lineage into deterministic
scientific comparison and robustness evidence.

It is not a visual diff. It is not an optimizer. It is not strategy ranking.
It is not investment advice. It is not promotion authority. It is not Paper or
Live authority.

RL-7 consumes accepted Investing Genesis authorities only:

- Experiment scientific identity:
  `SYNTRAKE:EXPERIMENT:V1`.
- ExperimentParameters scientific identity:
  `SYNTRAKE:EXPERIMENT_PARAMETERS:V1`.
- RunInput and Result identity:
  `SYNTRAKE:RUN_INPUT:V1` and `SYNTRAKE:RESULT:V1`.
- Evidence Object identity:
  `SYNTRAKE:EVIDENCE_OBJECT:V1`.
- Validation authority:
  `SYNTRAKE:VALIDATION_PROTOCOL:V1`,
  `SYNTRAKE:VALIDATION_RUN_INPUT:V1`,
  `SYNTRAKE:VALIDATION_CHILD_RESULT:V1` and
  `SYNTRAKE:VALIDATION_RESULT:V1`.
- Metric Registry V2:
  `METRIC_REGISTRY_V20260927` and `METRIC_RESULT_SET_V2`.

RL-7 Investing MUST NOT import from or depend on `lib/trading/**`.

Mandatory comparison evidence:

- exact parameter delta;
- exact scientific input delta;
- metric delta;
- OOS/walk-forward delta;
- drawdown delta;
- turnover/cost delta where applicable;
- concentration/dependence warnings where derivable from accepted evidence;
- deterministic parameter-neighborhood sensitivity where explicitly
  configured;
- instability/degradation classification.

Mandatory anti-overfit evidence:

- IS vs OOS degradation;
- fold/window stability;
- parameter-neighborhood sensitivity;
- dependence on a very small number of events/trades/rebalances where accepted
  evidence exposes those events;
- result concentration across subperiods.

No undocumented composite score may decide scientific truth.

## Comparison Scope And Lineage

An RL-7 comparison has exactly two primary Experiments:

- reference Experiment;
- subject Experiment.

The default admitted comparison is:

```text
reference = accepted BASELINE or accepted parent VARIANT
subject = accepted VARIANT descended from reference
```

Supported relationships:

- BASELINE vs direct VARIANT;
- VARIANT vs child VARIANT;
- BASELINE vs descendant VARIANT only when the complete parent chain is
  available and unambiguous.

Both Experiments must belong to the same scientific Experiment family. The
comparison must derive lineage server-side from accepted Investing ownership,
tenant, investigation and persisted Experiment lineage. A client-supplied
Experiment ID, Result ID or label never proves authority.

Both sides must have:

- same tenant authority;
- same accepted Investigation unless a future policy explicitly admits
  cross-Investigation family comparison;
- same Research IR family under accepted ExperimentParameters semantics;
- accepted Experiment HashRefs;
- accepted Result/Evidence identities for each Result being compared;
- compatible Validation Result identities when validation evidence is used.

Cross-tenant comparison is forbidden. Cross-account comparison is forbidden for
V1 because accepted Research Lab scope remains `TENANT_SCOPE / PURE_RESEARCH /
account_id = NULL`. Cross-Investigation comparison is `UNAVAILABLE` unless a
future policy version proves a shared scientific family. Ambiguous lineage or
multiple possible parents fails closed with `INCOMPARABLE_LINEAGE`.

RL-7 must not permit arbitrary unrelated strategy comparison merely because two
Result IDs exist.

## Exact Parameter Delta

Parameter delta is derived only from accepted
`SYNTRAKE:EXPERIMENT_PARAMETERS:V1` payloads and their verified BASE and
RESOLVED Research IR HashRefs.

The comparison must not infer parameter changes from names, labels, UI text,
markdown, comments or operational UUIDs.

Canonical parameter-delta ordering:

```text
1. pipeline operation index ascending
2. operation type token
3. path token lexicographic byte order
4. instrumentId lexicographic byte order where applicable
```

Supported delta kinds are exactly the current ExperimentParameters V1 admitted
families:

- `COMPARE_LITERAL_VALUE_DELTA`;
- `TAKE_COUNT_DELTA`;
- `FIXED_TARGET_WEIGHT_DELTA`;
- `REBALANCE_SCHEDULE_DELTA`.

All other Research IR differences are structural and make the pair
incomparable. A no-op delta is invalid because ExperimentParameters V1 already
forbids no-op parameterization.

## Exact Scientific Input Delta

RL-7 reports scientific input delta separately from performance and metric
delta. It must not hide changed materials, config or engine semantics behind a
single metric result.

The input-delta section compares at least:

- Experiment HashRef;
- ExperimentParameters HashRef;
- Research IR HashRef;
- DatasetSnapshot HashRef;
- relevant DatasetSeries identities when required to explain dataset changes;
- ExecutionConfig HashRef;
- MetricRequestSet HashRef;
- engine id;
- engine version;
- metric registry version;
- benchmark identity;
- test/evaluation period;
- Validation Protocol identity where used;
- Validation Result identity where used.

If any material input is incompatible with the comparison methodology, the
result must emit `INCOMPATIBLE_SCIENTIFIC_INPUTS` or a narrower closed reason.
It must not pretend the observed metric delta is attributable only to parameter
delta.

## Result And Metric Comparison

RL-7 consumes accepted RL-6 Metric Registry V2 for V2 Results. Historical V1
Result and Metric Registry truth remains immutable.

Metric matching rule:

```text
same metricId
same metricVersion
same registryVersion
same artifact schema relation required by the RunInput registry
```

Differing metric versions are `INCOMPATIBLE_METRIC_VERSIONS`. Missing metrics
are `MISSING_METRIC`. A Result with a crossed registry/artifact pair is
corrupted evidence and fails closed.

AVAILABLE vs UNAVAILABLE behavior:

- AVAILABLE vs AVAILABLE: compute exact delta.
- AVAILABLE vs UNAVAILABLE: emit `METRIC_UNAVAILABLE_ON_ONE_SIDE`.
- UNAVAILABLE vs AVAILABLE: emit `METRIC_UNAVAILABLE_ON_ONE_SIDE`.
- UNAVAILABLE vs same UNAVAILABLE reason: emit no numeric delta and preserve
  the shared reason.
- UNAVAILABLE vs different UNAVAILABLE reason: emit no numeric delta and
  preserve both reasons.

Metric deltas use exact rational arithmetic whenever exact underlying truth is
available. Rendered 18-decimal strings may be presentation outputs but must not
be promoted into hidden higher-order scientific authority where exact artifact
truth exists. No rounded intermediate may decide scientific comparison.

Zero denominator remains `ZERO_DENOMINATOR`, never zero.

## OOS And Walk-Forward Comparison

RL-7 consumes accepted RL-3 Validation authority.

Validation comparison is bound to:

- Validation Protocol;
- Validation Result;
- ordered folds;
- `TRAINING` and `EVALUATION` phases;
- OOS child Results;
- rolling walk-forward (`ROLLING_WALK_FORWARD`);
- expanding walk-forward (`EXPANDING_WALK_FORWARD`).

Definitions:

- IS metric: metric from a TRAINING child Result for a fold.
- OOS metric: metric from an EVALUATION child Result for the same fold.
- IS to OOS degradation delta: exact OOS metric minus exact IS metric under
  the metric direction declared by policy.
- fold/window stability evidence: deterministic dispersion/range of fold
  deltas over the ordered complete fold set.

Results from different Validation Protocols are not silently comparable. If
fold plans, phase windows, validation mode, source DatasetSnapshot,
MetricRequestSet, ExecutionConfig, engine or metric registry differ, the
comparison reports `INCOMPARABLE_VALIDATION_PROTOCOL` unless an explicit future
policy admits the exact difference.

Missing or incomplete fold evidence is `INCOMPLETE_VALIDATION`, not success.
Corrupt validation evidence fails closed.

## Drawdown Delta

Drawdown delta uses accepted Metric V2 semantics:

- `MAX_DRAWDOWN`;
- `MAX_DRAWDOWN_DURATION`;
- `MAX_DRAWDOWN_RECOVERY`.

Unavailable states such as `UNRECOVERED_DRAWDOWN` remain unavailable. RL-7
must not convert unrecovered drawdown, missing recovery or invalid NAV evidence
to fake zero.

## Turnover And Cost Delta

Turnover and cost comparison consumes accepted Engine V2 execution truth.

RL-7 compares:

- `TURNOVER`;
- `TRADE_COUNT`;
- `REBALANCE_COUNT`;
- explicit fee/cost components when exact accepted Result/artifact truth
  exposes them;
- slippage/spread components when exact accepted execution truth exposes them.

If an exact cost component is not available from accepted evidence, the value
is `UNAVAILABLE` with `MISSING_EXACT_COST_EVIDENCE`, not zero.

## Parameter-Neighborhood Sensitivity

Parameter-neighborhood sensitivity is deterministic only when explicitly
configured by policy and identity.

V1 design freezes:

- neighborhood membership is explicit;
- every member is an already accepted Experiment identity;
- no hidden generation;
- no automatic parameter search;
- no best-parameter selection;
- no adaptive widening based on results;
- no future-data-driven neighborhood selection;
- no randomness.

Ordering is by canonical Experiment HashRef bytes. Minimum evidence
requirements are declared by the versioned robustness policy. Failed or
unavailable members remain visible with closed missingness reasons and must not
be silently dropped.

Sensitivity measures are deterministic ranges/counts over accepted members:

- number of admitted members;
- number of unavailable or failed members by reason;
- min/max/spread of configured AVAILABLE metric deltas;
- direction consistency count for configured metrics;
- OOS degradation consistency count where validation evidence exists.

Insufficient configured neighborhood evidence is
`INSUFFICIENT_PARAMETER_NEIGHBORHOOD`.

## Concentration And Dependence Evidence

RL-7 emits concentration/dependence diagnostics only when derivable from
accepted exact evidence.

Supported V1 diagnostic families:

A. Event-count dependence:

- trade count;
- rebalance count;
- other accepted event families only if future accepted evidence exposes them.

B. Outcome concentration across deterministic subperiod/fold evidence:

- fold-level OOS metric distribution;
- deterministic subperiod metric evidence where already present in accepted
  artifacts;
- count of folds/subperiods responsible for sign or degradation direction.

C. Other diagnostics:

- allowed only when exact accepted source truth exists and a future policy
  names the diagnostic.

RL-7 does not invent correlation, contribution attribution, P&L-by-trade or
concentration percentages when accepted artifacts do not support them.
Unsupported evidence is `UNAVAILABLE` with
`UNSUPPORTED_CONCENTRATION_EVIDENCE`.

## Classification

RL-7 emits an explicit instability/degradation classification. It does not emit
an undocumented score, AI confidence, invented probability, opaque weighted
score or phrase such as "80% robust".

Closed taxonomy:

```text
ROBUSTNESS_STABLE
ROBUSTNESS_MIXED
ROBUSTNESS_DEGRADED
ROBUSTNESS_UNSTABLE
ROBUSTNESS_INSUFFICIENT_EVIDENCE
```

Classification is a deterministic function of exact bound inputs, missingness
states and the versioned robustness policy. Any numeric threshold used by the
classification must be explicit, versioned, deterministic, scientifically
identified, recorded in provenance and part of the comparison policy identity.

There is no mutable `default`, `latest`, `current`, `production` or similar
policy alias.

## Robustness Policy

The versioned policy/config object is:

```text
ROBUSTNESS_COMPARISON_POLICY_V20260927
```

It must define:

- required diagnostics;
- metric direction for degradation;
- numeric thresholds where thresholds are scientifically necessary;
- minimum folds/windows;
- minimum event counts;
- parameter-neighborhood requirements;
- missingness rules;
- classification rules;
- supported metric IDs and versions;
- whether validation evidence is required for a given comparison mode.

The policy is part of scientific identity. Methodology constants must not be
buried only in implementation source.

## Scientific Identity

RL-7 requires dedicated future scientific identity domains because RL-8 will
consume exact robustness/comparison evidence and must be able to reconstruct it
without mutable "current" state.

Future domain decisions:

```text
SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1
= DESIGN_FROZEN / NOT RUNTIME_ADMITTED

SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1
= DESIGN_FROZEN / NOT RUNTIME_ADMITTED
```

This slice does not activate those domains in `canonical.ts`.

`SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1` will own comparison methodology
and input identity:

- reference Experiment;
- subject Experiment;
- parameter delta source identities;
- scientific input identities;
- Validation Protocol/Result identities where used;
- Robustness policy;
- metric registry and requested comparison metrics.

`SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1` will own derived comparison result
and evidence identity:

- exact protocol HashRef;
- accepted source Result/Evidence HashRefs;
- deterministic comparison outputs;
- missingness/fail-closed states;
- robustness classification.

comparison methodology/input identity is separate from derived comparison result/evidence identity.

## Persistence Decision

RL-7 implementation requires append-only persistence because RL-8 and Passport
must consume exact historical comparison evidence without ambiguity.

No migration is written in this design slice.

Future persistence must freeze:

- append-only semantics;
- exact reuse for identical protocol/result payloads;
- conflict for divergent payload under the same logical protocol;
- tenant authority derived server-side;
- immutable scientific identity separate from operational UUIDs;
- no timestamps, tenant IDs, client IDs or idempotency keys inside scientific
  identity unless a later contract proves they are semantic input;
- RLS enabled;
- FORCE RLS enabled;
- no PUBLIC, anon, authenticated or service_role mutation authority;
- transaction/finalization behavior;
- idempotency;
- concurrency behavior equivalent to one accepted identity for one exact
  logical comparison.

## Passport And Evidence Ledger

Passport and Evidence Ledger later project accepted RL-7 evidence. They do not
become scientific authority and do not duplicate scientific truth.

Projection must preserve source HashRefs from:

- comparison protocol;
- comparison result;
- reference and subject Experiments;
- Results;
- Evidence Objects;
- Validation Result where used.

Absence of RL-7 evidence must remain explicit and must not become success.
Corrupt comparison evidence fails closed rather than being hidden from Passport.

## Arithmetic And Determinism

RL-7 preserves:

- exact rational arithmetic where exact truth exists;
- deterministic canonical ordering;
- no locale ordering;
- no JavaScript floating-point as scientific authority where exact arithmetic
  is required;
- no nondeterministic randomness;
- no wall clock;
- no mutable process-global scientific state;
- no hidden provider calls;
- no mutable "latest/current/default" behavior token.

Any future statistic requiring non-rational math must define deterministic
certified methodology before implementation. RL-7 V1 does not casually
introduce floating-point standard deviation, correlation or statistical
libraries.

## Missingness And Fail-Closed Taxonomy

Closed RL-7 unavailable/failure reasons include at least:

```text
INSUFFICIENT_EVIDENCE
INCOMPARABLE_LINEAGE
INCOMPATIBLE_SCIENTIFIC_INPUTS
INCOMPATIBLE_METRIC_VERSIONS
MISSING_RESULT
MISSING_VALIDATION_RESULT
INCOMPLETE_VALIDATION
METRIC_UNAVAILABLE
MISSING_EXACT_COST_EVIDENCE
UNSUPPORTED_CONCENTRATION_EVIDENCE
INSUFFICIENT_PARAMETER_NEIGHBORHOOD
CORRUPTED_EVIDENCE
AUTHORITY_FAILURE
INCOMPARABLE_VALIDATION_PROTOCOL
MISSING_METRIC
METRIC_UNAVAILABLE_ON_ONE_SIDE
```

`UNAVAILABLE` is distinct from mathematical zero. Integrity corruption is
fail-closed and must not be downgraded to `UNAVAILABLE`.

Integrity corruption is fail-closed.

## Relationship To RL-8

RL-7 does not decide promotion.

RL-7 may emit deterministic scientific evidence and classification. RL-8 owns
`Scientific Promotion State Machine V1`.

RL-7 must not emit:

- `PROMOTION_ELIGIBLE`;
- investment recommendation;
- Paper authorization;
- capital authorization;
- Live authorization;
- suitability conclusion.

## Explicit Out Of Scope

RL-7 excludes:

- RL-8 promotion state machine;
- RL-9 Blind Truth / Evidence Vault;
- RL-10 orchestration;
- RL-11 full closure;
- optimizer / automatic parameter fitting;
- Monte Carlo;
- scenario/stress;
- allocation;
- suitability;
- Investing decision methodology;
- Paper;
- broker;
- Live;
- Capital Kernel;
- product API;
- UI;
- Trading research runtime.

Boundaries preserved:

```text
CORE != LAB
LAB != PAPER
INVESTING != TRADING
```

## Design Candidate Evidence

This is a candidate design freeze only. It is not self-accepted.

Runtime changed:
`NO`

Migration changed:
`NO`

Production mutation:
`NONE`

PG17:
`NOT REQUIRED / DESIGN-ONLY`

PR:
`NOT CREATED BY THIS SLICE`
