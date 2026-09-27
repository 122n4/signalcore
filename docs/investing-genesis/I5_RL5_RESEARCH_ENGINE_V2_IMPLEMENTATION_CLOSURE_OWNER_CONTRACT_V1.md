# I5 RL-5 Research Engine V2 Implementation Closure Owner Contract V1

Status: CANDIDATE / RL-5_RESEARCH_ENGINE_V2_IMPLEMENTATION_CLOSURE / UNNUMBERED

Canonical predecessor:
`4f0e0a18571ee7f556c528d3ea619feefc7bfef0`

Production mutation:
`NONE`

Production migration:
`NOT APPLIED`

RL-5 acceptance:
`NOT ACCEPTED`

Previous independently audited candidate:
`0a8696c06a8956fcd6e726991281c3d50c6d8ce1`

Independent audit verdict:
`BLOCKED - SCIENTIFIC ADMISSION / V1-V2 ISOLATION CORRECTION REQUIRED`

Candidate publication:
`ESTABLISHED BY GIT HISTORY / NOT AN ACCEPTANCE SIGNAL`

## Engine Identity

Historical immutable profile:

```text
engineId = HISTORICAL_EXECUTION_ADAPTER
engineVersion = ENGINE_V20260918
executionModelClass = SYNTHETIC_ADJUSTED_CLOSE_RESEARCH_V1
```

Engine V2 candidate profile:

```text
engineId = HISTORICAL_EXECUTION_ADAPTER
engineVersion = ENGINE_V20260926
executionModelClass = NEXT_SESSION_ADJUSTED_OHLCV_RESEARCH_V2
```

## Candidate Runtime Files

```text
lib/investing/research/historicalExecutionEngineV2.ts
lib/investing/research/calendars.ts
lib/investing/research/calendars/XNYS_TRADING_CALENDAR_V2.json
lib/investing/research/datasetMaterial.ts
lib/investing/research/exactRational.ts
lib/investing/research/researchIr.ts
lib/investing/research/resultArtifacts.ts
lib/investing/research/evidenceObject.ts
lib/investing/research/runInputScientific.ts
lib/investing/research/researchExecutionWriter.ts
lib/investing/research/validationProtocol.ts
lib/investing/research/validationExecution.ts
lib/investing/research/validationExecutionWriter.ts
lib/investing/research/researchPassportReader.ts
```

## V1 Preservation Statement

The candidate is additive for Engine V2 and keeps V1 engine identity, V1 calendar
artifact, V1 Result artifact schemas, V1 Evidence hash domain, V1 Validation
boundary policy, and V1 Research Execution/Validation/Passport behavior covered
by the full repository test suite.

No accepted historical migration is edited. No Production mutation is performed.

## RunInput V2 Profile

The candidate admits Engine V2 only for:

```text
schemaVersion = RUN_INPUT_HASH_PAYLOAD_V1
runType = HISTORICAL_BACKTEST
researchEnvironment = HISTORICAL_BACKTEST
researchSourceContext = PURE_RESEARCH
accountResearchContext = ABSENT
engineId = HISTORICAL_EXECUTION_ADAPTER
engineVersion = ENGINE_V20260926
metricRegistryVersion = METRIC_REGISTRY_V20260918
deterministicSeed = ABSENT
metric requests = TOTAL_RETURN, MAX_DRAWDOWN / METRIC_V1
```

Exact material policies:

```text
DATASET_SNAPSHOT / DATASET_SNAPSHOT_POLICY_V1
EXECUTION_CONFIG / EXECUTION_CONFIG_HASH_PAYLOAD_V1
```

## ExecutionConfig V2 Matrix

Implemented candidate matrix:

```text
engineCompatibilityVersion = ENGINE_V20260926
missingDataPolicy = MISSING_DATA_STRICT_RESEARCH_V2
fxPolicy = FX_USD_IDENTITY_V1
fillPolicy = NEXT_SESSION_OPEN_V1
corporateActionPolicy = SYNTHETIC_ADJUSTED_OHLC_PROVIDER_V2
calendarSessionPolicy = XNYS_OPEN_CLOSE_SESSION_V2
valuationPolicy = USD_ADJUSTED_CLOSE_MARK_V2
```

