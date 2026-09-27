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

RL-7 turns accepted BASELINE/VARIANT lineage and accepted Result/Validation evidence into deterministic experiment-comparison and robustness evidence. It is not a visual diff, optimizer, strategy ranking, investment advice, promotion authority, Paper authority or Live authority.

RL-7 consumes only accepted Investing Genesis authorities: `SYNTRAKE:EXPERIMENT:V1`, `SYNTRAKE:EXPERIMENT_PARAMETERS:V1`, `SYNTRAKE:RUN_INPUT:V1`, `SYNTRAKE:RESULT:V1`, `SYNTRAKE:EVIDENCE_OBJECT:V1`, the RL-3 Validation domains, `METRIC_REGISTRY_V20260927`, and `METRIC_RESULT_SET_V2`.

RL-7 Investing MUST NOT import from or depend on `lib/trading/**`.

Mandatory comparison evidence includes exact parameter delta, exact scientific input delta, metric delta, OOS/walk-forward delta, drawdown delta, turnover/cost delta, concentration/dependence warnings, parameter-neighborhood sensitivity and instability/degradation classification. Mandatory anti-overfit evidence includes IS vs OOS degradation, fold/window stability, parameter-neighborhood sensitivity, dependence on a very small number of events/trades/rebalances, and result concentration across subperiods/folds. No undocumented composite score may decide scientific truth.

## Comparison Scope And Lineage

An RL-7 comparison has exactly one reference Experiment and one subject Experiment. Admitted relationships are BASELINE vs direct VARIANT, VARIANT vs child VARIANT, and BASELINE vs descendant VARIANT only when the complete parent chain is available and unambiguous.

Both Experiments must have the same tenant authority and Investigation and must belong to the same Research IR family under accepted ExperimentParameters semantics. Authority and lineage are derived server-side from accepted persistence; a client-supplied ID or label proves nothing. Cross-tenant and cross-account comparison are forbidden. Cross-Investigation comparison is unavailable in V1. Ambiguous lineage fails closed with `INCOMPARABLE_LINEAGE`.

## Exact Parameter Delta Schema

Parameter delta is derived only from verified `SYNTRAKE:EXPERIMENT_PARAMETERS:V1` payloads and their BASE/RESOLVED Research IR HashRefs. Names, labels, UI text, markdown, comments and operational UUIDs are never parameter truth.

The closed delta union is:

```text
COMPARE_LITERAL_VALUE_DELTA = {
  kind: "COMPARE_LITERAL_VALUE_DELTA",
  pipelineOperationIndex: non-negative integer,
  operationType: accepted Research IR operation token,
  expressionPath: non-empty array of canonical path tokens,
  literalType: "DECIMAL" | "INTEGER" | "DATE",
  referenceValue: canonical literal value,
  subjectValue: canonical literal value
}

TAKE_COUNT_DELTA = {
  kind: "TAKE_COUNT_DELTA",
  pipelineOperationIndex: non-negative integer,
  operationType: "TAKE",
  path: ["count"],
  referenceValue: positive canonical integer,
  subjectValue: positive canonical integer
}

FIXED_TARGET_WEIGHT_DELTA = {
  kind: "FIXED_TARGET_WEIGHT_DELTA",
  pipelineOperationIndex: non-negative integer,
  operationType: "WEIGHT",
  path: ["targets", instrumentId, "weight"],
  instrumentId: canonical instrument identity,
  referenceValue: canonical decimal,
  subjectValue: canonical decimal
}

REBALANCE_SCHEDULE_DELTA = {
  kind: "REBALANCE_SCHEDULE_DELTA",
  pipelineOperationIndex: non-negative integer,
  operationType: "REBALANCE",
  path: ["schedule"],
  referenceValue: canonical accepted schedule token,
  subjectValue: canonical accepted schedule token
}
```

`expressionPath` uses structural tokens from the accepted Boolean-expression tree: object-field names plus zero-based clause indexes. For `AND`/`OR`, clause order is the accepted canonical Research IR order; RL-7 never commutes or rewrites clauses. `NOT` adds token `clause`. No wildcard, JSONPath, locale-dependent or UI path syntax is admitted.

