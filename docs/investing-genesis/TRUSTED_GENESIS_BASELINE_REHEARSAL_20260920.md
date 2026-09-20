# Trusted Genesis Baseline Full Rehearsal - 2026-09-20

Status: `CANDIDATE REHEARSAL EVIDENCE - TRUSTED GENESIS BASELINE - NOT CURRENT_ACCEPTED`

## Purpose

This record captures the first complete post-merge Genesis rehearsal across:

- A. `EXECUTION REHEARSAL`
- B. `CANONICAL INTEGRITY REHEARSAL`
- C. `REPOSITORY CONTROL PLANE REHEARSAL`

It is an evidence slice only. It does not introduce runtime behavior, migrations,
new scientific domains, product features, production Supabase mutation or a
permanent A-number.

Until this rehearsal evidence is independently audited and promoted, the Trusted
Genesis Baseline remains a rehearsal candidate rather than current accepted
authority.

## Baseline Identity

Accepted I5 Research Execution Closure PR:

`#76`

Merged `main` SHA:

`a93dbb9e3c7c548efa8066cc680f64e0d2b05403`

Accepted PR head SHA:

`5a70fa65c19ff8b1511711dad65ec90ef02b9a10`

Canonical predecessor:

`79f4cecbf20d756087defccec3fcbdea8291e7de`

The accepted PR head and merged `main` commit have the exact same Git tree:

`e1bfdd8a67429ff33b4d5d425fba4b68ce688446`

Therefore the PostgreSQL 17 rerun on the accepted PR head exercises byte-identical
repository content to the merged `main` baseline. The squash merge changes
commit identity, not tree content.

## A. Execution Rehearsal

### Main push CI

GitHub Actions CI run:

`35507108244 - SUCCESS`

Exact head SHA:

`a93dbb9e3c7c548efa8066cc680f64e0d2b05403`

Jobs:

- `verify` job `106068681523 - SUCCESS`
- `dependency-audit` job `106068681646 - SUCCESS`

Full suite:

- test files: `212 passed / 17 skipped`
- tests: `1158 passed / 36 skipped`
- lint: `PASS`
- TypeScript: `PASS`
- production build: `PASS`
- full dependency audit: `0 vulnerabilities`
- production dependency audit: `0 vulnerabilities`

The existing Turbopack dynamic-filesystem tracing warning remains a build warning
and did not fail compilation.

### Post-deploy checks on main

Post-deploy smoke:

- `ok = true`
- checks: `7`
- failures: `0`
- warnings: `0`

Trading production audit:

- `ok = true`
- environment: `TEST_DEMO`
- runtime state: `BLOCKED_REBUILD_PENDING`
- failures: `0`
- checks: `4`

The Trading runtime state is recorded but does not become Investing Genesis
authority and is not treated as a Trusted Genesis blocker.

Billing strict audit:

- `ok = true`
- checked: `4`
- fail: `0`
- warn: `1`

The single reported warning is
`metadata_paid_without_stripe_source` on an explicit test/manual-metadata
premium user. It is recorded as product QA evidence and does not alter Investing
Genesis authority. It is not hidden or reclassified as zero warnings.

### PostgreSQL 17 rehearsal

Workflow:

`Investing Supabase Reconciliation PG17`

Run:

`35506819586`

Rehearsal attempt:

`2 - SUCCESS`

Job:

`106069061833 - SUCCESS`

PostgreSQL:

`17.11`

Results:

- static reconciliation contract: `6/6 PASS`
- PostgreSQL 17 reconciliation and current Genesis/I5 replay: `6/6 PASS`
- Experiment Scientific Closure: `3/3 PASS`
- Dataset/Run Scientific Closure: `5/5 PASS`
- Research Execution Closure: `2/2 PASS`

The execution-closure rehearsal includes real PostgreSQL, FORCE RLS,
`investing_app` application transactions, lifecycle enforcement, artifact
content SHA binding, deterministic Result reuse and rollback evidence inherited
from the accepted closure test.

Classification:

`A. EXECUTION REHEARSAL = PASS`

## B. Canonical Integrity Rehearsal

