# RL-9C2B2E — Synthetic Blind Truth Seal → Burn → Consume Rehearsal

Status: `SYNTHETIC_REHEARSAL_CANDIDATE / NO_REAL_VAULT / NO_REVEAL_AUTHORIZATION / NO_REAL_HOLDOUTS`.

**Unmerged predecessor:** PR #148 exact SHA `b16f1f3a8f56ea1e39fa75c57ccb1819578a997d`. This PR adds only a private-worker rehearsal module and real file/crypto tests; it deliberately does not add PostgreSQL migrations, new public routes, a live secret worker endpoint, new infrastructure or new fees.

## Implemented executable path

Existing worker-only encryption `workers/investing-blind-vault/envelope.ts` and synthetic ciphertext staging `privateCiphertextStore.mjs` are now exercised as a **single end-to-end synthetic sequence**:

1. Form a known-public **fictional** holdout plaintext vector and known-public test salt and key.
2. Compute accepted RL-9 SHA-256 commitment; encrypt the fictional holdout using AES-256-GCM with exact tenant/registration/scope/commitment AAD.
3. Stage only ciphertext in a separate private 0700 POSIX root using the already accepted synthetic store.
4. Invoke `privateSyntheticConsumeOnce.mjs` with **test-only** `SYNTHETIC_TEST_VECTOR`, an opaque private locator and two explicitly synthetic SHA-formatted *claims* identifying evaluation and `REVEAL_STARTED`.
5. The worker rehearsal creates permanent, exclusive `O_EXCL|O_NOFOLLOW` evaluation and ciphertext-object burn markers (0600), `fsync`ing each file and containing directory **before even opening ciphertext**. A mid-transaction crash or late stage failure may permanently consume a claim; it must not re-enable the same evaluation/object.
6. Only then the rehearsal reads the encrypted envelope with file ownership/mode/nlink/size checks. The code exposes **no plaintext, decryption key, salt or public locator endpoint**. The test-only harness decrypts the returned AES-GCM envelope separately and proves commitment and declared plaintext length; it zeroizes decrypted test bytes.
7. Negative tests prove repeated calls across freshly constructed worker objects, changing event/evaluation IDs, stale/missing/corrupted ciphertext, cross-tenant AAD substitution, role-mode escalation, unknown/weak filesystem permissions and getter/prototype injection fail closed.

This is genuine **durable local-filesystem one-shot behavior**, not a staged assertion that a boolean flag proves a reveal. It is deliberately strictly single POSIX filesystem and uses a synthetic-only mode.

## Missing gates / refusal to claim acceptance

**These are NOT authenticated reveal claims.** The caller-provided `evaluationHashHex` and `revealStartedEventHashHex` are syntactically validated but **not proved to exist in authoritative PostgreSQL RL-9B event history**. It does not prove tenant membership, RL-8 promotion leaf, registration validity, complete access-audit non-exposure, accurate canonical source mapping, non-reuse of actual truth, physical host isolation or key custody. A native filesystem marker is not automatically a cross-host, backup-proof, administrator-proof durable one-shot index. The module is **not imported by the real mTLS server**, ordinary Research, optimizer, AI, frontend, or any public API, and must not be repurposed for Production.

A real gate must later connect an independently authorized, immutable `REVEAL_STARTED` PostgreSQL event to a separately authenticated consume-once capability, enforce a durable confidential vault index across restarts/hosts/restores, verify AES/commitment/canonical plaintext, emit append-only terminal reveal events and handle worker crash as `REVEAL_CONSUMED_RESULT_UNAVAILABLE`. Embargo of every alternate provider/cache/ordinary byte path and proof of no pre-registration exposure must precede this.

The acceptance contract in `I5_RESEARCH_LAB_COMPLETION_PROGRAM_V1.md` still requires RL-9 secret-vault integration, RL-10 headless orchestration and RL-11 full A+B+C rehearsal. Even green CI here cannot mark RL-9 accepted.

No merge, Production DDL/DML, secrets/credentials, paid vault/VPS/second Supabase organization, live order or money movement are authorized by this PR.