Cost policies:

```text
COMMISSION_FEES_ZERO_V1
COMMISSION_FEES_NOTIONAL_1_BPS_V1
COMMISSION_FEES_NOTIONAL_5_BPS_V1
COMMISSION_FEES_NOTIONAL_10_BPS_V1
COMMISSION_FEES_NOTIONAL_25_BPS_V1
```

Slippage policies:

```text
SLIPPAGE_ZERO_RESEARCH_V1
SLIPPAGE_SPREAD_ADVERSE_1_BPS_V1
SLIPPAGE_SPREAD_ADVERSE_5_BPS_V1
SLIPPAGE_SPREAD_ADVERSE_10_BPS_V1
SLIPPAGE_SPREAD_ADVERSE_25_BPS_V1
SLIPPAGE_SPREAD_ADVERSE_50_BPS_V1
```

## Research IR V2 Registry

Implemented under:

```text
RESEARCH_IR_HASH_PAYLOAD_V1
RESEARCH_IR_V1
SYNTRAKE:RESEARCH_IR:V1
```

V2 field version:

```text
I5_RL4_RESEARCH_IR_FIELD_CONTRACT_V2
```

Registry:

```text
TOTAL_RETURN
MOMENTUM_12M
OPEN_TO_CLOSE_RETURN
INTRADAY_RANGE_RATIO
CLOSE_TO_SMA_20_RETURN
CLOSE_TO_SMA_50_RETURN
CLOSE_TO_SMA_200_RETURN
CLOSE_TO_ROLLING_HIGH_20_RETURN
CLOSE_TO_ROLLING_LOW_20_RETURN
VOLUME
OBSERVATION_DATE
```

Value categories match RL-4.

## DatasetSeries V2 Matrix

DatasetSeries owner-payload shape changed:

```text
NO
```

Raw V2 fields:

```text
ADJUSTED_OPEN / SYNTHETIC_ADJUSTED_OHLC_PROVIDER_V2 / USD
ADJUSTED_HIGH / SYNTHETIC_ADJUSTED_OHLC_PROVIDER_V2 / USD
ADJUSTED_LOW / SYNTHETIC_ADJUSTED_OHLC_PROVIDER_V2 / USD
ADJUSTED_CLOSE / SYNTHETIC_ADJUSTED_OHLC_PROVIDER_V2 / USD
VOLUME / POINT_IN_TIME_REPORTED_SESSION_VOLUME_V2 / NONE
```

Common requirements:

```text
frequency = DAILY
timezone = America/New_York
calendar = XNYS_TRADING_CALENDAR_V2
```

OBSERVATION_DATE separate DatasetSeries:

```text
NO
```

## Provider Provenance Registry

Path:

```text
lib/investing/research/datasetMaterial.ts
```

Registered immutable fixture profile:

```text
providerDatasetId = SYNTRAKE_RL5_TEST_OHLCV
providerDatasetVersion = V20260926
fixture = true
ohlcAdjustmentMethodology = SYNTHETIC_ADJUSTED_OHLC_TEST_FIXTURE
ohlcAdjustmentMethodologyVersion = V20260926
commonOhlcAdjustmentBasis = true
volumeSemantic = POINT_IN_TIME_REPORTED_SESSION_VOLUME
volumeState = RAW_REPORTED
volumePointInTimeSafe = true
```

Real provider provenance invented:

```text
NO
```

REAL_PROVIDER_EXECUTION:

```text
UNAVAILABLE
```

Reason:

```text
no real providerDatasetId/providerDatasetVersion provenance profile is admitted
under ENGINE_V20260926
```

The fixture-only provider registry does not authorize arbitrary real-provider
market data execution under `ENGINE_V20260926`. Because admitted provider
profiles are immutable scientific behavior, adding a real provider profile is a
future engine-version decision, not a same-engineVersion promise.

