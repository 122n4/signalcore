# Investing Genesis I3 Accounting Design Freeze

PARENT_I2_FROZEN_SHA =
af5feb8f4e62659adad0784b4dcab2c6eb6698b9

I3_DESIGN_CORE_COMMIT_SHA =
6acabcaddf3135138c8194a84dd7d9798a133923

I3_DESIGN_CORE_BLOB_SHA =
c8c67ba9541cc99ba296b6ac018d2fc02572733c

I3_DESIGN_CORE_PATH =
docs/investing-genesis/I3_ACCOUNTING_DESIGN.md

STATUS = I3_DESIGN_FREEZE_RECORD

This file is the independent acceptance record and normative addendum for the
I3 design core pinned above.

The frozen I3 design is the exact pair:

1. `I3_ACCOUNTING_DESIGN.md` at blob
   `c8c67ba9541cc99ba296b6ac018d2fc02572733c`, produced by commit
   `6acabcaddf3135138c8194a84dd7d9798a133923`;
2. this freeze record at its exact accepted freeze commit/blob.

No later edit to the same path inherits this freeze automatically.

## Independent Audit Result

The design was reviewed independently after its first candidate was rejected.

The first candidate had material defects and was not accepted. The hardened core
at `6acabcaddf3135138c8194a84dd7d9798a133923` corrected those defects by adding,
among other things:

- cash-only / no-margin / no-negative-cash semantics;
- account+currency and account+instrument persisted mutex scopes;
- a mandatory real PostgreSQL ACL + FORCE RLS `SELECT ... FOR UPDATE` gate;
- separation of immutable economic Fill truth from AccountingRevision outputs;
- deterministic semantic uniqueness for fill, lot-origin, lot allocation, and
  account corporate-action application;
- exact V1 BUY/SELL I2 ledger posting shapes;
- DB-enforced overspend and oversell requirements;
- real two-session concurrency acceptance tests;
- explicit product producer and trusted instrument/corporate-action authority
  boundaries.

No implementation/schema/runtime behavior is inferred from this design audit.

## Normative Amendment A — Corporate Action Semantic Identity

The design core section that includes `action_type` in stable external corporate
action semantic identity is superseded by this rule.

When the external source provides a stable action identifier:

```text
CORPORATE_ACTION_ECONOMIC_IDENTITY =
instrument_id
source
source_reference
```

`action_type` is MATERIAL, not identity.

Therefore:

- same identity + same canonical material -> exact replay;
- same identity + changed `action_type`, terms, dates, ratio, amount, currency,
  or other material field -> CONFLICT unless an explicit immutable source
  correction/supersession event is used;
- changing action type must never create a second independent canonical action
  merely because the type string changed.

If a source does not provide a stable unique action identifier, implementation
must define and independently audit a stronger source-specific semantic identity
before ingestion is permitted. It must not silently synthesize identity from
mutable economic terms.

## Normative Amendment B — Account Corporate Action Application Identity

For the initial simple I3 corporate-action capability, exactly one canonical
account application exists per action/account:

```text
CORPORATE_ACTION_ACCOUNT_APPLICATION_IDENTITY =
corporate_action_id
tenant_id
account_id
```

`application_kind` is MATERIAL for V1, not an identity escape hatch.

Same identity + changed application kind/material -> CONFLICT or explicit
correction path, never a duplicate effect.

If a future complex corporate action legitimately has multiple independently
applicable components, that later design must introduce a stable canonical
component identity. It may not obtain multiplicity by accepting arbitrary
`application_kind` values.

## Normative Amendment C — Mutex Row Lifecycle And Creation Race

A persisted mutex can serialize financial writers only if every competing
transaction converges on and locks the same canonical row.

Therefore an I3 implementation must guarantee, before reading financial state
whose correctness depends on that mutex:

```text
1. canonical mutex semantic key is DB-unique;
2. a canonical mutex row for that key exists or is created race-safely;
3. concurrent creators converge on the same canonical row;
4. the transaction obtains the required row lock on that canonical row;
5. only after the lock is held may it evaluate cash/lot state and create a
   financial effect.
```

Forbidden:

- `SELECT ... FOR UPDATE` returning zero rows followed by financial work;
- check-then-insert mutex creation without DB semantic uniqueness;
- per-request random mutex IDs;
- client-provided mutex identity as authority;
- advisory lock as the sole correctness mechanism;
- a mutex table containing mutable cash, quantity, PnL, ownership, or other
  financial truth.

Implementation may use pre-materialization or transactional insert/converge/lock
semantics, but the exact SQL is not frozen here. The real PostgreSQL gate must
prove the chosen mechanism with actual independent sessions.

Required race regression:

```text
mutex row initially absent
session A and session B target the same semantic scope concurrently
=> exactly one canonical mutex semantic row
=> both operations converge on it
=> financial critical sections serialize
=> no overspend / overconsume write-skew
```

Cleanup/garbage-collection of mutex rows is NOT_AUTHORIZED by this design unless
a later proof shows deletion cannot reopen an ABA-style synchronization race.
Permanent tiny synchronization rows are preferable to unsafe lifecycle cleanup.

## Frozen Financial And Accounting Invariants

The accepted I3 design requires all of the following:

