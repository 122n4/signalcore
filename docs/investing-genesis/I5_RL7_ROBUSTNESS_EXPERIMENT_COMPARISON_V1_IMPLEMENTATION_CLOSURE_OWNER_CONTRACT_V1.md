# I5 RL-7 Robustness And Experiment Comparison V1 Implementation Closure Owner Contract

Status: CURRENT ACCEPTED OWNER CONTRACT - RL-7 ROBUSTNESS AND EXPERIMENT COMPARISON V1 IMPLEMENTATION CLOSURE - UNNUMBERED

Classification:
`CURRENT_ACCEPTED / RL-7_ROBUSTNESS_EXPERIMENT_COMPARISON_V1_IMPLEMENTATION_CLOSURE / UNNUMBERED`

Trust-recovery predecessor:
`425c635ba822e8c9c6fe78f673b1889a827b92be`

Historical design predecessor:
`f21371b9d0cbf79773c198d0dd34b512a7eab46b`

Historical design PR:
`#104`

Historical design merge/main anchor:
`24abdcf46e6c695e2f1e2f0b53d4f758531f6c17`

Historical implementation PR:
`#105`

Historical implementation final candidate:
`6cfd148cba970d81bbd3f32a2435f4994a242847`

Historical implementation merge/main anchor:
`05b4192557e8e2c22f63769774a1ca2985199e62`

Historical implementation candidate/merge tree:
`cc12b1619e014d3deb566d303f878e99c04aef0c`

Tree equality:
`PASS`

Runtime implementation:
`PRESENT / CURRENT ACCEPTED`

Production migration:
`APPLIED / POST-APPLY AUDITED`

Supabase Production:
`RL-7 MIGRATIONS APPLIED / POST-APPLY AUDITED`

Permanent A-number:
`NOT ASSIGNED`

## Purpose

This owner contract closes the trust gap left by the historical RL-7 sequence.
The design and implementation code were merged into Git, but the design document
remained intentionally marked `CANDIDATE / NOT ACCEPTED` and no dedicated
implementation owner contract or canonical acceptance state was created.

A Git merge is not acceptance authority. This closure therefore audits the
actual merged runtime, persistence and test evidence and establishes current
authority without rewriting the historical design-slice facts.

The historical design document remains evidence of what that design-only slice
claimed at the time. This contract records the final canonical acceptance sync after independent
audit, merge to main, CI/PG17 success, Production migration application and
post-apply audit. It is current acceptance authority for RL-7.

## Current Accepted Scope

RL-7 owns deterministic robustness and BASELINE/VARIANT experiment-comparison
scientific evidence only.

Current accepted runtime surfaces:

- `lib/investing/research/experimentComparison.ts`;
- `lib/investing/research/experimentComparisonEvidence.ts`;
- `lib/investing/research/experimentComparisonStability.ts`;
- `lib/investing/research/experimentComparisonAggregate.ts`;
- `lib/investing/research/experimentComparisonClassification.ts`;
- `lib/investing/research/experimentComparisonBuilder.ts`;
- `lib/investing/research/experimentComparisonResult.ts`;
- RL-7 exports from `lib/investing/research/index.ts`;
- RL-7 scientific-domain admission in `lib/investing/research/canonical.ts`.

Current accepted scientific domains:

- `SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1 = OWNER_PAYLOAD_EXACT`;
- `SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1 = OWNER_PAYLOAD_EXACT`.

The protocol and result payloads are closed, deterministic and domain-separated.
No undocumented composite score is scientific authority.

`buildExperimentComparisonResultV1` is the current accepted closure's pure
authoritative derivation kernel. It consumes verified canonical evidence and
derives lineage compatibility, parameter deltas, scientific-input deltas,
exact metric deltas, validation/fold/neighborhood/cost/concentration evidence,
fail-closed state and robustness classification before strict canonicalization
and hashing. Caller-provided deltas, compatibility conclusions, PASS/FAIL
labels or classification claims are not scientific authority.

## Deterministic Robustness Semantics

The current accepted `ROBUSTNESS_COMPARISON_POLICY_V20260927` freezes:

- exact parameter delta;
- exact scientific-input delta;
- exact Metric Registry V2 metric deltas;
- IS/OOS and walk-forward fold evidence;
- rational-only fold stability;
- exact drawdown, turnover and cost evidence where available;
- explicit parameter-neighborhood sensitivity;
- event-count and fold-direction concentration diagnostics;
- deterministic fail-closed classification.

The accepted scientific classifications remain:

- `ROBUSTNESS_STABLE`;
- `ROBUSTNESS_MIXED`;
- `ROBUSTNESS_DEGRADED`;
- `ROBUSTNESS_UNSTABLE`;
- `ROBUSTNESS_INSUFFICIENT_EVIDENCE`.

Missing, incompatible, corrupt or unauthorized evidence is not converted to zero
and does not become a fabricated scientific result.

## Persistence Authority

The accepted cumulative RL-7 Production migration set is:

- `20260928080318_investing_i5_rl7_experiment_comparison_v1.sql`;
- `20260928090809_investing_i5_rl7_experiment_comparison_persistence_closure.sql`;
- `20261001090000_investing_i5_rl7_remove_redundant_row_locks.sql`;
- `20261002202439_investing_i5_rl7_preproduction_function_search_path.sql`.

