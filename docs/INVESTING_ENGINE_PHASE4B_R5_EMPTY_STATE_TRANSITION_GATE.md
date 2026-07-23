# FASE 4B-R5 — Empty-state transition gate

R5 is an admission gate only. It does not validate or accept existing history.
`historical_set_empty` requires zero rows in all six Investing Engine persistence
tables. Any run, artifact (including an orphan), phase summary, reason evidence,
shadow package, or idempotency claim returns `historical_set_blocked`.

## Required action before FASE 4C

Provision a **new empty database** for the Investing Engine before requesting
FASE 4C admission. Do not drop, truncate, convert, or reuse the current database
to make the gate pass. Preserve any non-empty database unchanged for audit.

For disposable local QA only, an administrator may create a new database with a
new disposable name, apply all migrations from zero, and then run the protected
QA command with an explicit local URL, explicit port, disposable database name,
and `ALLOW_DESTRUCTIVE_INVESTING_QA=true`. Never infer the target from PostgreSQL
environment variables or silently replace an existing database.

After migrations, execute the gate as `service_role` and require exactly:

```text
decision = historical_set_empty
counts.totalRelevantRows = 0
policy = empty_only
```

Any other result blocks the transition. This instruction does not authorize or
start FASE 4C.