Each delta requires `referenceValue != subjectValue`. Multiple deltas are allowed only when all are individually admitted by ExperimentParameters V1. Canonical ordering is pipeline operation index ascending, operation type byte order, path-token byte order, then instrumentId byte order. Structural differences outside this union are `INCOMPARABLE_PARAMETER_STRUCTURE`.

## Exact Scientific Input Delta

RL-7 reports scientific input delta separately from parameter/performance delta. The closed V1 material-input comparison set is Experiment HashRef, ExperimentParameters HashRef, resolved Research IR HashRef, DatasetSnapshot HashRef, ExecutionConfig HashRef, MetricRequestSet HashRef, engine id/version, metric registry version, benchmark identity, evaluation period, and Validation Protocol/Result HashRefs when validation mode is used.

A changed Experiment/ExperimentParameters/resolved Research IR identity is expected parameter lineage. For attributable parameter comparison, DatasetSnapshot, ExecutionConfig, MetricRequestSet, engine id/version, metric registry, benchmark identity and evaluation period must be identical. Otherwise the pair is `INCOMPATIBLE_SCIENTIFIC_INPUTS`; RL-7 may report the exact changed fields but must not attribute metric differences to the parameter delta.

## Metric Direction Registry

Metric direction is methodology, not inference. `ROBUSTNESS_COMPARISON_POLICY_V20260927` freezes:

```text
HIGHER_IS_BETTER:
TOTAL_RETURN
CAGR
SHARPE_RATIO
SORTINO_RATIO
CALMAR_RATIO
BENCHMARK_RELATIVE_RETURN

LOWER_IS_BETTER:
MAX_DRAWDOWN
MAX_DRAWDOWN_DURATION
MAX_DRAWDOWN_RECOVERY
TURNOVER

DESCRIPTIVE_ONLY:
TRADE_COUNT
REBALANCE_COUNT
AVERAGE_GROSS_EXPOSURE
```

A metric not listed above is unsupported by this policy version. Descriptive-only metrics may generate diagnostics but cannot independently establish degradation/stability classification.

For an AVAILABLE reference value `r` and subject value `s`:

```text
rawDelta = s - r
orientedDelta = rawDelta                 for HIGHER_IS_BETTER
orientedDelta = r - s                    for LOWER_IS_BETTER
```

Positive oriented delta means subject improvement; negative means degradation. Exact rational arithmetic is mandatory. No rounded intermediate decides comparison.

Metric matching requires same metricId, metricVersion, registryVersion and artifact-schema relation. Differing versions are `INCOMPATIBLE_METRIC_VERSIONS`; missing metrics are `MISSING_METRIC`. AVAILABLE/UNAVAILABLE pairs produce `METRIC_UNAVAILABLE_ON_ONE_SIDE`; two unavailable values preserve both reasons and have no numeric delta. Zero denominator remains `ZERO_DENOMINATOR`, never zero.

## Validation, IS/OOS And Fold Stability

RL-7 consumes accepted RL-3 Validation authority, including ordered folds, `TRAINING`, `EVALUATION`, `ROLLING_WALK_FORWARD` and `EXPANDING_WALK_FORWARD`.

Validation evidence is comparable only when protocol mode, fold plan, phase windows, DatasetSnapshot, MetricRequestSet, ExecutionConfig, engine and metric registry are identical. Otherwise: `INCOMPARABLE_VALIDATION_PROTOCOL`.

For each supported directional metric and complete fold `f`:

```text
isToOosDegradation(f) = oriented(OOS(f), IS(f))
```

where `oriented(subject, reference)` uses the Metric Direction Registry. Negative is degradation.

For `n` complete folds with exact degradation values `d1..dn`, V1 fold stability is deliberately rational-only:

```text
foldMin = min(di)
foldMax = max(di)
foldRange = foldMax - foldMin
nonDegradedFoldCount = count(di >= 0)
degradedFoldCount = count(di < 0)
```

No standard deviation, correlation, floating-point statistic or hidden dispersion estimator is admitted. Missing/incomplete fold evidence is `INCOMPLETE_VALIDATION`.

