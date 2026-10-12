# RL-9C3B1 — Blind Truth Registration Admission Lock (Fail-Closed Precursor)

Status: `CANDIDATE / UNACCEPTED / PRODUCTION_NOT_APPLIED / REAL_HOLDOUTS_BLOCKED`.
Accepted predecessor: `f9b377668b1eea56ee8b18afa9151a24291e385c`.
This is a **risk-containment** slice of RL-9C3B, not the accepted end-to-end embargo.

## Verified risk and decision

RL-9B currently grants `investing_app` EXECUTE on
`investing.persist_research_blind_truth_registration_v1(text,jsonb)`.
That writer verifies scientific identity and promotion but does **not**
atomically persist an active embargo fence, prove no earlier exposure, or
synchronize every ordinary data resolver against the same scope. An RL-9B
registration is public metadata, never evidence that a real secret is safe.

**Invariant until replacement:** no ordinary application principal can
register a Blind Truth candidate with an unproven embargo. The narrowly
targeted migration removes **only** the RL-9B registration writer EXECUTE
grant to `investing_app`. It does not change the accepted writer body,
canonical hash law, other allowed public protocol writer, read grants,
data, account/tenant policy, Vault credentials, execution services, or
scientific event schema.

## Execution and PG17 acceptance

New migration:
`supabase/migrations/20261012173000_investing_i5_rl9c3b1_registration_admission_lock.sql`.

- Replay from the accepted I2 Genesis boundary through RL-9B2 in isolated PG17;
  prove `investing_app` previously could execute registration.
- Apply C3B1; prove `investing_app`, `anon`, `authenticated`,
  `service_role` cannot execute; run a real denied role-scoped function
  invocation (SQLSTATE 42501).
- Verify owner `investing_rl9_writer`, SECURITY DEFINER, pinned
  `search_path=pg_catalog`, untouched protocol execute/read grant,
  RLS/FORCE, zero leaked writer SET/USAGE/schema CREATE, and idempotent
  reapplication.
- Run a distinct PostgreSQL 17 job in the Investing reconciliation
  workflow. Managed-role replay is an independent gate.
- Use `accepted predecessor SHA -> candidate SHA`, independent diff
  verification, full CI, Vercel Preview, no new dependency vulnerabilities.

This is a deliberate reduction in RL-9B registration availability, not a
research/trading/Core outage. The current RL-9 real holdout workflow
was already **not admitted**.

## Next C3B slices — NOT implemented here

1. Authoritative, tenant-bound append-only access/exposure evidence with
   complete coverage of all ordinary Research/provider/cache routes.
2. Server-resolved canonical provider/field mapping, persisted embargo
   scopes/fences and atomic registration+fence activation. Close read-versus-
   registration races with a shared DB synchronization/locking mechanism.
3. Read guards using *only* complete, persisted server-owned state; reject
   unknown or ambiguous mapping, stale/partial ledger and missing audit.
   No `ALLOW` based on the C3A prefilter alone.
4. Independent PG17 malicious/parallel/rollback/recovery/tenant isolation
   tests, rehearsal with known synthetic facts, and independently audited
   preview. A new, auditable replacement admission path is required
   before the registration grant can be restored.
5. Separately authorized Production migration; later rehearsal of real
   Vault-isolation with synthetic canary and separate worker. Vault project
   still does **not** exist. Its indicative Supabase extra compute cost is
   USD 10 per month; owner has **not** authorized creating it now.

**Never infer:** registration locked = embargo enforced. This migration
does not implement embargo persistence, a data resolver, a secret Vault,
one-shot read/consume, scientific evaluation, or RL-9 acceptance.
Nothing changes in Production until a separate migration approval.
Research Lab remains optional; Investing and Trading Core independent.
