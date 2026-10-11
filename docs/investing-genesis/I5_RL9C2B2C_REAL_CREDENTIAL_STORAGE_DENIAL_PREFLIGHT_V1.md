# RL-9C2B2C — Real Credential / Private Storage Isolation Preflight

Status: EXECUTABLE_CANDIDATE / REAL_INFRASTRUCTURE_UNPROVISIONED / NOT ACCEPTED / REAL_VAULT_NOT_OPERATIONAL.

Predecessor: RL-9C2B2B post-merge lint correction, accepted predecessor `8bb1c840aeb0200c2586c5b6038c1c4c2f75d5d9`.

## Minimum security outcome

A real private Vault storage account/project with a separate identity and protected worker must be provisioned **only after owner approval of provider, organization, costs and custody**. Never reuse the inactive `portfolio` Supabase project without full inventory and explicit authorization. The main project `service_role` cannot secure a Vault bucket within the **same** Supabase project: service-role Storage API keys bypass RLS, per official Supabase Storage documentation.

A *synthetic* canary must be created in the separately authorized **private** storage project under an explicitly dedicated bucket, **not** in Research/AI/Passport. Marker bytes must be exactly:

`SYNTRAKE:RL9C2B2C:SYNTHETIC_CANARY_V1\n`

No real holdout, salt, secret truth, ciphertext, or private secret locator is admitted. Object name must be `rl9c2b2c-isolation-canary-v1/<32 lowercase hex>.txt`.

## Three controlled read-only phases (one executable, distinct operators/principals)

`VAULT_POSITIVE`: trusted independent Vault operator reads the exact synthetic object via Vault-owned credential; HTTP 200 and exact marker bytes are mandatory.

`PRIMARY_DENIAL`: security auditor with a separately mounted actual **primary** project credential first demands HTTP 200 when querying the primary project's own Storage bucket listing. Then it must receive **401 or 403**, not 200 or 404, from the identical Vault canary URL.

`ANONYMOUS_DENIAL`: no user-session JWT or privileged credential is supplied, but a Vault publishable/legacy anon API key is mandatory. An HTTP 401 on a request missing `apikey` is only a gateway refusal, even for a public bucket, and NEVER isolation evidence. The authenticated-by-gateway `anon` role must be denied the same extant private canary (401/403); public reads returning 200 are blocked. The public key's active project membership must be confirmed independently before claiming a real result.

Authentication is role-format-aware. Privileged phases require a correctly shaped `sb_secret_*` key or a legacy JWT containing `role: service_role`; the anonymous phase requires a Vault `sb_publishable_*` key or legacy JWT containing `role: anon`. The legacy JWT claim is only a local precheck, not signature verification. Modern keys travel in `apikey` without Bearer; legacy JWT credentials also use `Authorization: Bearer`. A real provider positive-control request is mandatory for the primary secret; the Vault public key's authenticity/active status must be independently confirmed by the Vault operator.

Every phase uses HTTPS `*.supabase.co` with independently validated 20-character project references and fetch redirect=`manual`/cache=`no-store`, timeout and bounded reads. Reports include only a fixed phase/status, a synthetic subject digest, and a bounded evidence code; they contain **no** credentials, URLs, bucket names, or object locators. The digest binds the **primary project ref**, Vault project ref, private canary path, bucket and exact marker bytes. All three phase reports must show the same subject digest. They are not cryptographically signed, so a trusted external auditor must witness execution and preserve the as-of, provider/credential custody evidence and exact Git SHA separately.

**CRITICAL:** These are test-only canaries. A 401 with an invalid fabricated primary credential is NOT proof of isolation; primary self-project positive control is mandatory. A missing canary returning 404 is NOT proof either. The combined three-phase report is necessary but not sufficient to declare the whole Vault production-safe.

## Controlled execution

This script is standalone Node 20+; it MUST NOT be imported by ordinary Next/Trading/Investing runtime. It does not create buckets, keys or migrations; no endpoint or application route is exposed. It is read-only and intentionally has **no scheduled CI workflow carrying real service credentials**.

Each phase is run under a distinct operator-controlled Linux principal/host with **owner-only 0600 non-symlink credential and config files outside the repository**, never env-value credentials. Set only:

`SYNTRAKE_VAULT_C2C_PHASE` to `VAULT_POSITIVE` or `PRIMARY_DENIAL` or `ANONYMOUS_DENIAL`.

`SYNTRAKE_VAULT_C2C_CONFIG_FILE` to an absolute private JSON file with exactly `primaryProjectRef`, `vaultProjectRef`, `bucket`, and `objectPath`.

`SYNTRAKE_VAULT_C2C_CREDENTIAL_FILE` to the privileged phase's owner-only mounted secret file. For `ANONYMOUS_DENIAL` set `SYNTRAKE_VAULT_C2C_PUBLIC_KEY_FILE` instead, pointing to the independently verified active low-privilege Vault API key. Files must have UID ownership and 0600 or stronger permissions. Never place credential material in git, application process environment, project logs, GitHub Actions or Vercel. The operator environment fails closed if it contains ordinary credentials.

Invoke: `node scripts/investing/rl9c2b2cStorageIsolationProbe.mjs` from a dedicated Linux security workstation. The script's JSON result should be retained only in restricted audit evidence storage.

## Additional gates before a real Vault exists

- Approve an independent provider/project, billing, credential owner, key custody and restricted network; prove no ordinary app identity can assume Vault identity.
- Provision private canary with documented provider/as-of, bucket privacy and independent secret distribution; test both key-based and anonymous denials using **actual** primary credentials.
- Verify unforgeable evidence (signed attestation or independently observed logs), primary and Vault key rotation, backups/restore, revocation, and least privilege.
- Independently verify that the real primary `service_role` lacks access through all APIs (Storage/S3, SQL/DB, admin, signed URL, shared IAM), not just the single REST GET tested here.
- Require embargo completeness, HMAC reuse/nonce correctness, real ledger/state isolation, fail-closed one-shot claim/reveal, recovery, and actual deployment security reviews before real holdouts are accepted.

**No acceptance from this candidate alone**: RL-9C still IN_PROGRESS; RL-10 / RL-11 not reached. No production changes permitted by this document.

## Independent code-audit correction — credential and gateway validity

A missing anonymous API key can produce HTTP 401 at the Supabase gateway before any bucket ACL is evaluated. The corrected preflight requires a Vault publishable/anon key; a privileged credential cannot pass as the anonymous principal. The primary-denial phase rejects publishable keys and legacy JWTs with a non-service_role claim even if a mocked transport responds 200. Format checks are necessary, not sufficient: independent provider control-plane proof of publishable-key validity, project membership and custody, real positive/negative execution and immutable evidence remain outstanding. Code-only CI cannot demonstrate actual real credential isolation.
