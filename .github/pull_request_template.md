# Syntrake — Canonical Candidate Gate

> This PR is a candidate, not canonical truth, until independently audited and gated.

## Lineage

- Accepted predecessor SHA:
- Candidate SHA:
- Canonical base branch:
- Work ID / slice:

## Scope

Describe exactly what this candidate changes and what it explicitly does not change.

## BIBLE IMPACT

- [ ] `NONE` — no canonical product/architecture/financial/authority/roadmap rule changes.
- [ ] `AFFECTS CANON` — list the affected sections below.

Affected `docs/SYNTRAKE_CANONICAL_BIBLE.md` sections:

Proposed amendment / reason:

## Material impact assessment

- Financial truth impact: `NONE` / describe
- Auth / tenant / ownership / authority impact: `NONE` / describe
- DB / migration impact: `NONE` / describe
- Execution / broker impact: `NONE` / describe
- Investing / Trading isolation impact: `NONE` / describe
- Market/data provenance impact: `NONE` / describe

## Validation evidence

- Tests run:
- Type/static checks:
- CI checks:
- Known baseline failures:
- External state verified, if relevant:
- External state not verified / unavailable:

## Canonical Bible ledger

- [ ] Material Work Ledger entry updated in `docs/SYNTRAKE_CANONICAL_BIBLE.md`.
- [ ] Entry status is `IMPLEMENTED_CANDIDATE` unless an independent audit/gate already exists.
- [ ] Exact predecessor/candidate lineage is recorded.
- [ ] Known limitations and baseline failures are recorded.

Codex MUST NOT mark its own implementation `ACCEPTED` merely because implementation/tests completed.

## Independent audit / gate

- Independent audit evidence:
- Gate state: `PENDING` / `ACCEPTED` / `BLOCKED` / `REJECTED`
- Exact accepted SHA, if accepted:

## Production / irreversible-action guard

Unless explicitly authorized separately by the owner, this PR does **not** authorize:

- merge;
- production deployment/promotion;
- production DDL/DML;
- migration-history rewrite or silent drift repair;
- destructive rollback;
- real broker orders or real financial-state mutation.

If requested behavior conflicts with the Canonical Bible, the correct outcome is:

`BLOCKED — CANONICAL CONTRADICTION`
