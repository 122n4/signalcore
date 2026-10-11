# I5 RL-9B Blind Truth Public Metadata Persistence — Post-Apply Acceptance V1

Status: CURRENT ACCEPTED OWNER CONTRACT — RL-9B PUBLIC METADATA PERSISTENCE — UNNUMBERED

Classification:
`CURRENT_ACCEPTED / RL-9B_BLIND_TRUTH_PUBLIC_METADATA_PERSISTENCE / UNNUMBERED`

Canonical predecessor for final acceptance sync:
`2fa7ccc50b37566a239392c71195dd6ff123841d`

Original RL-9B implementation merge anchor:
`5f03088afb73b8014e2beb8664816563ade7b364`

Permanent A-number: `NOT ASSIGNED`

## Scope

This record accepts RL-9B1 public metadata persistence and RL-9B2
controlled writers **only**, effective after the independently reviewed
final canonical acceptance sync is merged to protected main. It does not accept the entire RL-9
Blind Truth / Evidence Vault, and does not supersede the accepted RL-9
Design Freeze. `CORE != LAB`; `LAB != PAPER`; `INVESTING != TRADING`.

No secret holdout, independent Secret Vault, consume-once read, confidential
anti-reuse, end-to-end embargo or deterministic reveal evaluator is delivered
by RL-9B. RL-9C, RL-9D and RL-9E remain required. No scientific
PASS grants capital, Paper, Live, suitability or broker authority.

## Immutable Git lineage

- Repository: `122n4/signalcore`.
- Implementation PR: `#126`, merged.
- Implementation candidate:
  `6164a2db3981cdac5d908396a67d9349a170f315`.
- Squash merge/main anchor:
  `5f03088afb73b8014e2beb8664816563ade7b364`.
- Candidate and merge trees: `EQUAL`.
- RL-9B1 file:
  `20261010180000_investing_i5_rl9b1_blind_truth_public_metadata.sql`,
  blob `17d9ba291b928535ca4c30a3a890d1762413010a`.
- RL-9B2 file:
  `20261010183000_investing_i5_rl9b2_blind_truth_public_metadata_writers.sql`,
  blob `16d1aab1c503ad3b84926993a48c932ba91c6a4a`.
- Candidate CI `38146993231 / SUCCESS`, PostgreSQL 17
  `38146993163 / SUCCESS` (five successful jobs).
- Merged-main implementation CI `38148175195 / SUCCESS`.
- Post-apply acceptance-evidence PR `#127`: candidate
  `27134592cb721b1ffa4e0ed45c8a53d2d6d936a7`,
  squash merge/main `2fa7ccc50b37566a239392c71195dd6ff123841d`.
- PR #127 candidate and squash merge Git trees: `EQUAL`.
- PR #127 candidate CI `38154330626 / SUCCESS` (verify,
  dependency-audit).
- PR #127 post-merge CI `38154751510 / SUCCESS` (verify,
  dependency-audit).
- Final independent post-merge read-only GitHub/Supabase/Vercel gate:
  `PASS / 2026-10-11`.
- Managed-Supabase disposable preview: both migrations `PASS`; branch
  deleted after verification.
- Supabase CLI `2.120.0` dry-run: `PASS`, exactly two pending migrations.
- CLI Production push: `PASS`, applied exact original versions;
  post-apply CLI dry-run: `PASS`, none pending.
- Vercel Production on implementation merge SHA: `READY`.
- Vercel Production on PR #127 merge SHA
  `2fa7ccc50b37566a239392c71195dd6ff123841d`:
  `dpl_4Qh8begVhubhfUtP2TFKTEp6U26N / READY`.
  Vercel deployment evidence is not proof of Supabase SQL application.

## Independently verified Production state — 2026-10-11

Supabase project: `qdnvbamoamtkujzwrxdb`.
PostgreSQL: `17.6`. Migration history: `110` entries, aligned with
the accepted implementation SHA. Exact RL-9B1 and RL-9B2 versions are
`20261010180000` and `20261010183000`.

