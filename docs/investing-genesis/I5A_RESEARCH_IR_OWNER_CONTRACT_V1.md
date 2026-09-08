# Syntrake Investing Genesis I5-A5 - Research IR Owner Contract V1

Status: `CANDIDATE OWNER CONTRACT - IMPLEMENTATION SOURCE FOR A5`

Canonical predecessor: `0c1f5cc0592e950fe2d0120df707c87ea1fd741a`.

Purpose: admit a narrow, deterministic `SYNTRAKE:RESEARCH_IR:V1` scientific hash payload without inheriting ambiguous working-draft IR shapes.

This contract supersedes `I5A_RESEARCH_IR_HASH_CONTRACT_V1.md` only for the exact runtime subset below. The older file remains audit history and is not controlling where it conflicts with A2/A4/A5.

## 1. Non-scope

A5 does not implement or define:

- ResearchSpec finalization or `SYNTRAKE:RESEARCH_SPEC:V1` hashing;
- ontology compilation;
- LLM/provider interpretation;
- Experiment, DatasetSnapshot, MetricRequestSet, ExecutionConfig, Result, EvidenceObject admission;
- persistence, database schema, migrations, workers, queues, Trading, financial authority, or recommendations;
- `ENGINE_STATE`.

`SYNTRAKE:RESEARCH_SPEC:V1` and all future nested domains remain hashing-disabled unless their own owner contract later admits them.

## 2. Hash Domain Admission

`SYNTRAKE:RESEARCH_IR:V1` moves from `DECLARED_BUT_HASHING_DISABLED` to `OWNER_PAYLOAD_EXACT` only for this payload:

```text
RESEARCH_IR_HASH_PAYLOAD_V1
```

Exact preimage:

```text
SYNTRAKE:RESEARCH_IR:V1
<SYNTRAKE_CANONICAL_JSON_V1 bytes of RESEARCH_IR_HASH_PAYLOAD_V1>
```

The newline after `V1` is one LF byte. The digest is `SHA-256` rendered as uppercase 64-character hexadecimal text under `SYNTRAKE_SHA256_V1`.

## 3. Top-Level Payload

Required exact fields:

```ts
{
  schemaVersion: "RESEARCH_IR_HASH_PAYLOAD_V1";
  irVersion: "I5A_RESEARCH_IR_OWNER_CONTRACT_V1";
  universe: UniverseNodeV1;
  pipeline: ResearchOperationV1[];
  execution: HistoricalExecutionNodeV1;
}
```

No other field is admitted. `null`, `undefined`, JSON numbers, functions, class instances, provider-native objects, arbitrary maps and executable strings fail closed.

`pipeline` is `ORDERED_SEQUENCE`, length `1..64`. Operation order is scientific identity. Exact duplicate canonical operation elements are forbidden.

## 4. Universe

Only admitted V1 universe:

```ts
{
  type: "EXPLICIT_INSTRUMENTS";
  instrumentIds: string[];
}
```

`instrumentIds` is an `UNORDERED_SET`, length `1..512`, sorted by deterministic ASCII/UTF-8 byte lexical order after validation. Exact duplicate instrument IDs are forbidden.

Instrument IDs are opaque canonical strings with byte length `1..64` and grammar:

```text
^[A-Z0-9][A-Z0-9._:-]*$
```

This is not market-data authority and does not prove an instrument exists. Later DatasetSnapshot/owner slices must resolve scientific data admission.

## 5. Scalar Nodes

All financial/scientific decimals and integers are JSON strings. JavaScript numeric values are not admitted for canonical numbers.

Decimals use A2 `CanonicalDecimalV1`. `-0`, `+1`, leading zero forms, exponent notation, commas, NaN and Infinity are invalid.

Dates use `YYYY-MM-DD` Gregorian calendar text. Timestamps are absent from A5 IR.

Allowed currencies:

```text
USD EUR GBP CHF CAD AUD JPY
```

