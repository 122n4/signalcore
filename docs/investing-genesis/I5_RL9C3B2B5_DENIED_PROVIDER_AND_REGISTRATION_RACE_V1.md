# RL-9C3B2B5 — Denial-only Research Material Provider + Registration Race Evidence

Status: `CANDIDATE / TESTED_SCOPE_TO_VERIFY / NO_ORDINARY_READ_ACCESS_GRANTED / UNMERGED`.

Main accepted SHA: `f9b377668b1eea56ee8b18afa9151a24291e385c`.
Stacked open Draft PRs: #138 → #139 → #140 → #141 → #142 → #143 → #144.
Immediate parent of this slice: PR #144 SHA `b475eb835b0767c61eab0183e2075d62d56668e1`.

## Executable work

`deniedAndJournaledResearchMaterialProvider.ts` implements the **same** `ResearchDatasetMaterialProviderV1` contract as ordinary Investing Research. It has no raw-provider argument, validates a scientific series HashRef before any database access and, given a server-provided research context and an Investing Database transport, opens a short PostgreSQL transaction, configures tenant/principal/investigation authority context, invokes the C3B2B2 durable denied-read attempt writer and commits that attempt if the SQL returned the *single* expected `UNPROVEN_NOT_AUTHORIZED` verdict. It **throws `RESEARCH_MATERIAL_ACCESS_UNPROVEN` unconditionally**, including after a successful journal commit. A database failure, wrong SQL return, invalid HashRef, rollback or bad context **never** falls back to any provider and never returns bytes or `null` (which could be misreported as missing observations).

This is a **DENIAL provider**, not a production-ready authorizing provider. Its compile-time context type is the server authority contract, but authorization is not proved by compiler types or PostgreSQL GUCs. Its isolated tests use synthetic context objects for closed denial behavior only; do not treat them as authenticated sessions. Existing ordinary service commands and the central B3 material reader remain **UNCHANGED**: no implicit fail-open/fail-closed behavior switch in the already-established scientific execution closure.

The PG17 `investingGenesisI5Rl9b2BlindTruthWritersPg17.test.ts` fixture additionally executes **real PostgreSQL 17 concurrent transactions**:
1. Persist a valid scientific protocol and prepare its legitimate registration using prior accepted scientific fixtures.
2. In transaction A, create a valid registration and embargo fence and leave it uncommitted under the C3B2B2 tenant advisory lock.
3. In transaction B, issue the B4 persistent-fence preflight against the *same* tenant/market/field/period, proving it waits rather than reading the initially invisible fence.
4. Commit transaction A and verify B is still denied but internal evidence detects the now-committed fence.
5. Repeat with transaction A rollback: B is still denied and the audit records absence of intersection without converting that into authorization.

The lock is **transaction-scoped**; these tests prove metadata ordering only, NOT safe arbitrary provider byte delivery. The test does not seed fictional real holdings or use Production.

## Required next gates

1. Server-owned source→canonical market/field/coverage mappings and immutable provenance with point-in-time semantics.
2. A privileged *data read* authority that holds the registration/read synchronization and authenticated tenant context **until provider/cache bytes have been irreversibly consumed or released**, with a complete append-only read ledger. No unguarded alternative resolver, export, proxy or frequency/provider substitution may remain.
3. Integrate the actual Research and Validation service commands; amend the prior scientific execution closure tests to prove authenticated research still functions for legitimate non-embargoed inputs. No blanket denial in Core and no Lab-enabled authorization based on empty fence lookup.
4. Audit same-tenant and cross-tenant concurrent access, full pre-registration exposure and crash/timeout/rollback across the byte-delivery boundary. Rehearse physical Vault access only once the gate is real.

**This PR does not provide operational embargo acceptance**, does not re-enable registration, does not modify production, does not deploy, does not merge and does not incur new paid infrastructure. Core Investing and Trading remain independent.
