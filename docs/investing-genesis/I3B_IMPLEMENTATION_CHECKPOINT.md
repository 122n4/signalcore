# Investing Genesis I3-B Implementation Checkpoint

## Canonical lineage

```text
I3 design freeze
33dddc730885b9940f3321dfff3d21562d3410a2

Implementation branch
feat/investing-genesis-i3-accounting-implementation
```

This checkpoint records repository/static truth only. It does **not** claim that
I3-B has been applied to Supabase or proven behaviorally on PostgreSQL.

## Candidate history

### V1 — REJECTED

```text
commit
5d2308c13e34448942f2bd915f1ec36fc52f05ff

file
docs/investing-genesis/sql/I3B_LEDGER_VOCABULARY_CANDIDATE.sql
```

Reason: widening `ledger_accounts` vocabulary before simultaneously narrowing
the existing I2 `ledger_accounts` runtime policy would broaden the already-
granted `INITIAL_PAPER_CASH_FUNDING / LEDGER_WRITE` insert surface.

### V2 — REJECTED

```text
commit
6f18a99d3dee7692c4d81179e488985fd1fd1291

file
docs/investing-genesis/sql/I3B_LEDGER_LINEAGE_CANDIDATE_V2.sql
```

Reason: the V2 foreign keys proved scope identity but did not prove that an I3
BUY/SELL ledger transaction matched the exact canonical Fill economic/material
lineage. In particular, schema lineage could still pair the wrong Fill side or
a different idempotency/material/source/correlation tuple.

### V3 — CURRENT SOURCE CANDIDATE

```text
source commit
b811906b98e307ec7fb6f67dd73a49452c7505b1

test commit / static-gate head
20e830a3f18440ac56fa8165e78e1864102e7f9d

file
docs/investing-genesis/sql/I3B_LEDGER_LINEAGE_CANDIDATE_V3.sql

test
tests/investingGenesisI3LedgerLineageCandidate.test.ts
```

## V3 scope

V3 deliberately does **not** make I3 trades runnable.

It adds only:

- nullable `i3_fill_id`, `i3_instrument_id`, and
  `i3_accounting_revision_id` lineage on `investing.ledger_transactions`;
- closed transaction operation/kind/source/context vocabulary for controlled
  `DEMO / SIMULATED` I3 paper accounting;
- exact Fill and AccountingRevision foreign keys;
- semantic uniqueness of one I3 ledger transaction per canonical Fill;
- a SECURITY INVOKER trigger guard that validates:
  - BUY ledger kind -> canonical Fill side BUY;
  - SELL ledger kind -> canonical Fill side SELL;
  - exact idempotency, authority identity, operation, correlation,
    material hash, effective time, source/reference and truth dimensions;
  - initial SELL references the sealed root AccountingRevision for that SELL;
- pre/postconditions pinning the existing I2 policy and ACL surface.

V3 deliberately leaves unchanged:

```text
ledger_accounts vocabulary           I2 ONLY
ledger table RLS policies             I2 ONLY
investing_app ledger privileges       SELECT + INSERT only
I3 ledger RLS policies                NONE
i2_ledger_seal_guard                  I2 ONLY
I3 posting-shape validation           NONE
I3 mutex lock runtime                 NONE
I3 atomic trade writer                NONE
```

Therefore an I3 BUY/SELL still has no accepted runtime path and cannot pass the
current I2-only seal contract.

## Static gate

GitHub Actions run:

```text
run_id
33475337208

head
20e830a3f18440ac56fa8165e78e1864102e7f9d
```

New I3-B test:

```text
investingGenesisI3LedgerLineageCandidate.test.ts
12 / 12 PASS
```

I3-A tests also remained:

```text
investingGenesisI3AccountingFoundationsCandidate.test.ts
12 / 12 PASS
```

Full Vitest result at the I3-B V3 static-gate head:

```text
Test Files   4 failed | 163 passed | 15 skipped   (182)
Tests        6 failed | 703 passed | 22 skipped   (731)
```

The six failures are the exact historical baseline signatures already present
before I3-B:

1. `paperRunnerConcurrency.test.ts`
   - `returns lock_busy and skips persistence when another cycle holds the lease`
   - existing missing `reconcileCanonicalPaperTradeRuns` mock export.
2. `paperSignalExecutionContract.test.ts`
   - three existing failures from the same missing mock export.
3. `tradingMarketDataBackfill.test.ts`
   - existing `missingDownloadable` assertion (`11` vs `1`).
4. `tradingResearchRuntimeHealth.test.ts`
   - existing `taskId` assertion (`null` vs `task-runtime-canonical`).

Therefore:

```text
I3_B_V3_NEW_FAILURES = 0
CI_DELTA_GATE = PASS
```

The absolute GitHub `verify` job remains `FAILURE` because the baseline remains
red. This checkpoint does not mislabel the absolute CI as green.

Dependency audit for the same run:

```text
dependency-audit = SUCCESS
```

GitHub commit status showed the automatic Vercel preview as:

```text
Vercel = success
```

No Production promotion/deploy was performed by this implementation work.

## Current canonical status

```text
I3-B V1                         REJECTED
I3-B V2                         REJECTED
I3-B V3 source                  STATIC PASS
I3-B V3 static tests            12/12 PASS
CI delta                        PASS / 0 new failures
Absolute CI                     FAIL / historical baseline only
Dependency audit                PASS
Vercel preview                  SUCCESS

I3-B PostgreSQL syntax/apply    NOT PROVEN
I3-B behavioral rehearsal       NOT EXECUTED
I3-B actual investing_app       NOT EXECUTED
I3-B Supabase migration         NOT CREATED/APPLIED
I3-B Production                 UNTOUCHED
I3-B merge                      NONE
I3-B frozen                     NO
```

## Why I3-B is not frozen

Static/string tests prove repository intent, not PostgreSQL behavior.

Before freeze, the exact candidate must be promoted through an authorized
migration-generation path and rehearsed on PostgreSQL 17 with the accepted I3-A
schema present. At minimum the rehearsal must prove:

- candidate applies and all pre/postconditions commit;
- canonical I2 funding still succeeds unchanged;
- I3 transaction insert remains inaccessible under the old I2 runtime context;
- wrong Fill side is rejected;
- wrong idempotency/material/source/correlation linkage is rejected;
- SELL linked to a non-root or unsealed AccountingRevision is rejected;
- one Fill cannot receive two I3 ledger transactions;
- I2 seal guard remains I2-only;
- no ledger account vocabulary or runtime ACL/RLS widening occurred;
- rollback leaves no synthetic residue.

No Supabase DDL/DML, migration apply, Production deploy, merge, or destructive
change is authorized by this checkpoint.

## Next implementation boundary

Do **not** start a runnable I3 trade path by incrementally widening unrelated
pieces.

The next runtime-bearing slice, I3-C, must design and audit together:

1. the new ledger account types and exact semantics;
2. a narrowed I2 funding `ledger_accounts` policy that cannot create I3 account
   types;
3. explicit I3 ledger read/insert/lock policies;
4. canonical cash/instrument mutex lock capability under actual
   `investing_app` + FORCE RLS;
5. BUY/SELL posting-shape validation;
6. no-overspend / no-oversell DB integrity under the mutex locks;
7. atomic writer ordering across authority, idempotency, mutexes, Fill/lot/
   revision, ledger and audit;
8. two-session PostgreSQL regressions for write-skew and lock behavior.

Until those are implemented and rehearsed together:

```text
I3_PRODUCT_FILL_PRODUCER = UNAVAILABLE
I3_TRADE_RUNTIME = BLOCKED
```
