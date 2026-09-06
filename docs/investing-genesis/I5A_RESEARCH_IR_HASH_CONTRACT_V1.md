# Syntrake Investing Genesis I5-A — Research IR + Canonical Hash Contract V1

Status: `WORKING CONTRACT — NOT FROZEN`

Parent: `5de091fcfe1f595d781f6cbc4eaa49ed49341398`.

Purpose: make deterministic scientific identity explicit. This file is design only.

---

# 1. Canonical serialization

Canonical structured scientific identity uses:

```text
SYNTRAKE_CANONICAL_JSON_V1
```

## 1.1 Encoding rules

1. UTF-8, no BOM.
2. JSON object keys sorted lexicographically by Unicode code point.
3. No insignificant whitespace.
4. Arrays preserve semantic order unless the field contract explicitly declares the collection unordered.
5. Unordered collections are sorted by a field-specific canonical key before encoding.
6. Strings use standard JSON escaping and are not Unicode-normalized implicitly. Input normalization, if required, occurs before the canonical object is admitted.
7. UUID textual values are lowercase canonical UUID form.
8. Canonical financial/scientific decimals are JSON strings, never JSON floating-point numbers.
9. Canonical integers whose schema bounds are safe integers may be JSON integers.
10. Timestamps are canonical strings with explicit UTC offset `Z` and exact contract precision. When microsecond precision exists, it is preserved.
11. Dates are `YYYY-MM-DD` strings.
12. Enums use their exact schema token.
13. Optional fields that are semantically absent are omitted.
14. `null` is allowed only where the schema defines null as a distinct semantic value.
15. `undefined`, NaN, Infinity, functions, arbitrary class instances and provider-native objects are forbidden.
16. Arbitrary map objects are forbidden unless the schema defines their key domain and canonical ordering.
17. Every canonical top-level object includes a schema/version discriminator.

## 1.2 Domain-defined unordered collections

Initial V1 canonical sort rules:

```text
DatasetSnapshot.series
  sort by canonicalSeriesId ASC, then seriesRefId ASC

CanonicalExperimentParameterSet.values
  sort by parameterId ASC

ResearchSpec.metricRequests
  sort by metricId ASC, then metricVersion ASC

ResearchSpec.explicitDefaults
  sort by fieldPath ASC

ResearchSpec.assumptions
  sort by assumptionId ASC

ResearchTemplateVersion.provenanceEvidenceRefs
  sort by evidenceObjectId/ID ASC

Result.metrics
  sort by metricId ASC, then metricVersion ASC

Result.artifacts
  sort by kind ASC, then evidenceObjectId ASC

qualityFlags / warningCodes where order has no declared meaning
  unique + lexicographic ASC
```

Operation pipeline arrays, proxy chains and lineage/event sequences preserve semantic order.

---

# 2. Hash contract

Initial algorithm/version:

```text
SHA-256
SYNTRAKE_SHA256_V1
```

Hash bytes are lowercase hexadecimal.

Every scientific hash is domain-separated.

General byte contract:

```text
<ASCII DOMAIN PREFIX> + "\n" + <SYNTRAKE_CANONICAL_JSON_V1 bytes>
```

Initial prefixes:

```text
SYNTRAKE:RESEARCH_DRAFT:V1
SYNTRAKE:HYPOTHESIS:V1
SYNTRAKE:RESEARCH_SPEC:V1
SYNTRAKE:RESEARCH_IR:V1
SYNTRAKE:EXPERIMENT:V1
SYNTRAKE:EXPERIMENT_PARAMETERS:V1
SYNTRAKE:DATASET_SERIES:V1
SYNTRAKE:DATASET_SNAPSHOT:V1
SYNTRAKE:ACCOUNT_RESEARCH_CONTEXT:V1
SYNTRAKE:RUN_INPUT:V1
SYNTRAKE:RESULT:V1
SYNTRAKE:EVIDENCE_OBJECT:V1
SYNTRAKE:RESEARCH_TEMPLATE:V1
```

Hash version/algorithm migration never rewrites historical hashes. New versions coexist with old versions and exact algorithm/version remain evidence.

---

# 3. Golden hash vectors

These vectors are normative for an eventual implementation test suite.

## Vector A — ResearchSpec fragment

Canonical payload bytes:

```json
{"explicitDefaults":[],"schemaVersion":"RESEARCH_SPEC_REVISION_V1","valuationCurrency":"EUR"}
```