Unknown provider, mixed OHLC basis, OHLC invariant violation, and missing
point-in-time volume provenance fail closed.

## Calendar

Path:

```text
lib/investing/research/calendars/XNYS_TRADING_CALENDAR_V2.json
```

Coverage:

```text
1980-01-01 through 2035-12-31
```

Session count:

```text
14105
```

Session-list SHA-256:

```text
3F69B45605C1E64B8ABF5CAA2E76B5E2B8CAD7CF3C7DCF6A0D985E2D3A74F8BB
```

Artifact SHA-256:

```text
071433C0BCC4D72960DEEBBFC5678E5635E41B2B48319E05658D9715CA3F8578
```

Generator:

```text
scripts/investing/generateXnysCalendarV2.py
```

Generator versions:

```text
exchange_calendars 4.11.1
pandas_market_calendars 5.1.1
```

Generator enforcement:

```text
scripts/investing/generateXnysCalendarV2.py fails immediately when installed
exchange_calendars or pandas_market_calendars versions differ from the recorded
literal versions.
```

Generator wall-clock dependency:

```text
NO
```

V1/V2 overlap evidence:

```text
verifyXnysTradingCalendarArtifactV2 checks V1/V2 overlap ordering and membership.
Focused and full suite tests PASS.
```

## Execution Semantics

Candidate implements:

```text
next-session OPEN execution
sell-before-buy ordering
explicit fee once
adverse slippage embedded in effective fill price
common exact buying-power lambda serialized as a reduced rational
quantity truncation to 8 decimals
V2 money output to max exact scale 24 with no rounding
```

Benchmark serialization:

```text
EXACT REDUCED RATIONAL in V2 benchmark artifact records
```

Non-terminating benchmark fixture:

```text
final benchmark value numerator = 1450000
final benchmark value denominator = 1431
```

## Golden Fixture

Frozen deterministic V2 fixture hashes:

```text
RunInput hash = 7790ABE5668B8EA731C62DA9A448E88E90BB1A00CF243422B18019840610F5DC
executionTrace SHA-256 = 21EE330089A144643A250511E594BAFFAF0925F1F74B92A44AF0A6054D723914
valuationSeries SHA-256 = 77117D88B2DEFC2C9405A912BCF27D640493DCF701FDB73DFF44706AEAF50581
metricResultSet SHA-256 = FEA6D5C953CBBF4FB89414F6565DF273DC53DB734EBED6E0E391B5702AD9E747
benchmarkSeries SHA-256 = 1558958199AF14B9013691E09C7F4DE4C1D3C06EDD9726FD9CB5AC4D2471920D
Result hash = 1198A30836B948412E57593CCBFF05AC82D97517DC6E52CACFF36A47E5AA4888
Evidence hash = C6241F265BCB4D75DE5E676C063640A046932FA62E288BB3F51FCC207A998BC0
```

The fixture exercises two instruments, adjusted OHLCV, nonzero fee, nonzero
slippage, deterministic byte-identical artifacts, Result identity, and Evidence
identity.

## Result, Evidence, And Passport

Result V2 under:

```text
SYNTRAKE:RESULT:V1
```

Evidence V2 under:

```text
SYNTRAKE:EVIDENCE_OBJECT:V1
```

Research Execution writer dispatches:

```text
ENGINE_V20260918 -> V1 kernel/material verifier
ENGINE_V20260926 -> V2 kernel/material verifier
other -> UNSUPPORTED_ENGINE
```

Successful writer path remains:

```text
Result -> Evidence -> SUCCEEDED
```

Research Passport remains `RESEARCH_PASSPORT_V1` and reconstructs accepted V2
Result/Evidence/artifact rows. Inline Evidence content engine identity must match
the persisted Result row when present.

## Validation Compatibility

Validation protocol admission matrix:

```text
ENGINE_V20260918 -> EXACT_XNYS_SESSION_BOUNDARIES_V1
ENGINE_V20260926 -> EXACT_XNYS_SESSION_BOUNDARIES_V2
cross-version engine/boundary pairs -> VALIDATION_BOUNDARY_POLICY_UNSUPPORTED
unknown engine -> VALIDATION_ENGINE_VERSION_UNSUPPORTED
```

