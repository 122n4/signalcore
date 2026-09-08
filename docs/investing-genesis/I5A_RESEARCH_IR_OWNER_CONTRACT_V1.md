# Syntrake Investing Genesis I5-A5 - Research IR Owner Contract V1

Status: `CANDIDATE OWNER CONTRACT - IMPLEMENTATION SOURCE FOR A5`

Canonical predecessor: `0c1f5cc0592e950fe2d0120df707c87ea1fd741a`.

Purpose: admit a narrow, deterministic, engine-independent `SYNTRAKE:RESEARCH_IR:V1` scientific hash payload without inheriting ambiguous working-draft IR shapes.

This contract supersedes `I5A_RESEARCH_IR_HASH_CONTRACT_V1.md` only for the exact A5 runtime subset below. The older file remains audit history and is not controlling where it conflicts with A2/A4/A5.

## 1. Non-Scope

A5 does not implement or define:

- ResearchSpec finalization or `SYNTRAKE:RESEARCH_SPEC:V1` hashing;
- ontology compilation;
- LLM/provider interpretation;
- Experiment, DatasetSnapshot, MetricRequestSet, ExecutionConfig, Result, EvidenceObject admission;
- engine, adapter, execution implementation, cost methodology, slippage methodology, contribution methodology, workers or queues;
- persistence, database schema, migrations, Supabase, Trading, financial authority, or recommendations;
- `ENGINE_STATE`.

`SYNTRAKE:RESEARCH_SPEC:V1` and all future nested domains remain hashing-disabled unless their own owner contract later admits them.

## 2. Hash Domain Admission

`SYNTRAKE:RESEARCH_IR:V1` is `OWNER_PAYLOAD_EXACT` only for:

```text
RESEARCH_IR_HASH_PAYLOAD_V1
```

Exact preimage:

```text
SYNTRAKE:RESEARCH_IR:V1
<SYNTRAKE_CANONICAL_JSON_V1 bytes of RESEARCH_IR_HASH_PAYLOAD_V1>
```

The separator after `V1` is one LF byte. The digest is `SHA-256` rendered as uppercase 64-character hexadecimal text under `SYNTRAKE_SHA256_V1`.

Corrected A5 golden hash:

```text
265D8F6AAC35DB919EC130EE978F1831383E74BC2F625230D61EB81C0F27B44F
```

## 3. Top-Level Payload

Required exact fields:

```ts
{
  schemaVersion: "RESEARCH_IR_HASH_PAYLOAD_V1";
  irVersion: "RESEARCH_IR_V1";
  universe: UniverseNodeV1;
  pipeline: ResearchOperationV1[];
  benchmark: BenchmarkNodeV1;
  testPeriod: { startDate: string; endDate: string };
  valuationCurrency: CurrencyV1;
  startingCapital: {
    amount: DecimalMoneyAmountV1;
    currency: CurrencyV1;
    origin: "SIMULATED";
  };
}
```

No other field is admitted. `null`, `undefined`, JSON numbers, functions, class instances, provider-native objects, arbitrary maps and executable strings fail closed.

`ENGINE_STATE`, execution adapters, engine versions, cost model versions and slippage model versions are absent because A5 does not own their immutable implementation behavior.

## 4. Resource Bounds

The runtime must fail closed before stack or memory exhaustion:

- `pipeline`: `ORDERED_SEQUENCE`, length `1..64`;
- recursive AST depth: maximum `16`;
- total visited AST nodes: maximum `256`;
- canonical payload byte length: maximum `32768`;
- `instrumentIds`: `UNORDERED_SET`, length `1..512`;
- `FIXED_TARGETS.targets`: `UNORDERED_SET`, length `1..512`;
- `AND` / `OR` clauses: `ORDERED_SEQUENCE`, length `2..16`.

Exact duplicate canonical elements are forbidden for every admitted ordered sequence unless this contract explicitly says otherwise. A5 grants no duplicate exception.

## 5. Universe

Only admitted V1 universe:

```ts
{
  type: "EXPLICIT_INSTRUMENTS";
  instrumentIds: string[];
}
```

`instrumentIds` is an `UNORDERED_SET`, sorted by deterministic ASCII/UTF-8 byte lexical order after validation. Exact duplicates are forbidden.

Instrument IDs are opaque canonical strings with byte length `1..64` and grammar:

```text
^[A-Z0-9][A-Z0-9._:-]*$
```

This is not market-data authority and does not prove an instrument exists. Later DatasetSnapshot/owner slices must resolve scientific data admission.

## 6. Scalar And Numeric Owner Bounds

All financial/scientific decimals and integers are JSON strings. JavaScript numeric values are not admitted for canonical numbers.

Currency vocabulary:

```text
USD EUR GBP CHF CAD AUD JPY
```

Canonical decimal/integer field bounds:

