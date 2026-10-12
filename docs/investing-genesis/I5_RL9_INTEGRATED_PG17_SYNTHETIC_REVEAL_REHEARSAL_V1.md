# RL-9 — Integrated PostgreSQL 17 + Synthetic Vault Reveal Rehearsal

**State:** `DRAFT_CANDIDATE / TEST-ONLY / NO_REAL_REVEAL / NO_PRODUCTION_APPLY`.

Accepted main predecessor still `f9b377668b1eea56ee8b18afa9151a24291e385c`.
Immediate unaccepted stacked predecessor: PR #149 SHA `91190b4874865c9816cb6d0280b737de9030c465`.
Upstream PRs #138–#149 remain separate Draft candidates.

## Integration — executable, not a standalone classifier

The existing PG17 scientific writer suite `tests/investingGenesisI5Rl9b2BlindTruthWritersPg17.test.ts` now runs **two real disposable PostgreSQL 17 + private POSIX filesystem** integration scenarios using existing accepted contracts and production SQL writer implementations:

1. Build real RL-8 promoted-scientific fixtures and commit RL-9 protocol + registration through the existing B2 writer.
2. Commit a vault seal whose public SHA-256 salted commitment and exact byte length match **known-public synthetic fictional bytes**. Commit the unique evaluation identity.
3. Commit `REVEAL_STARTED` using `persist_research_blind_truth_reveal_started_v1` and independently query the real committed table to verify the exact tenant, registration, evaluation, event hash and state **before even attempting a synthetic Vault open**.
4. Stage a real AES-256-GCM encrypted envelope with exact tenant/registration/holdout-scope/commitment AAD using the existing private synthetic stage writer (separate 0700 root, 0600 sealed files).
5. Claim the evaluation and object in the B2E synthetic filesystem consume-once implementation. It atomically burns and fsyncs both markers **before opening ciphertext**, and the test harness checks decryption and exact commitment/length. Reconstructed instances cannot consume the object again.
6. **Fail-closed terminal path:** deliberately persist `REVEAL_FAILED_CLOSED / ACCESS_AUDIT_UNAVAILABLE` with the actual final-event SQL writer, because the real exposure audit, canonical provider authority and evaluated metric artifact remain unproved. Confirm replay is idempotent, the committed event chain has precisely one predecessor and no fake PASS.
7. **Crash after burn path:** remove ciphertext after staging, verify that the claim is nevertheless durably burned and retries fail, while actual PG17 state contains `REVEAL_STARTED` **and NO terminal event**. Do not fabricate a result or infer that a retry is permitted. The accepted design projects this evidence shape as `REVEAL_CONSUMED_RESULT_UNAVAILABLE`; the runtime projector is not yet implemented and **this test does not claim to exercise one**.

The existing B2 suite replay is intentionally bounded to migrations through `20261010183000`, and subsequent suites test the later Git-only C3 registration lock/fences independently on a disposable PG17 database. Neither the older B2 writer permissions nor the newer C3 production lock are loosened. The integration test runs only with `PG17_RECONCILIATION_URL` and a POSIX filesystem; on Windows it cannot claim POSIX-specific assurance.

## Critical separation and limitations

This is a **privileged fixture/test harness**, not a real Vault worker or authorization service. The test queries PostgreSQL using the disposable test administrator. The synthetic object consumer itself **still accepts caller-provided SHA-shaped evaluation/event IDs**; it cannot verify their PostgreSQL authority and MUST NOT be connected to a real endpoint, real key, live worker, real holdout or ordinary Research.

There is no independent physical Vault boundary, real credential check, confidential anti-reuse index, complete prior-read evidence, source/field/provider authority, embargo-safe all-read service, approved evaluator, durable cross-host/backup-proof consume index or Live credential. Real registration admission remains BLOCKED. `REVEAL_COMPLETED` continues to be forbidden by RL-9B2 until these are proved. No invented returns, metrics, confidence or investment actions.

No merge, production migration/DDL/DML, real secret material, new paid infrastructure, production deployment or real financial mutation is authorized.

## Remaining essential RL-9 gates

Before RL-9 operational acceptance: resolve stacked PR lineage/gates, run a real same-authority read/embargo rehearsal across provider/cache byte delivery with an all-access audit, prove prior non-exposure before registration, establish independently held Vault capability/secrets and confidential anti-reuse, make a **server-verified** one-shot event→Vault consume API, implement the canonical deterministic evaluator/append-only result projector and run crash/reconciliation/security adversarial rehearsal. RL-10/11 should not be prematurely declared complete. Core Investing/Trading must remain independent of optional Lab.