Hashed byte stream:

```text
SYNTRAKE:RESEARCH_SPEC:V1
{"explicitDefaults":[],"schemaVersion":"RESEARCH_SPEC_REVISION_V1","valuationCurrency":"EUR"}
```

Expected SHA-256:

```text
143abc3c0e18e00db486b978665fabc89468a86f2e6513161647c69c8fdb9b7e
```

## Vector B — Experiment parameter set

Canonical payload bytes:

```json
{"schemaVersion":"EXPERIMENT_PARAMETERS_V1","values":[{"canonicalValue":"0.15","parameterId":"gold_weight","source":"EXPLICIT_OVERRIDE","unit":"RATIO","valueType":"DECIMAL"}]}
```

Hashed byte stream:

```text
SYNTRAKE:EXPERIMENT_PARAMETERS:V1
{"schemaVersion":"EXPERIMENT_PARAMETERS_V1","values":[{"canonicalValue":"0.15","parameterId":"gold_weight","source":"EXPLICIT_OVERRIDE","unit":"RATIO","valueType":"DECIMAL"}]}
```

Expected SHA-256:

```text
1827d6293c6f0fcbad9387042f6c634b4b57e0c0178aafe384aa9658b402cb97
```

## Vector C — Run input identity fragment

Canonical payload bytes:

```json
{"datasetSnapshotHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","engineVersion":"HISTORICAL_EXECUTION_ADAPTER_V1","experimentParameterSetHash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","researchIrHash":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","researchSpecHash":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"}
```

Expected SHA-256 over prefix `SYNTRAKE:RUN_INPUT:V1\n` + payload:

```text
97cd0559988a8fa2234716487d98c1bf1d2a059df8e49777659080f4ab0eea59
```

Any implementation producing a different digest for these exact bytes is non-canonical.

---

# 4. Research IR V1

Canonical executable scientific representation:

```text
RESEARCH_IR_V1
```

The IR is a closed typed AST. It cannot execute arbitrary code.

```ts
interface ResearchIrV1 {
  irVersion: "RESEARCH_IR_V1";
  universe: UniverseNodeV1;
  pipeline: ResearchOperationV1[];
  benchmark?: BenchmarkNodeV1;
  metrics: MetricRequestNodeV1[];
  execution: HistoricalExecutionNodeV1;
}
```

---

# 5. Universe node

```ts
type UniverseNodeV1 =
  | {
      type: "EXPLICIT_INSTRUMENTS";
      instrumentRefs: InstrumentRefV1[];
    }
  | {
      type: "CANONICAL_UNIVERSE_REF";
      universeId: string;
      universeVersion: string;
    };
```

For `EXPLICIT_INSTRUMENTS`, the canonical set is sorted by canonical instrument ID because input list order has no scientific meaning.

A universe reference must be resolvable to versioned membership or to a versioned DatasetSnapshot requirement before execution.

---

# 6. Canonical scalar/value expressions

```ts
type CanonicalLiteralV1 =
  | { type: "DECIMAL"; value: string; unit?: string }
  | { type: "INTEGER"; value: number; unit?: string }
  | { type: "BOOLEAN"; value: boolean }
  | { type: "DATE"; value: string }
  | { type: "DURATION"; value: string }
  | { type: "ENUM"; value: string }
  | { type: "INSTRUMENT_REF"; value: string }
  | { type: "CONCEPT_REF"; value: string };

interface DataFieldRefV1 {
  type: "DATA_FIELD_REF";
  fieldId: string;
  fieldVersion: string;
  lag?: { periods: number; frequency: string };
}
```

No literal financial decimal is a JS floating-point number.

---

# 7. Boolean expression AST

```ts
type CompareOperatorV1 =
  | "EQ"
  | "NEQ"
  | "GT"
  | "GTE"
  | "LT"
  | "LTE";

type BooleanExpressionV1 =
  | {
      type: "COMPARE";
      left: DataFieldRefV1;
      operator: CompareOperatorV1;
      right: CanonicalLiteralV1 | DataFieldRefV1;
    }
  | {
      type: "AND";
      clauses: BooleanExpressionV1[];
    }
  | {
      type: "OR";
      clauses: BooleanExpressionV1[];
    }
  | {
      type: "NOT";
      clause: BooleanExpressionV1;
    };
```