These migrations establish append-only protocol/result scientific identities,
RLS + FORCE RLS, minimal table grants and internal persistence functions.
`20261001090000` is the accepted Git correction to the RL-7 persistence
functions: it removes redundant row-lock/UPDATE-privilege requirements while
retaining advisory transaction locking, unique-constraint conflict protection,
append-only behavior and `SECURITY INVOKER` semantics. It is part of the
cumulative RL-7 migration set now applied and aligned in Production.
`20261002202439` is a pre-production Security Advisor remediation. It fixes
the deterministic function `search_path` for the append-only trigger function
and both persistence functions by setting `search_path=pg_catalog`. It does not
change persistence logic, authority semantics, grants, RLS, table structure or
payload contracts.

The accepted internal functions are:

- `investing.persist_research_experiment_comparison_protocol_v1(text,text,jsonb)`;
- `investing.finalize_research_experiment_comparison_result_v1(uuid,text,jsonb)`.

Both are `SECURITY INVOKER`. PUBLIC, `anon`, `authenticated` and
`service_role` do not receive execution authority. `investing_app` executes
inside the existing server-authorized Investing context.

Tenant, principal, membership and Investigation authority are bound to the
database context and preserved by composite constraints/RLS. A client-supplied
protocol UUID is not authority and cannot cross the accepted authority tuple.

Protocol/result reuse is exact and deterministic:

- byte/identity-equivalent retry -> `REUSED_IDENTICAL`;
- divergent same logical identity -> conflict;
- advisory transaction locks serialize concurrent attempts;
- UPDATE/DELETE are rejected by append-only triggers.

## Orchestration Boundary

RL-7 does not create a product API, UI or general research orchestrator.

The sixth correction introduces the internal `writeExperimentComparisonV1`
adapter. It resolves server authority, obtains source evidence through the
existing Research/Validation Passport readers, derives the comparison, recomputes
both hashes, and invokes the two SQL functions transactionally. It accepts no
authoritative prepared hash/JSONB or caller-defined persistence sink.
Headless cross-slice orchestration remains owned by RL-10.

The `investing_app` database credential still has direct EXECUTE capability on
these SQL functions. The SQL layer enforces ownership, context, append-only
identity, and replay/conflict rules; it does not independently reproduce the
TypeScript scientific derivation. Possession of that credential therefore
remains a trusted-server boundary and can bypass the TypeScript reader/writer.
Do not expose it or treat direct SQL payloads as independently scientifically
verified. `service_role` remains capability, never source authority. The sixth correction itself changed no grants, migrations or Production state.
Subsequent accepted remediation and Production gates applied the audited
four-migration set. Real PostgreSQL 17 verification of the concrete adapter
passed and is recorded in the final acceptance evidence below.

## Verification Evidence

Historical implementation verification on exact final candidate
`6cfd148cba970d81bbd3f32a2435f4994a242847`:

- CI: `#1299 / SUCCESS`;
- dedicated Investing Supabase Reconciliation PG17: `#145 / SUCCESS`;
- implementation candidate/merge tree equality: `PASS`.

Current trust-recovery and final acceptance verification:

- trust-recovery predecessor: `425c635ba822e8c9c6fe78f673b1889a827b92be`;
- final canonical predecessor/main anchor: `b19fb3a0093a584df69c42f030dd2ab3e14b7b0a`;
- audited technical candidate: `d989865cbb13039eaeb9a780394ff1551f8e5624`;
- pre-production predecessor: `9209d2f1100f94b3fd05888bf7c68442c35dde45`;
- merge-ref evidence: `d989865cbb13039eaeb9a780394ff1551f8e5624` was proved into `9209d2f1100f94b3fd05888bf7c68442c35dde45`;
- CI: `#1444 / SUCCESS`;
- PostgreSQL 17 gate: `#157 / SUCCESS`;
- RL-7 SQL and concrete writer commit/replay/rollback: `PASS`;
- Vercel Production SHA: `b19fb3a0093a584df69c42f030dd2ab3e14b7b0a / READY`;
- Supabase Production project: `qdnvbamoamtkujzwrxdb`;
- RL-7 migrations present in Git: `YES / FOUR`;
- RL-7 migrations present in Production ledger: `YES / FOUR`;
- Production migration application: `APPLIED / EXACT FOUR-MIGRATION SET`;
- post-apply audit: `PASS`;
- Security Advisor RL-7 findings: `ZERO`;
- Performance Advisor RL-7 findings: `4 unindexed_foreign_keys INFO / NON-BLOCKING`;
- RL-7 protocol rows: `0`;
- RL-7 result rows: `0`;
- scientific/financial row mutation: `NO`.

Acceptance implementation status:
`CURRENT_ACCEPTED / PRODUCTION GATE PASSED / POST-APPLY AUDITED`

Fresh exact-candidate real PG17 execution:
`PASS / POSTGRESQL 17`

## Production Boundary

The final Production gate applied exactly the accepted four-migration RL-7 set
to Supabase project `qdnvbamoamtkujzwrxdb` and passed the post-apply audit.
The application was DDL/RLS/function-only for RL-7. It created no RL-7 protocol
or result rows and mutated no scientific or financial rows.

Production alignment is now:

`RL-7 CURRENT_ACCEPTED = RL-7 PRODUCTION MIGRATIONS APPLIED / POST-APPLY AUDITED`

## Downstream Boundary

RL-7 does not decide promotion.

RL-8 owns Scientific Promotion State Machine authority and remains separate.
`PROMOTION_ELIGIBLE` is not created by RL-7.

RL-7 creates no recommendation, suitability, allocation, Paper authorization,
broker instruction, Live authorization, financial ledger mutation or Capital
Kernel authority.

`CORE != LAB`

`LAB != PAPER`

`INVESTING != TRADING`
