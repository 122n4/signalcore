# I5 RL-9C — Independent cumulative risk audit (2026-10-13)

**Verdict: BLOCKED_FOR_RL9C_ACCEPTANCE.** This is a risk-focused, source-backed audit of the *candidate stack*, not an all-file or line-by-line certification. It records the most material unclosed requirements. **No accepted predecessor is superseded by this audit**, and an audited Draft is not a release.

## Exact audited sources and lineage

- Repository: `122n4/signalcore`; accepted/main anchor verified `f9b377668b1eea56ee8b18afa9151a24291e385c`.
- Latest source inspected before this audit record: `7c75e84ee1aef00ca5f468dd995b63e72a1cd0fb`, head of Draft PR #153, base PR #152 (`ee73d5c904bc7e7b1a390df2cc95cddd4b049138`).
- GitHub compare `main...${expected}`: **121 commits ahead / 65 changed files**. All #138–#153 are **16 stacked, open Draft PRs**, not merged.
- CI `7c75e84ee1aef00ca5f468dd995b63e72a1cd0fb`: **15/15 successful**; Vercel Preview **SUCCESS**. CI exercises coded fixtures/PG17 rehearsals but **does not establish deployed worker, Vault admin/secret custody, live revelation or production state**.
- High-risk source files independently read:
  - `workers/investing-blind-vault/{isolatedServer.mjs,startIsolatedWorker.mjs,privateSyntheticConsumeOnce.mjs,privateSignedSyntheticBurnConsumer.mjs,privateCiphertextStore.mjs,envelope.ts}`;
  - `lib/investing/secretVault/blindTruthVaultCrypto.ts`;
  - `lib/investing/research/{researchExecutionService.ts,validationExecutionService.ts,ordinaryResearchDatasetMaterialRead.ts,deniedAndJournaledResearchMaterialProvider.ts,localSyntheticResearchMaterialProvider.ts,blindTruthDatasetScopeClassification.ts,blindTruthPassportProjection.ts,researchPassportReader.ts}`;
  - PG17 migration `20261012173000` (registration lock), `20261012190000` (deny preflight), `20261012213000` (burn reservation), `20261012220000` (Passport public RLS).
- Scope **not independently exhausted**: all 65 changed files, all 121 changesets, all 7 candidate migration diffs/SQL ownership edges, all real market/provider/export surfaces, all signed URL/S3 paths, operating-system/container administrator boundary, cryptographic key provisioning, threat modeling, full fuzz/concurrency verification. Those require dedicated acceptance evidence and cannot be inferred from passing CI.

## Provider state independently verified — read-only

PRIMARY `qdnvbamoamtkujzwrxdb` and VAULT `nlgxqbggvgigcggaybas` are separate active Supabase projects, **both in the same organization** `gdttkvgpfohoxwyguiuu`. Same-org administrator authority is therefore a shared control plane: separation of project refs **does not** prove independent admin custody.

Primary migration ledger: **110 applied migrations**, last `20261010183000_investing_i5_rl9b2_blind_truth_public_metadata_writers`; **none** of the 2026-10-12 Draft RL-9C/Passport migrations is applied. Vault migration ledger: **0**. No production change was made during this audit.

Vault private bucket `syntrake-private-canary`: `public=false`, exactly one nonplaceholder 38-byte synthetic canary object by provider metadata. `storage.objects` has RLS enabled and zero object policies. Security Advisor returned **zero lints** (does not prove full isolation).

Independent read-only PG role checks (three separate transactions each with `SET LOCAL ROLE` then `ROLLBACK`) against the synthetic canary:
- `anon`: **0 visible rows**.
- `authenticated`: **0 visible rows**.
- `service_role` **of this Vault project**: **1 visible row**.

**Bounded result:** PostgreSQL RLS/GRANT deny for nonprivileged roles, **not** Storage REST authenticated-object denial, signed-URL/S3 denial, or cross-organization admin/custody boundary. Vault's own service role bypasses RLS as designed.

Historical operator report: Vault-owned credential read the exact 38-byte synthetic marker (`VAULT_POSITIVE: PASS`); no independent raw response bytes stored by this audit. The primary cross-project credential experiments returned **HTTP 400 / InvalidRequest / missing Authorization**, so neither `PRIMARY_DENIAL` nor `PRIMARY_KEY_GATEWAY_DENIAL` was or may become a PASS. Such cross-host secret forwarding is retired in the current source; never rerun old locally pinned WSL wrappers.

## Executable boundary findings

### F1 — Actual isolated worker and secret reveal: BLOCKED (critical acceptance gap)

`workers/investing-blind-vault/isolatedServer.mjs` provides mTLS-pinned `GET /internal/live` (204) and `GET /internal/ready` (**503 always**), no seal/consume/reveal endpoint. `startIsolatedWorker.mjs` binds loopback only and uses operator private TLS mounts. This is correctly **inert** and must not be presented as an operational Vault.

