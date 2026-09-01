# Investing Genesis I3-A Implementation Checkpoint

PARENT_I3_DESIGN_FREEZE_SHA =
33dddc730885b9940f3321dfff3d21562d3410a2

I3_A_SOURCE_BRANCH =
feat/investing-genesis-i3-accounting-implementation

I3_A_ACCOUNTING_FOUNDATIONS_SOURCE_PATH =
docs/investing-genesis/sql/I3A_ACCOUNTING_FOUNDATIONS_CANDIDATE.sql

I3_A_ACCOUNTING_FOUNDATIONS_SOURCE_BLOB_AT_STATIC_GATE =
95a9ff9c930d92ce308317cdef032ba0e3f76b8c

I3_A_STATIC_TEST_PATH =
tests/investingGenesisI3AccountingFoundationsCandidate.test.ts

I3_A_STATIC_GATE_SHA =
1e402d845640f1e08a2fa08c3fdc8736307909f1

STATUS = I3_A_SOURCE_CANDIDATE_STATIC_PASS_NOT_FROZEN

## Scope

This checkpoint records source-only implementation work. It is not a database
migration receipt and it is not runtime proof.

No I3 DDL/DML has been applied to Supabase under this slice.

No I3 runtime grant or RLS policy has been activated.

No merge or production deployment is authorized by this record.

## Exact Source Diff At Static Gate

```text
base = 33dddc730885b9940f3321dfff3d21562d3410a2
head = 1e402d845640f1e08a2fa08c3fdc8736307909f1
merge_base = 33dddc730885b9940f3321dfff3d21562d3410a2
behind_by = 0
ahead_by = 3
```

Changed files at that gate:

1. `docs/investing-genesis/sql/I3A_ACCOUNTING_FOUNDATIONS_CANDIDATE.sql`
2. `tests/investingGenesisI3AccountingFoundationsCandidate.test.ts`

There were no runtime implementation-file changes and no file under
`supabase/migrations` in that diff.

## Static Gate Result

The new I3-A static contract test passed all 12 tests.

Repository test totals at the gate:

```text
Test Files: 4 failed | 162 passed | 15 skipped (181)
Tests:      6 failed | 691 passed | 22 skipped (719)
```

The six failures are the same pre-existing baseline failures present at the I3
Design freeze parent:

1. `tests/paperRunnerConcurrency.test.ts` — missing mocked
   `reconcileCanonicalPaperTradeRuns` export;
2. `tests/paperSignalExecutionContract.test.ts` — three failures with the same
   missing mocked export;
3. `tests/tradingMarketDataBackfill.test.ts` — expected `1`, received `11`;
4. `tests/tradingResearchRuntimeHealth.test.ts` — expected canonical task id,
   received `null`.

Therefore:

```text
I3_A_STATIC_TEST = PASS
NEW_TEST_FAILURES_VS_I3_DESIGN_FREEZE = 0
CI_DELTA_GATE = PASS
CI_ABSOLUTE_STATE = FAILURE (PRE-EXISTING BASELINE)
DEPENDENCY_AUDIT = PASS
```

The absolute CI state must not be represented as green.

## What The Current Source Candidate Establishes

The source candidate defines a closed, runtime-inaccessible accounting
foundation for the initial I3 internal paper-accounting capability:

- synthetic-only internal Instrument identity for rehearsal;
- persistent account+currency and account+instrument mutex rows;
- one immutable accounting genesis anchor per account;
- immutable Fill economic events;
- one immutable acquisition lot origin per BUY;
- immutable, versioned FIFO accounting revisions for SELL;
- immutable lot-consumption allocations;
- exactly one immutable seal per accounting revision;
- deterministic economic ordering evidence using effective time plus stable
  source sequence/reference rather than random UUID arrival;
- bounded `NUMERIC(28,8)` quantity and `NUMERIC(24,8)` money persistence;
- no implicit FX and no implicit arithmetic rounding in V1;
- SIMULATED / DEMO truth labels for synthetic rehearsal rows;
- no Position truth table; Position remains derived;
- no runtime grants or I3 RLS policies in this slice.

The candidate also extends the source-level idempotency vocabulary with
`I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1`, but that vocabulary has not been
applied to a real database.

## Material Promotion Blockers

### 1. Fail-closed I3 routine prestate is incomplete