Read-only catalog verification:

- Five scientific identity tables, owner `investing_owner`, RLS and
  FORCE RLS on all five.
- Six persistence writers, owner `investing_rl9_writer`, all
  `SECURITY DEFINER` and `search_path=pg_catalog`.
- Dedicated writer role: `NOLOGIN`, `NOINHERIT`, `NOBYPASSRLS`,
  no superuser or schema CREATE. Administrative postgres membership is
  ADMIN-only with SET and INHERIT disabled.
- No EXECUTE on the six writers for PUBLIC, anon, authenticated or
  service_role. `investing_app` has EXECUTE only for Protocol and
  Registration; four secret/evaluator/reveal-dependent writers remain
  inaccessible.
- Five one-shot indexes: candidate registration, registration seal,
  registration/seal evaluation, evaluation Reveal Started, and one
  successor per Reveal Started.
- Five append-only UPDATE/DELETE reject triggers; no UPDATE/DELETE
  privilege for app or writer roles.
- No secret-like public column names in the five tables.
- `investing_app` SELECT grants do not create direct read authority
  without SELECT RLS policies; direct SELECT remains fail-closed.
- No scientific RL-9B rows observed in Production at audit time.

The Production audit is **structural and read-only**. Controlled PG17
integration tests prove behavioral invariants in isolation; they do
not constitute Production tenant-fixture, concurrency or mutation tests.
The migration history contains statements split by the CLI, not an
independently reconstructed exact SQL-file preimage.

## Known debt and boundaries

- RL-9B-specific Security Advisor findings: `ZERO`.
- Legacy `public` Security Advisor findings remain:
  `6 rls_enabled_no_policy INFO` and
  `10 function_search_path_mutable WARN` (separate scope).
- RL-9B-specific Performance Advisor findings:
  `20 unindexed_foreign_keys INFO` and `8 auth_rls_initplan WARN`.
  Review and benchmark before scale; this record authorizes no repair.
- Current direct read-model authorization is not yet implemented.
- No financial, Paper, broker, Live or Trading authority changes.

RL-8 historical ledger identifiers were reconciled on 2026-10-11:
`20261009043031 -> 20261004120000`,
`20261009043034 -> 20261007120000`,
`20261009043037 -> 20261007143000`.
The stored RL-8 SQL was independently checked byte-for-byte against Git
before reconciliation. SQL was not replayed. The old timestamps remain
historical application evidence, not current ledger identifiers.

## Canonical acceptance basis

A merge alone, green CI alone and Production application alone were
insufficient. This narrowly accepted status is supported cumulatively by:

- independently audited RL-9B implementation and exact candidate/merge tree;
- GitHub CI, five PostgreSQL 17 jobs, managed-Supabase preview;
- owner-authorized CLI Production application preserving two original versions;
- independent post-apply structural catalog/RLS/ACL/role/one-shot audit;
- independent PR #127 candidate and post-merge CI, exact tree equality,
  Vercel deployment readiness and remote migration-ledger verification;
- recorded Production testing limitations and outstanding advisor debt.

No synthetic tenant behavior or secret-vault semantics are attributed
to the Production catalog inspection.

The acceptance classification becomes operative only when the exact
final-status candidate passes its own independent review/CI and is separately
authorized and merged into main. Prior to that gate, the accepted predecessor
and its `CANONICAL_ACCEPTANCE_PENDING` status remain authoritative.

This acceptance adds no new SQL, DDL/DML, financial state, research execution,
secret vault, read model, Paper, Live or Trading authority. RL-9 remains
`IN_PROGRESS`, with RL-9C next.

`RL-9B = CURRENT_ACCEPTED / RL-9B_BLIND_TRUTH_PUBLIC_METADATA_PERSISTENCE / UNNUMBERED`.