The rehearsal compares current accepted authority rather than treating every
historical sentence as current global state.

Verified current authority:

- `CANONICAL_CURRENT_STATE.md` records I5 Research Execution Closure as
  `CURRENT_ACCEPTED / UNNUMBERED`;
- `I5_RESEARCH_EXECUTION_CLOSURE_OWNER_CONTRACT_V1.md` is the current accepted
  implementation/persistence owner contract;
- `I5A_CANONICAL_HASH_DOMAINS_V1.md` records
  `SYNTRAKE:RESULT:V1 = OWNER_PAYLOAD_EXACT` for the exact accepted Result
  owner payload only;
- the Research Execution Engine Design Freeze remains accepted design authority
  for frozen semantics only; its historical no-runtime/no-Result-activation
  limitation is superseded by the separately accepted Execution Closure;
- Dataset/Run scientific identity remains unchanged by the execution closure;
- Evidence, Passport completion, Paper, Capital Kernel, broker, Live, UI and
  USER_PORTFOLIO/account execution remain outside this acceptance;
- production Supabase migration application remains `NOT PERFORMED`;
- permanent A-number remains `NOT ASSIGNED`.

Historical accepted contracts may describe what was disabled or deferred at the
time those slices were accepted. Those statements are historical scope records,
not competing current authority where the current-state map records a later
narrow supersession.

The canonical hygiene contract is strengthened by this rehearsal candidate to
require the accepted Research Execution Closure owner contract and to pin this
rehearsal evidence without prematurely declaring it current accepted.

Classification:

`B. CANONICAL INTEGRITY REHEARSAL = PASS`

## C. Repository Control Plane Rehearsal

Default branch:

`main`

Current main SHA:

`a93dbb9e3c7c548efa8066cc680f64e0d2b05403`

Main merge commit verification:

`verified = true`

Canonical ruleset:

- name: `Syntrake Canonical Branch Guard`
- ID: `23141231`
- enforcement: `active`
- refs: `main`, `design/i5-research-lab-canonical-20260906`
- deletion blocked
- non-fast-forward blocked
- linear history required
- required checks: `verify`, `dependency-audit`, `Vercel`
- bypass actors: none
- current user bypass: never

Historical archive ruleset:

- name: `Syntrake Historical Archive Guard`
- ID: `23141335`
- enforcement: `active`
- deletion blocked
- non-fast-forward blocked
- bypass actors: none
- current user bypass: never

Historical archive ref remains:

`archive/disconnected-main-pre-control-plane-20260913`

Archived SHA remains exactly:

`67393626c3bd3dbb7c18a4ff7235f9ea06f93e13`

Existing Genesis canonical alias remains:

`design/i5-research-lab-canonical-20260906`

Alias convergence SHA remains:

`216bec5e09bfa81a771048f1d693210942f02368`

Vercel status on merged main:

`SUCCESS`

GitHub required check runs on the merged tree are green.

Classification:

`C. REPOSITORY CONTROL PLANE REHEARSAL = PASS`

## Rehearsal Candidate Verdict

All three rehearsal dimensions are supported by concrete evidence:

`A = PASS`

`B = PASS`

`C = PASS`

Candidate classification:

`TRUSTED GENESIS BASELINE = REHEARSAL_CANDIDATE / NOT CURRENT_ACCEPTED`

Promotion requires:

1. this evidence slice and canonical-hygiene changes to pass CI;
2. no runtime, migration or production mutation in this slice;
3. independent audit of the resulting candidate SHA;
4. a narrow acceptance-only promotion before merge.

## Boundaries

This rehearsal does not establish or complete:

- Evidence Object acceptance;
- Passport completion;
- Evidence Ledger product surface;
- OOS/walk-forward;
- Monte Carlo;
- optimizer;
- Strategy DNA;
- Strategy Autopsy;
- Blind Truth promotion;
- Paper execution;
- Capital Kernel;
- broker integration;
- Live execution;
- UI completion;
- USER_PORTFOLIO/account Research execution.

Production mutation:

`NONE`

Production Supabase migration application:

`NOT PERFORMED`

Permanent A-number:

`NOT ASSIGNED`
