# RL-7 sixth independent audit correction

Status: **BLOCKED**. External state: **RL-7 RECOVERY CANDIDATE / NOT ACCEPTED**.
REAL PG17: **PENDING**. Production: unchanged by this work.

Previous candidate and exact parent of this correction:
`74f7fe1fb3130082353ef66ab2b7d1f78349d913`.
Canonical predecessor: `425c635ba822e8c9c6fe78f673b1889a827b92be`.
The new candidate is the commit containing this correction; the accompanying
local final report records its full hash and the correction/accumulated diffs.

## Changes

- Costs use exact `RESEARCH_VALUATION_SERIES_V2` bytes bound to the accepted
  Result descriptor. The closed schema, canonical numbers/dates, chronological
  order, and monotonic cumulative costs are checked. Final cumulative fee and
  slippage values supply totals. Execution-trace cost observations are removed.
- The engine's metric record constructor supplies the frozen metadata contract
  used by the validator. Unknown keys, invalid status shapes, noncanonical
  values, and malformed metadata/reasons fail closed. The persistence reader
  also verifies exact artifact bytes and canonical metric ordering.
- The source reader consumes the existing authorized Research Passport and its
  RL-3 Validation projection. It verifies materialized experiments, owning
  RunInput payload/hash, successful Results, Result hashes, artifact identities,
  and each neighborhood member's ownership. Parameter proofs are bound to the
  persisted Experiment Parameters identity and resolved IR.
- Validation folds are bound to the accepted aggregate's ordered child and
  RunInput refs, ordinal, phase, and subject. Child payload hashes and exact
  metric bytes are verified. The builder derives IS/OOS observations and OOS
  outcome signs from those records; detached caller observations are removed.
- Reader-issued evidence uses module-private object identity plus a content
  fingerprint, owns its nested data, and rejects copied or modified evidence.
  String discriminators alone confer no authority. The pure kernel unit tests
  explicitly mock this gate; the separate source/writer tests do not.
- The internal writer resolves server authority and rechecks active OWNER,
  principal, and tenant state before mutation. It builds and hashes both objects
  and invokes the existing SQL functions in one transaction, rolling back on
  failure. Arbitrary prepared payloads are not writer inputs.

## Verification

| Check | Result |
| --- | --- |
| Targeted RL-7 + RL-3 passport + Engine V2 golden | 121 passed, 5 PG17 cases skipped |
| Full suite | 252 files passed, 18 skipped; 1,501 tests passed, 62 skipped |
| TypeScript | `npx tsc --noEmit`: passed |
| Lint | Passed; 0 errors, 3 existing RL-3 passport test warnings |
| Build | Passed using the existing CI Clerk publishable-key fallback |
| Full dependency audit | 0 vulnerabilities |
| Production dependency audit | 0 vulnerabilities |
| `git diff --check` | Passed |
| REAL PG17 | PENDING; no local PG17 executable/container runtime or configured reconciliation URL found |
| Production | No connection, migration, deployment, or mutation performed |

The first build attempt lacked a Clerk publishable key and failed during
prerender; the successful build uses the fallback already present in
`.github/workflows/ci.yml`. Next.js-generated `tsconfig.json` edits were restored.
The Engine V2 golden fixture was extracted for reuse without changing its golden
hashes. Source/writer tests use a mock of the existing accepted Passport boundary
and a query adapter; they are not substitutes for PostgreSQL execution. Existing
RL-3 passport tests independently exercise the reused lineage verifier.

## Remaining gate and trust boundary

Fresh real PostgreSQL 17 execution against this exact candidate is required.
Skipped PG17 cases and mocked adapter tests do not establish that result.

`investing_app` retains direct database EXECUTE capability. SQL does not repeat
the TypeScript scientific derivation; a holder of that credential can bypass
the internal writer. The server credential and database adapter remain trusted
infrastructure, not caller authority. This limitation is also documented in the
implementation closure owner contract. `service_role` remains capability, never
authority. No database grants or migrations were altered in this correction.

No PR, push, merge, Production migration, RL-8, RL-9, or Product API/UI/RL-10
orchestration was performed. This candidate is not `CURRENT_ACCEPTED`.
