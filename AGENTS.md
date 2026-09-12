# SYNTRAKE - CANONICAL BUILD RULES

## Mandatory canonical bootstrap

Before any material Syntrake work, READ:

`docs/SYNTRAKE_CANONICAL_BIBLE.md`

Treat that file as the canonical product/architecture contract.

Real external state still wins for facts about what is actually deployed,
stored or running. Verify GitHub/Supabase/Vercel/provider/broker state when
material to the task; never overwrite real state with memory or documentation.

If the Bible cannot be accessed or parsed, material work is:

`BLOCKED — CANONICAL CONTEXT UNAVAILABLE`

If requested work contradicts the Bible, do not silently implement it. Return:

`BLOCKED — CANONICAL CONTRADICTION`

and identify the conflicting section and required resolution.

## Mandatory Bible maintenance

Every material Codex slice MUST update the Bible Material Work Ledger in the
same candidate branch/commit series.

A candidate must be recorded as `IMPLEMENTED_CANDIDATE` until independently
audited/gated. Codex MUST NOT mark its own implementation `ACCEPTED` merely
because it built it or its local tests passed.

Every material result must report:

- accepted predecessor SHA;
- exact candidate SHA;
- scope;
- tests/evidence;
- known limitations/baseline failures;
- `BIBLE IMPACT`;
- gate state.

If accepted product vision, architecture, financial semantics, authority,
roadmap or implementation truth changes, update the relevant Bible sections
with traceability. If no canonical rule changes, `BIBLE IMPACT: NONE` is valid,
but the material-work ledger entry is still required.

## Investing Genesis

The old Investing implementation has been retired.

Pre-Genesis Investing source, contracts and architecture are prohibited
as implementation references.

Supabase migrations before the verified retirement boundary are
HISTORICAL_LINEAGE_ONLY.

Investing Genesis must be designed from current requirements,
current live schema truth and explicitly accepted new contracts.

Never infer current behavior from deleted Investing code or historical
migrations.

Historical artifacts may explain lineage/incidents but are not authority for
rebuilding retired Investing behavior.

## Permanent safety invariants

Trading and Investing must remain isolated.

Missing financial truth must never become zero/default/estimated truth
unless explicitly classified.

Authenticated identity is not ownership.
service_role is capability, not authorization.

No production deploy, destructive database action, migration history rewrite,
merge, push to a protected/canonical target, or real financial/broker action
without explicit owner authorization.