The current candidate fails closed when pre-existing `investing.i3_%` tables
exist, but it does not yet fail closed on pre-existing I3-named routines.

The three canonical decimal validators currently use `CREATE OR REPLACE
FUNCTION`. Before this source can become a migration, the consolidated
candidate must:

- reject unexpected pre-existing `investing.i3_%` routines before mutation;
- use creation semantics that cannot silently overwrite stale I3 behavior;
- postcondition-check the exact expected I3 routine inventory and ownership.

This is a source defect for migration promotion, even though no live database
has been touched.

### 2. Canonical decimal validators should fail closed on NULL

The current text validators are intended for non-null writer inputs but return
SQL `NULL` when passed SQL `NULL`.

The promoted implementation must make the contract explicit:

```text
NULL decimal text -> false / validation failure
```

No writer may treat SQL NULL, JavaScript `number`, exponent notation, locale
notation, or implicit rounding as accepted financial truth.

### 3. Cross-SELL cumulative lot availability/FIFO is not yet DB-proven

The current foundation validates allocation shape inside one accounting
revision. It does not by itself prove that two different SELL fills cannot
consume the same remaining lot quantity.

That invariant requires the later writer/concurrency slice to hold the
canonical `(tenant_id, account_id, instrument_id)` accounting mutex and then,
under that lock, derive open lot quantity from the accepted canonical revision
lineage before creating a SELL revision.

Required later acceptance proof:

```text
same account + instrument
same canonical open-lot state
session A SELL + session B SELL concurrently
=> both converge on the same persisted instrument mutex row
=> only one evaluates/commits against each serialized state at a time
=> total accepted disposal quantity never exceeds canonical open quantity
=> FIFO lot ordering is preserved across prior accepted SELL fills
```

A static trigger body or idempotency lock is not sufficient proof.
Actual PostgreSQL locking under the real runtime role, ACL and FORCE RLS is
mandatory.

## Deliberately Not Implemented In I3-A

The following are not omissions to be silently filled by callers. They are
closed later slices:

- I2 ledger account/type extension for securities book cost, trading fees,
  realized gain/loss and dividend income;
- BUY/SELL canonical I2 ledger posting shapes;
- atomic Fill + lot/revision + ledger effect writer;
- runtime `investing_app` I3 SELECT/INSERT/lock ACL surface;
- exact I3 RLS policies;
- race-safe mutex creation + real `SELECT ... FOR UPDATE` proof;
- cash sufficiency and no-negative-cash enforcement against canonical I2 ledger;
- cross-SELL open-lot sufficiency/FIFO enforcement;
- current-market valuation and unrealized PnL;
- FX;
- corporate-action ingestion;
- dividend ingestion;
- production product Fill producer.

## Migration Naming / Promotion Boundary

The repository source must not fabricate a Supabase migration timestamp.

The current environment did not provide a Supabase CLI capable of running the
canonical `supabase migration new ...` workflow, so this slice deliberately
keeps the SQL under `docs/investing-genesis/sql/`.

Promotion into `supabase/migrations/<generated-version>_...sql` is a separate
source action after the material source blockers above are closed and a
legitimate migration version is generated.

Promotion to a migration file is still not permission to apply it to Supabase.
Database application requires separate explicit authorization and independent
PostgreSQL rehearsal/audit.

## External State

```text
I3_SUPABASE_INSPECTION = NONE IN THIS IMPLEMENTATION SLICE
I3_SUPABASE_MUTATION = NONE
I3_PRODUCTION_MUTATION = NONE
I3_MERGE = NONE
```

GitHub pushes on the implementation branch can trigger the repository's existing
Vercel preview integration automatically. A preview status is not accounting or
PostgreSQL correctness proof and must not be treated as such.

## Decision

```text
I3_A_SOURCE_CANDIDATE = STATIC PASS / NOT FROZEN
I3_A_POSTGRESQL_EXECUTION = NOT RUN
I3_A_MIGRATION = NOT CREATED
I3_A_SUPABASE_APPLY = NOT AUTHORIZED / NOT PERFORMED
I3_A_RUNTIME = NOT ENABLED
I3_B_LEDGER_EXTENSION = NOT YET ACCEPTED
I3_C_ATOMIC_WRITER = NOT YET ACCEPTED
```

No later slice may use this checkpoint to claim that holdings, cash, realized
PnL, FIFO correctness or concurrency correctness have been proven in a real
database.
