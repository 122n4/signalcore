# Syntrake Production Engineering P0

Status: active hardening sprint.

## Versioning / CI

- Local Git repository initialized.
- `.gitignore` protects env files, local data archives, QA screenshots, build outputs, Vercel state, Supabase temp files, and research artifacts.
- GitHub Actions workflow runs `npm run verify:ci`, production dependency audit, trading production audit when QA auth is configured, and billing entitlement audit when Clerk/Stripe secrets are configured.
- Remaining external step: connect this local repo to the intended GitHub remote and push the first protected branch.

## Lab / Crisis Research

- `research:lab-health` reports active queue, lock heartbeat, active run stage, stage elapsed time, market-data backfill state, and alerts.
- Research supervisor now supports stage timeout detection, not just dead heartbeat detection.
- Current hard rule: warn after `stageWarnMs`, terminate/recover after `stageHardTimeoutMs`.

## Billing / Premium QA

- `qa:billing` audits Clerk premium metadata against Stripe subscription state and owner/local QA overrides.
- `qa:billing:strict` fails on both warning and failure issues so it can be used before a paid launch or release.
- `/api/ops/billing` exposes the same audit report to owner/local QA users, so billing state can be inspected without terminal access.
- It flags manual premium metadata, missing Stripe ids, inactive Stripe subscriptions still marked paid, and Stripe-active users still marked free.

## Observability

- `/api/ops/overview` now includes research lab health alongside scanner, conversion, loop, and engine observability.
- Market data backfill reports are included in research lab health so downloadable gaps do not stay invisible.

## Current Known Findings

- `syntrakehq@gmail.com` is premium through manual Clerk metadata, not Stripe.
- `nunolcmc27@gmail.com` is premium through owner override.
- Active research run is healthy at lock level but long-running in `aggregate`, so it is correctly reported as warning.