Minimum fold count for classification is exactly `3`. Two or fewer complete folds may be reported but force `ROBUSTNESS_INSUFFICIENT_EVIDENCE` whenever validation evidence is required.

## Drawdown, Turnover And Exact Cost Evidence

Drawdown comparison uses `MAX_DRAWDOWN`, `MAX_DRAWDOWN_DURATION`, and `MAX_DRAWDOWN_RECOVERY`; unavailable recovery remains unavailable.

Turnover/event comparison uses `TURNOVER`, `TRADE_COUNT`, and `REBALANCE_COUNT`.

When accepted Engine V2 artifacts expose exact execution/valuation truth, RL-7 additionally derives:

```text
explicitFeeTotal = final cumulativeExplicitFees
slippageCostTotal = final cumulativeSlippageCost
costTotal = explicitFeeTotal + slippageCostTotal
costDelta = subject costTotal - reference costTotal
```

The final valuation record means the last record in canonical valuation-series order. A non-monotonic cumulative cost series is `CORRUPTED_EVIDENCE`. Missing exact artifacts are `MISSING_EXACT_COST_EVIDENCE`, not zero.

## Parameter-Neighborhood Sensitivity

Neighborhood membership is explicit in the Comparison Protocol. Every member is an already accepted Experiment HashRef in the same family. No hidden generation, automatic parameter search, best-parameter selection, adaptive widening, future-data-driven membership or randomness is permitted.

Members are byte-sorted by Experiment HashRef. V1 requires at least `3` admitted members including the subject to make neighborhood sensitivity classification-capable. Fewer members produce `INSUFFICIENT_PARAMETER_NEIGHBORHOOD`.

For each configured directional metric, RL-7 records AVAILABLE member count, unavailable count by reason, exact min/max/spread, improved-or-equal count, degraded count, and—when validation exists—non-degraded/degraded OOS consistency counts. Failed/unavailable members remain visible and are never silently dropped.

## Concentration And Dependence Evidence

V1 supports only evidence derivable from accepted artifacts; unsupported diagnostics are `UNSUPPORTED_CONCENTRATION_EVIDENCE`.

Event-count dependence uses exact `TRADE_COUNT` and `REBALANCE_COUNT`. Classification-capable event evidence requires:

```text
minimumTradeCount = 20
minimumRebalanceCount = 5
```

These are evidence-sufficiency floors, not profitability targets. If a metric-relevant comparison has fewer than either applicable floor, the comparison records `LOW_EVENT_COUNT_DEPENDENCE` and cannot classify `ROBUSTNESS_STABLE`.

Outcome concentration uses complete OOS folds only. For each directional metric:

```text
positiveContributionFoldCount = count(subjectOosOrientedDelta(f) > 0)
negativeContributionFoldCount = count(subjectOosOrientedDelta(f) < 0)
zeroContributionFoldCount = count(subjectOosOrientedDelta(f) = 0)
```

No P&L-by-trade attribution or concentration percentage is invented. In V1, fold concentration is flagged `FOLD_DIRECTION_CONCENTRATION` when more than half of the positive folds are represented by exactly one positive fold; with integer counts this reduces deterministically to `positiveContributionFoldCount = 1` when at least three complete folds exist. This diagnostic is intentionally narrow; richer contribution concentration requires a future policy.

## Exact Robustness Policy

The only admitted V1 policy token is:

`ROBUSTNESS_COMPARISON_POLICY_V20260927`

Closed policy constants:

```text
validationRequired = true
minimumCompleteFolds = 3
minimumNeighborhoodMembers = 3
minimumTradeCount = 20
minimumRebalanceCount = 5
materialDegradationThreshold = 0
foldInstabilityRule = degradedFoldCount > nonDegradedFoldCount
neighborhoodInstabilityRule = degradedMemberCount > improvedOrEqualMemberCount
```

`materialDegradationThreshold = 0` means V1 does not invent economically arbitrary percentage thresholds. Any exact negative oriented delta is degradation; zero is neutral. Future non-zero materiality thresholds require a new policy identity.

