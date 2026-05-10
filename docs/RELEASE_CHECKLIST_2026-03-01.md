# Syntrake Release Checklist (March 1, 2026)

## 1. Technical Health Gate

- [x] `npm run test` passes (`56/56`).
- [x] `npm run lint` passes.
- [x] `npx tsc --noEmit` passes.
- [x] `npm run build` passes.
- [x] GTM installed globally with `GTM-T4P7BL6D` (`head` + `noscript` in body).

## 2. Core Product Funnel Gate (Setup -> Planning -> Advisor -> Daily)

- [x] Setup writes `sc_goal_quiz_v1` and `sc_wealth_plan_v1`.
- [x] Planning reads setup seed and syncs values on save.
- [x] Advisor Gap block reads current plan values (numeric fields prioritize `sc_wealth_plan_v1`).
- [x] Daily profile checks read the same numeric source order as Advisor.
- [x] Scenario `100 / 100 / 1000` validated with consistent values.

## 3. Next Best Action Loop Gate

- [x] NBA is generated server-side (`/api/daily-bundle`) from current plan + holdings + diagnostics + gates.
- [x] `doneToday` is UTC-day based from `daily_snapshots.day_key`.
- [x] Post-close timer is stable and bounded to 8h scheduling windows.
- [x] UI timer updates every 30s.
- [x] Auto-refresh now triggers on UTC day rollover when Daily tab is kept open.

## 4. Launch Smoke Test (manual, 3-5 minutes)

1. Setup with `100` start, `100` monthly, `1000` target.
2. Save in Planning.
3. Open Advisor and confirm Gap inputs match `100/100/1000`.
4. Open Daily and execute flow to close day.
5. Keep tab open across UTC day rollover or refresh after rollover and confirm new cycle opens correctly.

## 5. Go/No-Go Rule

- `GO`: all gates above green and smoke test passes.
- `NO-GO`: any mismatch in Gap inputs, day-close state, or NBA timer/day rollover behavior.
