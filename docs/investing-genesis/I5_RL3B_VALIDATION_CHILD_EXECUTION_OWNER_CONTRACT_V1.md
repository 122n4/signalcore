# Syntrake Investing Genesis I5 RL-3B - Validation Child Execution Owner Contract V1

State: `CURRENT_ACCEPTED / RL-3B_VALIDATION_CHILD_EXECUTION / UNNUMBERED`

This contract defines the RL-3B accepted boundary for executing and persisting
Validation child phases. It does not accept complete RL-3.

## Purpose

RL-3A admits a deterministic Validation Protocol, folds, phase windows,
no-lookahead DatasetSeries prefix slicing and phase Research IR derivation.
RL-3B adds child phase execution and persistence for those exact folds.

`SYNTRAKE:RUN_INPUT:V1` cannot be reused for validation phases because accepted
RunInput admission requires `RunInput.researchIr == Experiment.researchIr`.
A validation phase changes only `ResearchIr.testPeriod`, so it needs a separate
owner identity rather than weakening the existing invariant.

## Scientific Domains

RL-3B activates exactly:

- `SYNTRAKE:VALIDATION_RUN_INPUT:V1 = OWNER_PAYLOAD_EXACT`;
- `SYNTRAKE:VALIDATION_CHILD_RESULT:V1 = OWNER_PAYLOAD_EXACT`.

`SYNTRAKE:VALIDATION_PROTOCOL:V1 = OWNER_PAYLOAD_EXACT` remains the RL-3A
accepted protocol domain.

RL-3B does not activate `SYNTRAKE:VALIDATION_RESULT:V1`, Validation Evidence,
promotion, robustness or Blind Truth domains.

## Training And Evaluation Semantics

`TRAINING` means executing the same frozen Experiment strategy over the training
window for comparable historical evidence. It is not fitting, optimization,
parameter search, ML training or winner selection.

`EVALUATION` executes the same frozen strategy over the evaluation window.
Every phase starts independently from the Research IR `startingCapital`. No
cash, positions, NAV or state move from TRAINING to EVALUATION or between
folds.

## No-Lookahead Material

The provider supplies source DatasetSeries material. RL-3B derives phase
DatasetSeries material in memory using the RL-3A prefix rule.

Rows after `phaseWindow.endDate` are forbidden from the phase material. Source
material corruption, missing phase-end rows, wrong source DatasetSnapshot or
wrong phase DatasetSnapshot fail closed.

## Kernel Reuse

RL-3B reuses the accepted deterministic V1 historical execution kernel from
`historicalExecutionEngine.ts`. The kernel does not create Result, RunInput,
database IDs or timestamps. `executeHistoricalBacktestV1()` remains the V1
wrapper that builds `RESULT_HASH_PAYLOAD_V1`; Validation child execution builds
`VALIDATION_CHILD_RESULT_HASH_PAYLOAD_V1`.

No V1 historical golden hash may change.

## Persistence

Accepted migration in canonical Git lineage:

`20260923090000_investing_i5_rl3b_validation_child_execution.sql`

It introduces:

- `research_validation_protocols_scientific_identities`;
- `research_validation_run_inputs_scientific_identities`;
- `research_validation_execution_runs`;
- `research_validation_execution_run_events`;
- `research_validation_result_artifacts`;
- `research_validation_child_results_scientific_identities`.

Events, artifacts and child results are append-only. No aggregate Validation
Result is persisted in RL-3B.

## Authority

RL-3B uses exact tenant-scope PURE_RESEARCH operations:

- `RESEARCH_VALIDATION_PROTOCOL_CREATE_V1 / RESEARCH_MUTATE`;
- `RESEARCH_VALIDATION_CHILD_EXECUTE_V1 / RESEARCH_EXECUTE`.

Account scope, `USER_PORTFOLIO`, service role authorization and client-supplied
authority are outside the contract.

## Idempotency And Concurrency

The exact Validation Protocol hash plus fold ordinal and phase determine one
Validation Run Input identity. If the exact Child Result already exists, replay
returns success without re-executing. Divergent canonical payload for the same
logical key is conflict.

## Out Of Scope

RL-3B does not implement aggregate Validation Result, aggregate PASS/FAIL,
thresholds, promotion eligibility, Passport validation projection, robustness,
overfit classification, Experiment comparison, parameter fitting, optimization,
Engine V2, Metric Registry V2, Blind Truth, UI/API, Core, Trading, Paper,
broker, Live, Capital Kernel, Monte Carlo, Scenario or Stress.

## Production Application State

At initial RL-3B acceptance time, the migration had not been applied to Supabase Production.
That historical limitation is superseded by the authorized A4 -> RL-3B
production catch-up recorded here.

The accepted RL-3B migration
`20260923090000_investing_i5_rl3b_validation_child_execution.sql` is applied in
Supabase Production.

Production application occurred after explicit authorization as part of the
A4 -> RL-3B production catch-up. Migration history remained consistent through
`20260923090000 investing_i5_rl3b_validation_child_execution`, with no
unexpected migrations, and the independent post-apply audit passed.

This production application does not broaden this contract's functional
boundary. Complete RL-3, RL-3C, aggregate Validation Result, promotion, Blind
Truth and the other out-of-scope surfaces above remain outside RL-3B acceptance.