| Field | Sign | Min | Max | Max integer digits | Max scale | Unit semantics |
| --- | --- | --- | --- | --- | --- | --- |
| `DECIMAL` literal, `unit=RATIO` | negative allowed | `-1` | `100` | `3` | `8` | return/ratio value, not percent text |
| `DECIMAL` literal, `unit=VALUATION_CURRENCY_PER_INSTRUMENT` | non-negative | `0` | `9999999999999999.99999999` | `16` | `8` | valuation-currency quote per instrument |
| `INTEGER` literal, `unit=SHARES` | non-negative | `0` | `1000000000000` | bounded by max | `0` | share/count quantity |
| `TAKE.count` | positive | `1` | `10000` | bounded by max | `0` | selected row count |
| `FIXED_TARGETS.weight` | non-negative | `0` | `1` | `1` | `8` | portfolio target fraction of 1 |
| `startingCapital.amount` | positive | `0.01` | `9999999999999999.99` | `16` | `2` | simulated starting cash in declared currency |

Invalid examples include `-0`, `+1`, leading zero forms, exponent notation, commas, NaN, Infinity, wrong unit tokens, values below min, values above max and excess scale.

## 7. Data Fields And Value Categories

`DataFieldRefV1`:

```ts
{
  type: "DATA_FIELD_REF";
  fieldId:
    | "ADJUSTED_CLOSE"
    | "TOTAL_RETURN"
    | "VOLUME"
    | "MOMENTUM_12M"
    | "OBSERVATION_DATE";
  fieldVersion: "I5A_RESEARCH_IR_FIELD_CONTRACT_V1";
}
```

Value categories:

| Field | Category |
| --- | --- |
| `ADJUSTED_CLOSE` | `DECIMAL_PRICE` |
| `TOTAL_RETURN` | `DECIMAL_RETURN_RATIO` |
| `MOMENTUM_12M` | `DECIMAL_RETURN_RATIO` |
| `VOLUME` | `INTEGER_VOLUME` |
| `OBSERVATION_DATE` | `DATE` |

These references are IR vocabulary handles only. They do not establish observable methodology or DatasetSnapshot availability.

## 8. Literals And Comparisons

Admitted literal categories:

- `DECIMAL` with unit `RATIO` -> `DECIMAL_RETURN_RATIO`;
- `DECIMAL` with unit `VALUATION_CURRENCY_PER_INSTRUMENT` -> `DECIMAL_PRICE`;
- `INTEGER` with unit `SHARES` -> `INTEGER_VOLUME`;
- `BOOLEAN`;
- `DATE`;
- `ENUM` with value `INCLUDED | EXCLUDED`.

`COMPARE` requires identical left/right value categories. Therefore nonsensical forms such as volume-vs-date, price-vs-boolean and return-vs-enum fail closed.

`BOOLEAN` and `ENUM` comparisons admit only `EQ` and `NEQ`. Other categories admit:

```text
EQ NEQ GT GTE LT LTE
```

`AND` and `OR` clauses are ordered diagnostic sequences; order is scientific identity.

No SQL, JavaScript, expression-language, provider-native, prompt, code, or arbitrary formula string is admitted.

## 9. Supported Operations

Only these pipeline operations are admitted:

- `FILTER`;
- `RANK`;
- `TAKE`;
- `WEIGHT`;
- `ENTER`;
- `EXIT`;
- `REBALANCE`.

Unsupported working-draft nodes including `CONDITION_ON`, `GROUP`, `LAG`, `AGGREGATE`, `NORMALIZE`, `METRIC_REQUEST`, `CANONICAL_UNIVERSE_REF`, contributions, execution nodes, cost nodes and slippage nodes fail closed and are absent from the supported A5 public type surface.

`WEIGHT` admits:

- `{ type: "WEIGHT", method: "EQUAL" }`;
- `{ type: "WEIGHT", method: "FIXED_TARGETS", targets: FixedWeightTargetV1[] }`.

`FIXED_TARGETS.targets` is sorted by instrument ID byte order. Instrument IDs are unique. Weights must sum exactly to `1.00000000`; no tolerance is admitted.

`REBALANCE.schedule` admits:

```text
DAILY WEEKLY MONTHLY QUARTERLY ANNUAL
```

## 10. Benchmark

Benchmark is a required top-level selector with exactly one of:

```ts
{ type: "BENCHMARK"; benchmark: "NONE" }
{ type: "BENCHMARK"; benchmark: "INSTRUMENT"; instrumentId: InstrumentIdV1 }
```

Benchmark is not a pipeline operation, not repeatable, and never implicitly absent/defaulted.

## 11. Test Period And Starting Capital

Dates use `YYYY-MM-DD` Gregorian calendar text.

`testPeriod.startDate <= testPeriod.endDate`.

`startingCapital.origin` must be `SIMULATED`. Missing capital is not zero and real account capital is never inferred.

## 12. Replay And Boundaries

For the same admitted semantic IR, canonical bytes and hash are byte-identical across TypeScript and PostgreSQL implementations that implement A2 canonical JSON and this owner payload.

IDs, timestamps, worker metadata, queue metadata, UI state, conversation state, explanation prose, engine state and mutable execution behavior tokens are absent from the scientific payload.

RunInput hashing remains blocked until all required nested scientific domains besides IR are admitted by their own owner contracts.