Required classification diagnostics are: complete validation, directional OOS metric evidence, fold stability, exact event-count evidence, and parameter-neighborhood sensitivity. Cost and concentration diagnostics are mandatory outputs when source evidence exists but missing exact cost/concentration evidence does not by itself fabricate failure; it remains explicit missingness.

There is no mutable `default`, `latest`, `current`, `production` or similar policy alias.

## Classification Decision Table

Classification is a deterministic decision table, evaluated in this exact precedence order:

```text
1. integrity/authority/lineage/scientific-input failure
   -> fail closed; no robustness classification is authoritative

2. incomplete required evidence, <3 complete folds, <3 neighborhood members,
   missing required directional metric, or required metric unavailable
   -> ROBUSTNESS_INSUFFICIENT_EVIDENCE

3. foldInstabilityRule AND neighborhoodInstabilityRule
   -> ROBUSTNESS_UNSTABLE

4. aggregate subject OOS oriented delta < 0 AND
   degradedFoldCount > 0 AND degradedMemberCount > 0
   -> ROBUSTNESS_DEGRADED

5. aggregate subject OOS oriented delta >= 0 AND
   degradedFoldCount = 0 AND degradedMemberCount = 0 AND
   no LOW_EVENT_COUNT_DEPENDENCE AND no FOLD_DIRECTION_CONCENTRATION
   -> ROBUSTNESS_STABLE

6. otherwise
   -> ROBUSTNESS_MIXED
```

`aggregate subject OOS oriented delta` is the oriented delta between the subject aggregate EVALUATION Validation Result metric and the reference aggregate EVALUATION Validation Result metric for the configured primary directional metric. The Comparison Protocol contains exactly one `primaryMetricId`; it must be a supported directional metric and must exist in both aggregate Validation Results.

No score, confidence percentage, probability, weighting or AI judgment participates in this table. Terms such as undocumented score, AI confidence, invented probability, opaque weighted score or "80% robust" are prohibited.

## Closed Missingness And Failure Taxonomy

Unavailable/recoverable evidence states:

```text
INSUFFICIENT_EVIDENCE
MISSING_RESULT
MISSING_VALIDATION_RESULT
INCOMPLETE_VALIDATION
METRIC_UNAVAILABLE
MISSING_METRIC
METRIC_UNAVAILABLE_ON_ONE_SIDE
MISSING_EXACT_COST_EVIDENCE
UNSUPPORTED_CONCENTRATION_EVIDENCE
INSUFFICIENT_PARAMETER_NEIGHBORHOOD
LOW_EVENT_COUNT_DEPENDENCE
FOLD_DIRECTION_CONCENTRATION
```

Fail-closed comparison errors:

```text
INCOMPARABLE_LINEAGE
INCOMPARABLE_PARAMETER_STRUCTURE
INCOMPATIBLE_SCIENTIFIC_INPUTS
INCOMPATIBLE_METRIC_VERSIONS
INCOMPARABLE_VALIDATION_PROTOCOL
CORRUPTED_EVIDENCE
AUTHORITY_FAILURE
```

`UNAVAILABLE` is distinct from mathematical zero. Integrity corruption is fail-closed. Fail-closed errors are not converted into `ROBUSTNESS_INSUFFICIENT_EVIDENCE`.

## Scientific Identity: Exact Closed Payloads

The future domain `SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1` is DESIGN_FROZEN / NOT RUNTIME_ADMITTED in this slice. Its canonical payload is exactly:

