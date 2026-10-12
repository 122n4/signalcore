# RL-9C3B2B2 — PostgreSQL 17 Denied-Read Journal and Tenant Lock Precursor

Status: `CANDIDATE / NOT_ACCEPTED / NO_ORDINARY_READ_AUTHORIZATION / PRODUCTION_NOT_APPLIED`.

Accepted main predecessor: `f9b377668b1eea56ee8b18afa9151a24291e385c`.
Stacked unaccepted PRs: #138 → #139 → #140 → #141.
Immediate predecessor (PR #141): `cc4e4019819de47beed9e778c8dd828a164f457f`.

## Implemented

The new Git-only migration adds `investing.research_blind_truth_denied_read_attempts_v1` with FORCE RLS, immutable UPDATE/DELETE rejection, and *no app/browser/service_role direct table grants*. An `investing_rl9_writer`-owned, pinned SECURITY DEFINER function `rl9c3b2b2_record_unproven_read_v1(text)` can be called by `investing_app` under a scoped research transaction to record a **blocked** dataset-series material attempt. It always returns the single closed result `UNPROVEN_NOT_AUTHORIZED` and never emits observations or an ALLOW result.

A separate BEFORE INSERT registration trigger acquires transaction-scoped advisory lock `(9100332, hashtext(tenant_id::text))`. The blocked-read journal function acquires the *same* tenant key. A real disposable PG17 concurrency test proves blocking until release of an extant holder and role/RLS/rollback grants. Hash collisions can cause extra waiting but no permission widening.

The function validates context-shaped GUC fields, not authenticated authority. Those GUCs are **not proof of ownership** and may be spoofable; consequently the journal is *attempt telemetry*, never proof of complete or authentic access coverage or absence of past exposure.

## Deliberate safety limits

- Neither of the live `ResearchDatasetMaterialProviderV1.loadSeriesContent` call sites (Research/Validation) is yet wired to the persistent journal.
- The journal records only **denied** attempts that reach this helper, *not* all material reads. It cannot prove pre-registration absence of exposure.
- Registration remains denied to `investing_app` (C3B1), and the locked registration/fence pair is still a draft dependency.
- Tenant lock serializes these *SQL transactions*, not acquisition/delivery of bytes outside those transactions. A later read guard must hold appropriate DB authority and synchronization through the data release point, otherwise TOCTOU remains.
- No server-owned canonical provider/field mapping, completeness ledger, full cache/preview/export guard or trusted prior-exposure proof is established.
- No Vault provision, live holdouts, real customer data, Production migration, key or paid infrastructure. Neither Investing Core nor Trading Core depends on this Lab gate.
- A CI success is evidence of this narrowly bounded behavior, not full RL-9C3B acceptance.

## Next gate

Build a server-owned, tenant-authorized resolver with mapping provenance and complete fence state; connect all ordinary Investing Research/Validation providers, caching and materialization paths to durable read audit. Prove actual register-vs-byte-read races (including process failure and rollback), test provider/frequency substitution, map ambiguities, and prior exposure. Only then can an audited registration admission replacement be considered.

No merges or Production changes under this candidate.