## 6. Data Fields And Expressions

`DataFieldRefV1`:

```ts
{
  type: "DATA_FIELD_REF";
  fieldId: "ADJUSTED_CLOSE" | "TOTAL_RETURN" | "VOLUME" | "MOMENTUM_12M";
  fieldVersion: "I5A_RESEARCH_IR_FIELD_CONTRACT_V1";
}
```

This reference is an IR vocabulary handle only. It does not establish observable methodology or DatasetSnapshot availability.

`BooleanExpressionV1` admits only structured:

- `COMPARE`;
- `AND`;
- `OR`;
- `NOT`.

`AND` and `OR` clauses are `ORDERED_SEQUENCE`, length `2..16`, and exact duplicate canonical clauses are forbidden.

No SQL, JavaScript, expression-language, provider-native, prompt, code, or arbitrary formula string is admitted.

## 7. Supported Operations

Only these pipeline operations are admitted:

- `FILTER`;
- `RANK`;
- `TAKE`;
- `WEIGHT`;
- `ENTER`;
- `EXIT`;
- `REBALANCE`;
- `BENCHMARK`.

`CONDITION_ON`, `GROUP`, `LAG`, `AGGREGATE`, `NORMALIZE`, `METRIC_REQUEST`, `CANONICAL_UNIVERSE_REF`, contributions and other working-draft nodes remain unsupported and fail closed in A5.

`TAKE.count` is a string integer in `1..10000`.

`WEIGHT` admits:

- `{ type: "WEIGHT", method: "EQUAL" }`;
- `{ type: "WEIGHT", method: "FIXED_TARGETS", targets: FixedWeightTargetV1[] }`.

`FIXED_TARGETS.targets` is an `UNORDERED_SET`, length `1..512`, sorted by instrument ID byte order. Instrument IDs are unique. Weights are decimals in `0..1`, scale at most 8. The canonical scaled sum must equal exactly `1.00000000`; no tolerance is admitted.

`REBALANCE.schedule` admits:

```text
DAILY WEEKLY MONTHLY QUARTERLY ANNUAL
```

`BENCHMARK` admits explicit `NONE` or explicit `INSTRUMENT`.

## 8. Execution Node

Only:

```ts
{
  type: "HISTORICAL_EXECUTION";
  adapterId: "HISTORICAL_EXECUTION_ADAPTER_V1";
  testPeriod: { startDate: string; endDate: string };
  valuationCurrency: Currency;
  startingCapital: { amount: string; currency: Currency; origin: "SIMULATED" };
  transactionCostModel: TransactionCostModelNodeV1;
  slippageModel: SlippageModelNodeV1;
}
```

`testPeriod.startDate <= testPeriod.endDate`.

`startingCapital.origin` must be `SIMULATED`. Missing capital is not zero. Missing cost/slippage is not zero.

Cost model:

```ts
{ model: "EXPLICIT_ZERO"; modelVersion: "TRANSACTION_COST_EXPLICIT_ZERO_V1" }
{ model: "PROPORTIONAL_BPS"; bps: string; modelVersion: "TRANSACTION_COST_PROPORTIONAL_BPS_V1" }
```

Slippage model:

```ts
{ model: "EXPLICIT_ZERO"; modelVersion: "SLIPPAGE_EXPLICIT_ZERO_V1" }
{ model: "PROPORTIONAL_BPS"; bps: string; modelVersion: "SLIPPAGE_PROPORTIONAL_BPS_V1" }
```

Basis points are canonical decimals in `0..10000`, scale at most 4.

## 9. Replay And Boundaries

For the same admitted semantic IR, canonical bytes and hash are byte-identical across TypeScript and PostgreSQL implementations that implement A2 canonical JSON and this owner payload.

IDs, timestamps, worker metadata, queue metadata, UI state, conversation state and explanation prose are absent from the scientific payload.

RunInput hashing remains blocked until all required nested scientific domains besides IR are admitted by their own owner contracts.