`AND`/`OR` clause order is canonicalized only if semantic equivalence and diagnostic ordering are explicitly preserved by the compiler contract. V1 default is to preserve compiler-emitted order.

---

# 8. Research operation union

```ts
type ResearchOperationV1 =
  | FilterNodeV1
  | RankNodeV1
  | TakeNodeV1
  | WeightNodeV1
  | EnterNodeV1
  | ExitNodeV1
  | RebalanceNodeV1
  | ConditionOnNodeV1
  | GroupNodeV1
  | LagNodeV1
  | AggregateNodeV1
  | NormalizeNodeV1;
```

## FILTER

```ts
interface FilterNodeV1 {
  type: "FILTER";
  predicate: BooleanExpressionV1;
}
```

## RANK

```ts
interface RankNodeV1 {
  type: "RANK";
  field: DataFieldRefV1;
  direction: "ASC" | "DESC";
  missingPolicy: "EXCLUDE" | "LAST";
}
```

## TAKE

```ts
interface TakeNodeV1 {
  type: "TAKE";
  count: number;
}
```

`count` must be integer > 0 and bounded by policy.

## WEIGHT

```ts
type WeightNodeV1 =
  | {
      type: "WEIGHT";
      method: "EQUAL";
    }
  | {
      type: "WEIGHT";
      method: "FIXED_TARGETS";
      targets: FixedWeightTargetV1[];
    };

interface FixedWeightTargetV1 {
  instrumentId: string;
  weight: string;
}
```

Fixed targets are sorted by instrument ID before canonical hashing and must satisfy the accepted sum/tolerance policy exactly.

## ENTER / EXIT

```ts
interface EnterNodeV1 {
  type: "ENTER";
  condition: BooleanExpressionV1;
}

interface ExitNodeV1 {
  type: "EXIT";
  condition: BooleanExpressionV1;
}
```

An execution adapter may reject these nodes if its declared capability version does not support them.

## REBALANCE

```ts
interface RebalanceNodeV1 {
  type: "REBALANCE";
  schedule:
    | "DAILY"
    | "WEEKLY"
    | "MONTHLY"
    | "QUARTERLY"
    | "ANNUAL";
  calendarPolicyVersion: string;
}
```

## CONDITION_ON

```ts
interface ConditionOnNodeV1 {
  type: "CONDITION_ON";
  condition: BooleanExpressionV1;
}
```

## GROUP

```ts
interface GroupNodeV1 {
  type: "GROUP";
  fieldId: string;
  fieldVersion: string;
}
```

## LAG

```ts
interface LagNodeV1 {
  type: "LAG";
  field: DataFieldRefV1;
  periods: number;
}
```

## AGGREGATE

```ts
interface AggregateNodeV1 {
  type: "AGGREGATE";
  field: DataFieldRefV1;
  method: "SUM" | "MEAN" | "MIN" | "MAX" | "MEDIAN";
  window: { periods: number; frequency: string };
}
```

## NORMALIZE

```ts
interface NormalizeNodeV1 {
  type: "NORMALIZE";
  field: DataFieldRefV1;
  method: "Z_SCORE" | "MIN_MAX" | "PERCENTILE_RANK";
  window?: { periods: number; frequency: string };
}
```

A compiler/adaptor capability matrix determines whether an admitted node can execute. Unsupported operations fail closed before Run execution.

---

# 9. Benchmark and metrics

```ts
interface BenchmarkNodeV1 {
  benchmarkId: string;
  benchmarkVersion: string;
}

interface MetricRequestNodeV1 {
  metricId: string;
  metricVersion: string;
  parameters: CanonicalMetricParameterV1[];
}
```

Metric requests are canonicalized by metric ID/version. Parameter sets are themselves typed and sorted by parameter ID.

---

# 10. Historical execution node

```ts
interface HistoricalExecutionNodeV1 {
  type: "HISTORICAL_EXECUTION";
  adapterId: "HISTORICAL_EXECUTION_ADAPTER_V1";
  testPeriod: {
    startDate: string;
    endDate: string;
  };
  valuationCurrency: string;
  startingCapital: {
    amount: string;
    currency: string;
    origin: "SIMULATED";
  };
  transactionCostModel: TransactionCostModelNodeV1;
  slippageModel: SlippageModelNodeV1;
  contributionSchedule?: ContributionScheduleNodeV1;
}
```

Starting capital is always explicitly `SIMULATED` for the Research adapter.

---

# 11. Cost/slippage nodes

