# RL-9C3B2B7A — Immutable Canonical Mapping Candidate Evidence

Status: `CANDIDATE / PERSISTED_UNVERIFIED_SCOPE_CANDIDATES / NEVER_ALLOW / NO_PRODUCTION_APPLY`.

Main accepted reference: `f9b377668b1eea56ee8b18afa9151a24291e385c`.
Immediate unaccepted predecessor: Draft PR #146 SHA `ed9d5bb8361007476174e99a979ea41cd67e3ef7`.
Stacked Draft PRs #138–#146 must be independently reconciled before any merge.

## Purpose and exact implemented contract

RL-9C3B2B1 currently accepts mapping arrays supplied by a caller; even a perfect interval intersection result cannot establish source identity or read permission. This slice introduces a **persisted source-of-candidates** with immutable evidence, **not** an authoritative market-data registry.

Git-only PostgreSQL 17 migration `20261012200000_investing_i5_rl9c3b2b7a_mapping_candidate_evidence.sql` adds:
- `investing.research_dataset_mapping_candidates_v1` keyed by immutable candidate UUID with tenant, principal, membership, investigation, scientific series SHA, source-evidence SHA, provider dataset/version, instrument/field identity, canonical market/field candidate, coverage dates and timestamp.
- Mandatory `evidence_state='UNVERIFIED'` with no SQL pathway to `VERIFIED`. A SHA digest proves bytes match a digest, not that those bytes represent a true provider mapping. Production starts with **zero** mappings, never fictional records.
- FORCE RLS and row-level append-only UPDATE/DELETE rejection. Only `investing_rl9_writer` can SELECT, and only under exact scoped Research/Validation GUC conditions. Neither `investing_app`, `service_role`, `anon` nor `authenticated` can read or INSERT candidate table records directly.
- A pinned, role-owned SECURITY DEFINER **denial-only** function `rl9c3b2b7a_record_mapping_assessment_v1(text)` which counts RLS-visible rows for a series under the same tenant advisory transaction lock as Blind Truth registration and writes one immutable denied-read event with internal `MAPPING_UNAVAILABLE / MAPPING_AMBIGUOUS / MAPPING_CANDIDATE_UNVERIFIED`. All external replies are identical: `UNPROVEN_NOT_AUTHORIZED`, including when exactly one row exists; no caller learns mapping existence through the result.
- Earlier read-denial rows retain `NOT_ASSESSED`. No historical assertion is retroactively stamped as verified or non-exposed.
- No positive read function, no mapping writer, no provider integration, no re-grant of Blind Truth registration permissions.

The disposable PostgreSQL 17 suite seeds **explicitly synthetic** candidate rows only into its temporary database to prove missing mapping, conflicting rows, same scientific series in two tenants, investigation-level RLS isolation, malformed evidence/date rejection and real UPDATE/DELETE denial. No production or user state is touched.

## What this DOES NOT establish

The database permits **only candidates** to be inserted by a separately authorized administrative mechanism not implemented by this PR. Even a single candidate has not been verified against market provider adapters, historical revisions, corporate actions, exchange/currency calendars, aliases, frequency transforms, caches, snapshot lineage or point-in-time authority. GUCs alone cannot establish ownership; this function returns denial regardless. No one can claim the candidate table is a Core market-data source of truth. Market-data authority belongs in Syntrake Core and should be reusable by Labs without making Core depend on Labs.

The B6 service commands remain fail-closed and are **not reconnected to ordinary material bytes** by this slice. A complete authoritative mapping lifecycle, append-only **all-read** exposure journal, atomic fencing and lock-through-provider-byte-delivery and cache/export guard are still required before any positive access. No real Blind Truth holdouts or real Vault admission are authorized.

No merge, migration to Production, Vercel production deployment, Vault purchase, financial change or live bot action is part of this candidate.

## Next executable slice

Develop the trusted Core market-identity adapter contract and point-in-time mapping attestations, and an authenticated server-side reader which obtains those trusted facts and writes *all* access attempts before byte delivery while registration and readers share one transaction-compatible lock. Fail closed for null/ambiguous or stale mapping and incomplete audit history.