- Investing and Trading remain isolated.
- Position is derived, never the sole mutable financial authority.
- Cash authority remains the I2 ledger.
- Fill economic events are immutable and revision-independent.
- Acquisition lot origins are immutable.
- Lot allocations/transformations are immutable accounting-revision outputs.
- Missing or incomplete holdings/cash evidence is UNAVAILABLE, never zero.
- KNOWN_ZERO requires complete canonical baseline and event evidence.
- Financial decimals use decimal strings at the application boundary and bounded
  PostgreSQL NUMERIC persistence with explicit precision/rounding policy.
- V1 is LONG_ONLY, CASH_ONLY, MARGIN=FALSE, NEGATIVE_CASH=FORBIDDEN.
- BUY must fail closed on unavailable or insufficient canonical I2 cash.
- SELL must fail closed on insufficient canonical open quantity.
- Different idempotency keys cannot bypass economic semantic uniqueness.
- Concurrency correctness uses persisted canonical synchronization rows and
  real DB locking, not only idempotency locks.
- Actual `investing_app` lock capability through ACL + FORCE RLS must be proven
  in PostgreSQL; function text alone is not proof.
- I3 cash-affecting events and their required I2 ledger effects are atomic in
  the immediate-paper V1 capability.
- BUY/SELL ledger posting shapes pinned by the design core are canonical V1
  economics and may not be silently changed during implementation.
- Corporate action/instrument ingestion remains blocked until a trusted,
  Constitution-compliant domain authority path is accepted.
- Fill price is not current market truth; missing valuation evidence remains
  UNAVAILABLE.
- No implicit FX, implicit rounding, guessed cash-in-lieu, assumed fee zero, or
  fabricated financial truth.
- Corrections/reversals preserve immutable history and lineage.

## Exact Source Diff Audit

For the design core candidate:

```text
base = af5feb8f4e62659adad0784b4dcab2c6eb6698b9
head = 6acabcaddf3135138c8194a84dd7d9798a133923
merge_base = af5feb8f4e62659adad0784b4dcab2c6eb6698b9
behind_by = 0
ahead_by = 2
changed implementation files = 0
changed migration files = 0
added design file = docs/investing-genesis/I3_ACCOUNTING_DESIGN.md
```

The branch was deliberately based on the accepted I2 SHA, not the stale default
`main` branch.

## Exact CI Baseline Comparison

Baseline SHA:

`af5feb8f4e62659adad0784b4dcab2c6eb6698b9`

Baseline verify result:

```text
Test Files: 4 failed | 161 passed | 15 skipped (180)
Tests:      6 failed | 679 passed | 22 skipped (707)
```

Baseline failing test set:

1. `tests/paperRunnerConcurrency.test.ts` — 1 failure;
2. `tests/paperSignalExecutionContract.test.ts` — 3 failures;
3. `tests/tradingMarketDataBackfill.test.ts` — 1 failure;
4. `tests/tradingResearchRuntimeHealth.test.ts` — 1 failure.

These failures are pre-existing Trading/paper baseline failures. They are not
silently treated as PASS and are not fixed inside I3 design scope.

I3 design core SHA:

`6acabcaddf3135138c8194a84dd7d9798a133923`

Its verify result was exactly:

```text
Test Files: 4 failed | 161 passed | 15 skipped (180)
Tests:      6 failed | 679 passed | 22 skipped (707)
```

The failing test names and failure signatures matched the baseline set above.
The separate dependency-audit job succeeded at both the baseline and I3 core
candidate.

Therefore for the I3 core candidate:

```text
NEW_TEST_FAILURES_VS_EXACT_BASELINE = 0
CI_ABSOLUTE_STATE = FAILURE (PRE-EXISTING BASELINE)
CI_DELTA_GATE = PASS
```

The freeze-record commit itself must also be compared against this exact
baseline before this freeze is considered complete.

## External State Boundary

During source-only design work, the repository's existing GitHub→Vercel
integration automatically created preview deployments on branch pushes.

For the I3 design core SHA `6acabcaddf3135138c8194a84dd7d9798a133923`,
GitHub reported the Vercel status as `success` after the automatic preview.

Classification:

```text
VERCEL_PREVIEW_DEPLOY = REAL / AUTO-TRIGGERED
VERCEL_PRODUCTION_DEPLOY_BY_ASSISTANT = NONE
VERCEL_MUTATION_INVOKED_BY_ASSISTANT = NONE
```

Preview deployment success is not I3 financial/runtime proof and is not an
acceptance criterion for accounting correctness.

Supabase was not inspected or mutated under this I3 design authorization:

```text
I3_SUPABASE_RUNTIME_STATE = UNAVAILABLE / NOT_INSPECTED_IN_THIS_SLICE
I3_SUPABASE_MUTATION_BY_ASSISTANT = NONE
```

## Freeze Decision

This record freezes DESIGN ONLY after its own exact CI delta is independently
verified as introducing no new failure.

It does not authorize implementation.

```text
I3_DESIGN = FROZEN only when this freeze commit passes CI_DELTA_GATE
I3_IMPLEMENTATION = NOT_AUTHORIZED
I3_SCHEMA = NOT_AUTHORIZED
I3_MIGRATION = NOT_AUTHORIZED
I3_SUPABASE_CHANGE = NOT_AUTHORIZED
I3_PRODUCTION = NOT_AUTHORIZED
I3_MERGE = NOT_AUTHORIZED
```

Any future implementation slice must start from the exact accepted I3 design
lineage and must be audited independently before schema/runtime mutation.