`privateCiphertextStore.mjs`, `privateSyntheticConsumeOnce.mjs` and `privateSignedSyntheticBurnConsumer.mjs` are explicit **synthetic-only** filesystem/attestation rehearsals; their objects and signatures are not a Vault-backed, authenticated, secret-key-custodied production one-shot API. No independently verified production worker/credential lifecycle exists.

### F2 — Durable one-shot authority not connected to a committed reveal: BLOCKED (critical)

The proposed PG17 migration `20261012213000` defines a FORCE-RLS append-only burn reservation with a unique evaluation identity and an intentionally non-authorizing return `BURN_INSERTED_IN_TRANSACTION_NOT_AUTHORIZED`. A success returned **inside an uncommitted transaction cannot authorize secret material access**. No actual isolated Vault worker is wired to **independently verify committed** `REVEAL_STARTED`, reserve, finalize/commit, then perform exactly one encrypted read and evaluation. Crash/restart/retry race with an actual worker and remote store remains unproven. Do not turn this denial-only writer into a permission flag.

### F3 — Real ordinary Research/Validation read + embargo: BLOCKED (critical)

`researchExecutionService.ts` and `validationExecutionService.ts` use either a strictly local development **fictional** fixture provider or `deniedAndJournaledResearchMaterialProvider.ts`, which always refuses real bytes with `RESEARCH_MATERIAL_ACCESS_UNPROVEN`. The central `ordinaryResearchDatasetMaterialRead.ts` verifies series hashes before delegating, but explicitly has **no authoritative embargo admission or provider mapping yet**; access by lower-level trusted writers must be inventoried. `blindTruthDatasetScopeClassification.ts` intentionally returns DENY/UNPROVEN, never ALLOW. A no-overlap assertion from unverified data/identity sources must never authorize reads. **Do not lift the registration lock** or mark ordinary real Research runnable without verified Core market identity, all-source read journal, concurrency lock across byte fetch/release and negative replay.

### F4 — Provider/custody and broad access planes: BLOCKED (critical)

A different Supabase project alone is insufficient when the same organization has privileged administrators. Require explicit custody, least-privilege host identity, proof ordinary application roles cannot obtain Vault credentials, authenticated HTTP/Vault-anon and signed-URL/S3 negative paths, database grants and SQL/Edge/admin API inventory, rotation and backup/recovery. **Do not transmit a PRIMARY `sb_secret_*` key to a VAULT hostname again.** Any previously exposed key requires a controlled rotation assessment; do not revoke without dependency inventory and owner approval.

### F5 — Public scientific projection: NARROW, NOT an outcome authority

`blindTruthPassportProjection.ts` exposes public hashes, event ordering and `overallOutcome:null`. It explicitly rejects unverified `REVEAL_COMPLETED`. Proposed `20261012220000` migration creates tenant/principal/membership/investigation/operation-scoped Passport-only SELECT policies under FORCE RLS; **not deployed**. Provisional historical `DEFERRED_RL9` on missing policies is valid. It must not be counted as real scientific metric-result completion.

## Minimal executable closing sequence — no arbitrary new PR chain

1. **Consolidate the current Draft stack** under PR #153 and review the exact 7 pending PG17 migrations, writer ownership/ACL/RLS, provider audit gaps and intended accepted predecessor. Keep everything pre-production until evidence passes.
2. **Build the actual isolated Vault boundary** behind a narrow service contract (not ordinary app import): independently controlled Vault credential/key custody, authenticated private ciphertext adapter, durable anti-reuse keyed index, unforgeable committed-claim attestation, strict one-shot consume/fail-closed crash-recovery. Test synthetic first, no actual confidential holdouts until all gates pass.
3. **Complete real embargo admission** for ordinary Research and registration concurrently: verified point-in-time Core market/field mapping, all-source/cache/derived/export read journaling, lock ordering and durable non-exposure proof. Negative tests must reject every bypass; positive tests may admit verified non-embargoed material only after exact server-side authority checks.
4. **Verify all material boundaries** in a disposable PostgreSQL 17 environment and separately managed Supabase preview with real transport, authenticated HTTP Storage/anon denials, tenant isolation, synthetic full registration→seal→commit→burn→single read→evaluation→terminal event and crash/race/idempotency.
5. **Full independent final gate**: audit complete cumulative diff, migration drift, exact SHA tests/CI/Vercel, audit signatures/provenance and explicit owner authorization **before** any Production merge/migration/deploy. RL-9D evaluator + RL-9E production/acceptance gates remain distinct contractual phases.

**STOP RULE:** no real holdout data, confidential truth ingestion, production DDL/DML, app-access bypass, "green" synthetic metrics as live evidence, automatic merge or Live financial authority until each applicable gate is proven. Investing and Trading Core remain independent of optional Lab availability.

**Disposition:** `RL9C_RISK_AUDIT_RECORDED / REAL_WORKER_AND_EMBARGO_BLOCKED / STACK_UNMERGED / PRODUCTION_UNCHANGED / NOT_ACCEPTED`. This audit creates **no new scientific authority** and cannot by itself advance the accepted predecessor.