Validation V2 integration:

```text
V2 phase Research IR derivation changes only testPeriod
V2 phase DatasetSeries slicing excludes future rows
V2 child RunInput admission enforces the V2 material/field/metric matrix
V2 child RunInput admission enforces the exact V2 ExecutionConfig matrix
V2 child execution dispatches to historicalExecutionEngineV2
Validation writer persists V1/V2 phases through the existing operation/capability path
```

Scientific isolation correction:

```text
ENGINE_V20260918 executable Research IR fields must use I5A_RESEARCH_IR_FIELD_CONTRACT_V1
ENGINE_V20260926 executable Research IR fields must use I5_RL4_RESEARCH_IR_FIELD_CONTRACT_V2
duplicate DatasetSeries semantic keys (instrumentId, fieldId) fail closed
V2 kernel materials must exactly bind to DatasetSeries payloads
VOLUME provenance absence/unknown provider fails as VOLUME_POINT_IN_TIME_PROVENANCE_UNAVAILABLE
```

## Migration

Path:

```text
supabase/migrations/20260926201750_investing_i5_rl5_engine_v2_admission.sql
```

Historical migrations changed:

```text
NO
```

Exact five constraints changed:

```text
investing.research_execution_runs / research_execution_runs_engine_version_check
investing.research_results_scientific_identities / research_results_scientific_identities_engine_version_check
investing.research_validation_child_results_scientific_identities / research_validation_child_results_scientif_engine_version_check
investing.research_validation_execution_runs / research_validation_execution_runs_engine_version_check
investing.research_validation_run_inputs_scientific_identities / research_validation_run_inputs_scientific__engine_version_check
```

Migration guardrails:

```text
requires current_user = postgres
uses SET LOCAL ROLE investing_owner
asserts exact V1-only prestate
drops exact named constraints without IF EXISTS
recreates exact V1/V2 engine_version checks
asserts exact V1/V2 poststate
```

Other policy/RLS/grant/authority changes:

```text
NONE
```

Production:

```text
NOT APPLIED
```

## Verification Performed

```text
git diff --check = PASS
npx tsc --noEmit = PASS
npm run test -- --reporter=dot = PASS
  Test Files 230 passed / 18 skipped
  Tests 1304 passed / 48 skipped
npm run lint = PASS
  0 errors / 3 pre-existing warnings in tests/investingGenesisI5Rl3cValidationPassport.test.ts
npm run build = PASS with in-process dummy NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  Existing Turbopack dynamic filesystem tracing warning remains
npm run audit:prod = PASS / 0 vulnerabilities
npx vitest run PG17 targeted set --reporter=dot = PASS
  Test Files 6 passed / 1 skipped
  Tests 6 passed / 17 skipped
REAL PG17 REHEARSAL = PENDING INDEPENDENT EXTERNAL GATE
```

PG17 real database note:

```text
The PG17-targeted test command completed successfully, but most physical database
checks skipped in this environment because the suite's PG17 connection gates were
not satisfied. Production migration remains NOT APPLIED.
This is not a Production verification of the RL-5 migration.
```

## Closure State

Known non-closure gaps in the previous draft owner contract are resolved in this
candidate: Validation V2 admission/execution, Passport V2 reconstruction tests,
frozen V2 golden hashes, full suite, lint, build, dependency audit, and
git diff --check have all been executed.

Remaining external acceptance gates:

```text
independent correction review = NOT RECORDED
Production migration apply = NOT APPLIED
post-apply PG17 audit = NOT RUN
canonical state update = NOT PERFORMED
candidate publication = ESTABLISHED BY GIT HISTORY / NOT AN ACCEPTANCE SIGNAL
```

Final state:

```text
RL-5 = NOT ACCEPTED
Production = NOT APPLIED
REAL PG17 REHEARSAL = PENDING INDEPENDENT EXTERNAL GATE
Supabase Production changed = NO
```