```ts
type TransactionCostModelNodeV1 =
  | {
      model: "PROPORTIONAL_BPS";
      bps: string;
      modelVersion: "TRANSACTION_COST_PROPORTIONAL_BPS_V1";
    };

type SlippageModelNodeV1 =
  | {
      model: "EXPLICIT_ZERO";
      modelVersion: "SLIPPAGE_EXPLICIT_ZERO_V1";
    }
  | {
      model: "PROPORTIONAL_BPS";
      bps: string;
      modelVersion: "SLIPPAGE_PROPORTIONAL_BPS_V1";
    };
```

Zero is accepted only through the explicit zero model, not missing configuration.

---

# 12. Periodic contribution contract V1

The source Research Lab specification includes periodic contributions in the initial backtest capability. I5 therefore accepts a narrow deterministic V1 rather than silently parking the requirement.

```ts
interface ContributionScheduleNodeV1 {
  type: "FIXED_PERIODIC_CONTRIBUTION";
  amount: string;
  currency: string;
  frequency: "MONTHLY" | "QUARTERLY" | "ANNUAL";
  timing: "BEFORE_REBALANCE";
  calendarPolicyVersion: "RESEARCH_CONTRIBUTION_CALENDAR_V1";
}
```

`RESEARCH_CONTRIBUTION_CALENDAR_V1`:

1. generate nominal contribution dates from the ResearchSpec start date at the requested calendar frequency;
2. if a nominal date is not present in the canonical valuation calendar, roll forward to the first available valuation timestamp inside the Run period;
3. if no timestamp remains in the Run period, omit that future contribution event rather than fabricate one after end date;
4. contribution posts to simulated cash immediately before any rebalance scheduled at the same canonical timestamp;
5. contribution amount is converted only when an explicit FX series/methodology is present; otherwise incompatible currency blocks execution;
6. every generated contribution cashflow is an Evidence artifact input/event;
7. contribution amount/timing is included in Run input hash.

Withdrawals are not required by V1 unless separately specified; the source says withdrawals only "if supported".

---

# 13. IR capability declaration

Every deterministic adapter exposes a versioned capability declaration, for example:

```text
HISTORICAL_EXECUTION_ADAPTER_V1
  EXPLICIT_INSTRUMENTS     supported
  CANONICAL_UNIVERSE_REF   supported after snapshot resolution
  FILTER                   optional capability flag
  RANK                     optional capability flag
  TAKE                     optional capability flag
  WEIGHT_EQUAL             supported
  WEIGHT_FIXED_TARGETS     supported
  ENTER                    not required for minimal floor
  EXIT                     not required for minimal floor
  REBALANCE                supported
  BENCHMARK                supported
  COST                     supported
  SLIPPAGE                 supported
  CONTRIBUTIONS_FIXED      supported
```

A ResearchSpec can exist with a valid IR not executable by a particular adapter. Run creation must select an adapter whose capability declaration satisfies every required IR node.

---

# 14. Compiler determinism

For fixed:

```text
semantic input
compiler version
ontology version
policy version
explicit defaults
```

the compiler must produce byte-identical canonical `RESEARCH_IR_V1` after canonical serialization.

Interpretation-provider output does not bypass semantic validation. The deterministic boundary begins only after the semantic representation has been fixed and accepted.

---

# 15. Hash inclusion/exclusion law

## Included in scientific input identity when material

```text
ResearchSpec content
Research IR
Experiment parameters
DatasetSnapshot
AccountResearchContextSnapshot if used
engine + adapter versions
metric versions/parameters
cost/slippage config
contribution config
valuation/FX methodology
deterministic seed
policy versions capable of changing output
```

## Excluded from scientific input identity

```text
worker_id
lease token
retry count
queue timestamp
UI state
conversation state
explanation level
LLM prose explanation
telemetry counters
```

A value excluded from the Run hash must not be capable of changing deterministic engine output.

---

# 16. Freeze requirements for this contract

Before I5-A freeze:

1. golden vectors above must be independently recomputed;
2. every IR node admitted to V1 must have a schema validator contract;
3. canonical sort rules must cover every unordered collection in the accepted types;
4. adapter capability behavior must fail closed;
5. contribution-calendar examples/golden cases must be added;
6. no JS floating-point financial field may exist in canonical IR;
7. canonical timestamp precision must be compatible with the PostgreSQL transport rule already learned in I3/I4 rehearsal.
