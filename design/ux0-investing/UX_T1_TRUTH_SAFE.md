# UX-T1 — Truth-safe experience specification

Boundary: UX-T0 accepted as `ux_truth_map_ready`. Only A (`supported_directly`) and B (`supported_by_deterministic_derivation`) may appear in the active prototype. Every rendered fact is wrapped in `data-truth="A"` or `data-truth="B"`.

## Truth-safe copy matrix

| Concept | Class | Active wording | Required condition | Prohibited wording |
|---|---|---|---|---|
| Account mode | A | “Paper account. Values, positions and proposals do not represent real money.” | `environment=paper` | demo, live, real portfolio |
| Cash | A | “Paper cash” | owner-scoped Paper cash balance | cash without Paper qualifier |
| Value | B | “Estimated Paper value, derived at evaluation time…” | positions, Paper cash, quote coverage and market snapshot | verified value, current value |
| Allocation | B | “Estimated allocation” | complete denominator and disclosed coverage | exact/verified allocation |
| Concentration | B | “Estimated weight compared with the limit used by mandate snapshot…” | complete valuation plus evaluated constraint | healthy/unhealthy portfolio |
| Plan inputs | A | “Selected objective/horizon/risk profile/contribution intent” | persisted settings/plan | optimal, recommended, guaranteed |
| Mandate | A | “Mandate snapshot used by the evaluation” | snapshot ID and evaluation run | rule comes from your plan without provenance |
| Evaluation | A | “Latest Paper evaluation · [timestamp]” | owner/account-scoped run | continuous/current analysis |
| No blocker | A | “No engine blocker was found in the latest scoped evaluation.” | complete latest result | nothing requires attention; healthy |
| Insufficient data | A | “The evaluation could not be completed; source/coverage X is missing.” | insufficient-data result | no issues found |
| Impact | B | “Projected/estimated weight, risk or notional” | deterministic proposal fields | outcome, improvement, will happen |
| Explanation | A/B | “Engine explanation · run/reason/evidence hash” | persisted result and linked reason | Research supports your personal rule |
| Proposal | A | “Paper proposal · executable:false” | Phase 3F result | ready to execute, confirm trade |
| No order | A conditional | “No Paper order is recorded for this proposal as of [cutoff].” | account, proposal and cutoff query | no transaction has ever been placed |
| Example | A | “Static example; not a demo account or functional runtime.” | isolated prototype only | active demo |

## Truth-safe state model

| State | Representation | Evidence/transition |
|---|---|---|
| `new_user_unclassified` | Active | Authenticated identity; no stored plan/account/positions |
| `no_portfolio_no_plan` | Active | No plan and no portfolio source |
| `plan_setup_in_progress` | Active | Draft/incomplete required plan inputs |
| `plan_ready_no_portfolio` | Active | Stored inputs/active plan; no Paper account/positions |
| `paper_portfolio_active` | Active | Owner-scoped active Paper account |
| `data_incomplete` | Active | Engine/valuation reports insufficient coverage |
| `data_stale` | Active | Approved threshold exceeded by source timestamp |
| `latest_evaluation_no_engine_blocker` | Active | Latest complete scoped result has no engine blocker |
| `attention_required` | Active | Failed constraint, blocker or insufficient-data policy |
| `engine_decision_recorded` | Active | Persisted engine final decision; never human decision |
| `unavailable` | Active | Required source failed; no conclusion rendered |

Excluded: `healthy_verified`, active demo/real portfolio, persisted review, general follow-up and resolved situation.

## Home variants

1. No portfolio: prepared plan facts, explicit absence of evaluable portfolio, `Create Paper portfolio`.
2. Attention: latest Paper evaluation, estimated value, evaluated constraint, mandate snapshot and timestamp, `Review concentration`.
3. No blocker: exact scoped statement, engine state, account/mandate/market scope, `executable:false`; no global-health claim.
4. Insufficient data: missing quote count, coverage, snapshot and inability to complete; no positive conclusion.

## Paper concentration review

The flow displays estimated current weight, evaluated mandate limit, snapshot ID, evaluation time, reason/evidence hash, projected weight and estimated notional. `Prepare adjustment` represents a non-executable Phase 3F proposal. It never places or confirms an order. The order statement is cutoff-bound.

## Claims removed or replaced

- “Data healthy” → “Paper evaluation · [timestamp]”.
- “On track” and goal probability → removed.
- “Validated Research supports your plan rule” → removed.
- “No auto-action” plus promised future confirmation → `executable:false` and cutoff-bound order status.
- “Everything that happened” Activity claim → removed with the entire active Activity surface.
- Research counts, eligibility and user-facing promotion → removed.
- “Integrity complete” as portfolio trust claim → removed.
- “Situation resolved”, follow-up and progress claims → absent.
- Demo and real Investing states → absent.
- Unqualified “no transaction” → cutoff-bound Paper order wording.

## Hidden functionality

Investor Research, unified Activity, Change plan rule, Defer, Confirm human decision, Create follow-up, Mark resolved, import, generic export, demo runtime, real Investing connection and all automatic-execution implications are not rendered as active features.

## Isolation

The prototype remains outside `app/` and `public/`. It imports no application modules, contains no API URL and replaces `window.fetch` with a rejecting isolation guard. Static values are examples inside this folder only.
