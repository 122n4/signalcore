# I5 RL-9B Blind Truth Public Metadata Persistence — Post-Apply Acceptance V1

Status: `CANDIDATE / POSTAPPLY_AUDIT_PASS / CANONICAL_ACCEPTANCE_PENDING`

Proposed, not yet effective:
`CURRENT_ACCEPTED / RL-9B_BLIND_TRUTH_PUBLIC_METADATA_PERSISTENCE / UNNUMBERED`

Canonical accepted predecessor SHA:
`5f03088afb73b8014e2beb8664816563ade7b364`

Permanent A-number: `NOT ASSIGNED`

## Scope

This record proposes acceptance of RL-9B1 public metadata persistence and
RL-9B2 controlled writers **only**. It does not accept the entire RL-9
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
- Merged-main CI `38148175195 / SUCCESS`.
- Managed-Supabase disposable preview: both migrations `PASS`; branch
  deleted after verification.
- Supabase CLI `2.120.0` dry-run: `PASS`, exactly two pending migrations.
- CLI Production push: `PASS`, applied exact original versions;
  post-apply CLI dry-run: `PASS`, none pending.
- Vercel Production on merge SHA: `READY`; that is deployment evidence,
  not evidence of Supabase migration application.

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

## Acceptance gate — PENDING

This is a **candidate**, not a declaration of `CURRENT_ACCEPTED`.
Reviewer must verify the exact candidate SHA and predecessor, the
documentation-only diff, tests/CI, the 110-entry Production ledger,
security/RLS/ACL evidence, open performance debt and boundaries.

Git merge alone, green CI alone or migration application alone
cannot grant acceptance. If contradictory evidence appears, `BLOCKED`.
No merge, DDL/DML, data mutation or deployment is authorized by
this documentation candidate.

`RL-9B = POSTAPPLY_AUDIT_PASS / READY_FOR_CANONICAL_ACCEPTANCE_REVIEW`.