```text
{
  schemaVersion: "EXPERIMENT_COMPARISON_PROTOCOL_V1",
  policyId: "ROBUSTNESS_COMPARISON_POLICY_V20260927",
  referenceExperiment: HashRef<SYNTRAKE:EXPERIMENT:V1>,
  subjectExperiment: HashRef<SYNTRAKE:EXPERIMENT:V1>,
  referenceExperimentParameters: HashRef<SYNTRAKE:EXPERIMENT_PARAMETERS:V1>,
  subjectExperimentParameters: HashRef<SYNTRAKE:EXPERIMENT_PARAMETERS:V1>,
  referenceResult: HashRef<SYNTRAKE:RESULT:V1>,
  subjectResult: HashRef<SYNTRAKE:RESULT:V1>,
  referenceValidationResult: HashRef<SYNTRAKE:VALIDATION_RESULT:V1>,
  subjectValidationResult: HashRef<SYNTRAKE:VALIDATION_RESULT:V1>,
  metricRegistryVersion: "METRIC_REGISTRY_V20260927",
  primaryMetricId: supported directional Metric V2 id,
  comparisonMetricIds: non-empty byte-sorted unique array of supported Metric V2 ids,
  neighborhoodExperimentRefs: byte-sorted unique array of HashRef<SYNTRAKE:EXPERIMENT:V1>
}
```

No extra keys. `referenceExperiment != subjectExperiment`. Neighborhood must contain subject and must not contain reference unless reference is itself an explicitly tested neighborhood member. Operational UUIDs, tenant IDs, timestamps, labels and idempotency keys are excluded from scientific identity.

The future domain `SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1` is DESIGN_FROZEN / NOT RUNTIME_ADMITTED. Its canonical payload is exactly:

```text
{
  schemaVersion: "EXPERIMENT_COMPARISON_RESULT_V1",
  protocol: HashRef<SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1>,
  parameterDeltas: canonical ordered array of closed parameter-delta union,
  scientificInputDelta: closed ordered array of { field, referenceValue, subjectValue },
  metricDeltas: byte-sorted array of exact metric comparison records,
  validationEvidence: exact fold/aggregate comparison record,
  costEvidence: exact record | { state: "UNAVAILABLE", reason },
  neighborhoodEvidence: exact record | { state: "UNAVAILABLE", reason },
  concentrationEvidence: exact record | { state: "UNAVAILABLE", reason },
  diagnostics: byte-sorted unique closed diagnostic tokens,
  classification: closed robustness classification | null,
  failure: closed fail-closed error | null
}
```

No extra keys. `failure != null` requires `classification = null`. `failure = null` requires exactly one closed classification. Missing evidence is represented in the relevant evidence field and is never omitted.

Hash preimages are the accepted canonical bytes of the exact payload, domain-separated respectively by `SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1` and `SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1`. This slice does not activate those domains in `canonical.ts`.

## Persistence Decision

RL-7 implementation requires append-only persistence because RL-8 and Passport must consume exact historical comparison evidence. No migration is written in this design slice.

Future persistence must provide exact reuse for identical protocol/result payloads, conflict for divergent payload under the same logical comparison, server-derived tenant authority, immutable scientific identity separate from operational UUIDs, RLS + FORCE RLS, no PUBLIC/anon/authenticated/service_role mutation authority, deterministic idempotency, and concurrency equivalent to one accepted identity for one exact logical comparison.

## Passport And Evidence Ledger

Passport/Evidence Ledger later project accepted RL-7 evidence; they do not become scientific authority. Projection preserves protocol/result, reference/subject Experiment, source Result/Evidence Object and Validation Result HashRefs. Absence remains explicit; corrupt evidence fails closed.

## Arithmetic And Determinism

RL-7 uses exact rational arithmetic wherever exact truth exists, byte-order canonical sorting, no locale ordering, no JavaScript floating-point as scientific authority, no randomness, wall clock, mutable process-global scientific state, hidden provider call or mutable current/latest/default token. Any future statistic requiring non-rational math requires a new deterministic methodology contract.

## Relationship To RL-8

RL-7 does not decide promotion. RL-8 owns the Scientific Promotion State Machine V1. RL-7 must not emit `PROMOTION_ELIGIBLE`, investment recommendation, Paper authorization, capital authorization, Live authorization or suitability conclusion.

## Explicit Out Of Scope

RL-7 excludes RL-8 promotion state machine, RL-9 Blind Truth / Evidence Vault, RL-10 orchestration, RL-11 full closure, optimizer/automatic parameter fitting, Monte Carlo, scenario/stress, allocation, suitability, Investing decision methodology, Paper, broker, Live, Capital Kernel, product API, UI and Trading research runtime.

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
