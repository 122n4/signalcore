# UX-T1R human-first refinement

## Scope

UX-T1R changes presentation and static interaction only. It adds no C/D/E capability, persistence, API, backend or production integration. The 11 UX-T1 truth-safe states remain unchanged.

## Claims changed

| Previous surface claim | Human-first surface claim | Technical evidence |
| --- | --- | --- |
| Prepare your investing context | Welcome to Investing / No portfolio yet | None; no evaluation exists |
| Paper environment before account creation | Investing setup | Paper context is hidden until simulated creation |
| No engine blocker found | No issue was found in the checks that ran | Scope and identifiers in disclosure |
| Evaluated constraint | One position is above your selected limit | Reason code in disclosure |
| Mandate snapshot | Selected plan limits / limit used for this check | Snapshot ID in disclosure |
| Recorded engine assessment | Previously recorded assessment | Run and evidence identifiers in disclosure |
| executable:false | This creates a simulation only. No order will be placed. | `executable:false` in disclosure |
| Prepare adjustment | Create Paper adjustment preview | Simulation-only limitation next to CTA |
| Rule editing is intentionally unavailable until canonical plan precedence and provenance exist | Editing is not available in this static prototype | No additional capability implied |

## Human-first hierarchy

- Attention starts with the one priority and `Review concentration`; value, cash, allocation and evidence follow.
- Stale starts with `Refresh data`; the recorded assessment is hidden behind `View recorded assessment` and marked not current.
- Unavailable explains what failed, confirms that simulated positions and selected inputs were not changed, and offers one action.
- Concentration uses a vertical narrative: detection, comparison, significance, estimated Paper impact and next safe action.
- Technical IDs, hashes, reason codes, snapshot names and `executable:false` appear only after opening `Technical evidence`.

## First-use journey

The static, non-persistent journey contains welcome, starting point, objective, horizon, contribution intent, risk comfort, selected-input review, plan ready, Paper creation and first-evaluation transition. It is visual interaction only; it creates no real account, position or payment.

UX-T1R-R1 adds `Save and exit` to steps 1–8. It pauses the local visual journey without cancelling or deleting selected inputs, returns to an appropriate Home with `Continue setup`, and resumes at the same in-memory step. `Back` remains a separate action. The completed ninth step uses only its final action.

## Truth classifications

Only `data-truth="A"` and `data-truth="B"` are rendered. No C, D or E claim is active.

## Chrome evidence

Real Chrome screenshots for the changed states are under `screenshots/t1r/` at 390 x 844 and 1440 x 900. Direct navigation and state changes were tested while Portfolio was open, including unavailable, insufficient, stale and no-issue states.

Classification: `ux_truth_safe_human_experience_ready`
