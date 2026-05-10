# Syntrake Execution Backlog (Max)

Status legend:
- `[x]` done
- `[~]` in progress
- `[ ]` pending

## Core Safety Engine
- `[x]` Define per-user `riskPolicy` with hard limits
- `[x]` Enforce blocking guardrails in `daily-bundle` (concentration, drawdown, exposure, quality)
- `[x]` Implement automatic kill-switch with `Protecting` / `Waiting`
- `[x]` Add pre-trade mandatory safety check in execution flow
- `[x]` Block risk escalation when execution proof is incomplete
- `[x]` Add risk envelope computation per decision
- `[x]` Add dynamic position sizing (confidence x risk x execution)

## Capital Growth Logic
- `[x]` Build prioritized Opportunity Queue (impact x risk x effort)
- `[x]` Add cash deployment policy by market regime
- `[x]` Add Growth Readiness score (alignment, risk, consistency, execution)
- `[x]` Expose weekly value metrics (risk avoided, errors avoided, discipline up)
- `[x]` Add simulation pre-execution (risk/alignment impact)

## Product Experience by Tab
- `[~]` Enforce rigid mission separation by tab (Daily / Planning / Advisor / Autonomy)
- `[~]` Simplify Daily to 1 primary focus (Today’s Decision + 1 CTA)
- `[~]` Ensure Planning never shows daily execution controls
- `[~]` Ensure Advisor never shows execution CTA
- `[x]` Keep Autonomy operational and non-competing (actions secondary/collapsed)
- `[x]` Add Capital Protection Summary panel in Daily/Advisor
- `[ ]` Final UX terminology/hierarchy alignment across tabs

## Trust, Transparency, Retention
- `[x]` Make decision sources explicit in UI/docs (Finnhub, TwelveData, plan, holdings, execution, snapshots)
- `[ ]` Onboarding value proof in ~10 minutes (1 decision + 1 impact + 1 next step)
- `[ ]` Daily close reward loop (clear progress/protection outcome)
- `[x]` Intelligent priority notifications (avoid noise)
- `[ ]` Anti-churn layer (discipline drop detection + intervention)
- `[~]` Expose operational reliability/degradation/continuity clearly
- `[ ]` Reinforce trust/compliance layer visibly

## Execution, Billing, Launch QA
- `[ ]` Strengthen broker-assisted execution checklist + fast proof validation
- `[~]` Validate Free / Trial / Pro paywall behavior without trust break
- `[ ]` Mobile QA for Daily / Advisor / Autonomy
- `[ ]` Fix final branding strings / visual inconsistencies
- `[ ]` Build + lint + regression checks
- `[ ]` Deploy production on Vercel
- `[ ]` Post-deploy smoke test (checkout, webhook, Pro unlock, daily loop)

## Working Rule
- No destructive changes.
- Additive changes only.
- No deployment until localhost validation is approved.
