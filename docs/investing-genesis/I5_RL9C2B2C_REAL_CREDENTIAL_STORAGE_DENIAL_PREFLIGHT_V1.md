# RL-9C2B2C — Supabase project-scoped credential / private Storage preflight

**Current status (2026-10-13):** `SAFE_PREFLIGHT_CANDIDATE / PRIMARY_CROSS_HOST_TEST_RETIRED / PROVIDER_SCOPE_VERIFIED / VAULT_CANARY_POSITIVE_OBSERVED / ANONYMOUS_DENIAL_UNTESTED / ADMIN_ISOLATION_UNPROVEN / NOT_ACCEPTED / REAL_VAULT_NOT_OPERATIONAL`.

Canonical historical reference: RL-9C2B2B accepted predecessor `8bb1c840aeb0200c2586c5b6038c1c4c2f75d5d9`. This document updates *only* the operator-side isolation preflight. It does not approve RL-9C, a real Vault worker, operational data, live holdouts or any production permission changes.

## Independent real infrastructure facts (read-only Supabase provider inspection, 2026-10-13)

- PRIMARY project: `qdnvbamoamtkujzwrxdb`, PG17, `ACTIVE_HEALTHY`.
- Vault project: `nlgxqbggvgigcggaybas`, `syntrake-blind-vault`, PG17.11, `ACTIVE_HEALTHY`, physically separate Supabase project reference/DB endpoint.
- **Both projects belong to Supabase organization `gdttkvgpfohoxwyguiuu`.** Separate project reference is **not** independent organization-level admin custody, IAM isolation, broker/execution authority, or key segregation.
- Vault bucket `syntrake-private-canary`: `public=false`; Vault `storage.objects` has no SELECT/INSERT/UPDATE/DELETE policies; exactly one real synthetic canary under `rl9c2b2c-isolation-canary-v1/`. No actual holdout data should be introduced.
- Lack of policies does not constrain `service_role` or an administrator who can change infrastructure. Separate control-plane/secret-custody proof is still required.

The canary bytes are exactly `SYNTRAKE:RL9C2B2C:SYNTHETIC_CANARY_V1\n`; its path is restricted to `rl9c2b2c-isolation-canary-v1/<32 lowercase hex>.txt`. Never substitute a real secret, holdout, salt, encrypted truth or Research/AI/Passport locator.

## Live results — retain provenance, do not reinterpret

1. `VAULT_POSITIVE`: the operator executed the genuine Vault-owned credential against the Vault's private synthetic canary, returning **HTTP 200** and the exact 38 bytes. Owner report: `PASS`, bound subject digest `83c09bdcc0dd228ac543b899ad219092c4db1e7413e8d0b77589d74272e25970`. The present source change does **not** replace or invalidate those observed bytes.
2. Primary self-project Storage listing: Supabase logs independently show the PRIMARY credential was accepted with **HTTP 200** on the PRIMARY endpoint. This is a historical positive observation, not a newly executed `PRIMARY_SELF_CONTROL` report from the revised code.
3. Previous `PRIMARY_DENIAL`: primary 200 then Vault synthetic object endpoint **HTTP 400 / InvalidRequest** / `headers must have required property 'authorization'`, observed on multiple runs. **BLOCKED**, because the Vault rejected the shape of a request missing the required Authorization header; this does not demonstrate checking the PRIMARY identity at the Vault authorization layer.
4. Previous `PRIMARY_KEY_GATEWAY_DENIAL`: primary 200 then Vault bucket-list endpoint returned the **same structural HTTP 400**. **BLOCKED**. Repeating the request cannot upgrade the evidence. No HTTP 400 counts as a security denial.
5. `ANONYMOUS_DENIAL`: **NOT RUN / NOT PROVEN**. Local mock tests and provider metadata cannot replace a Vault-local authenticated HTTP result.

Two independent documentation sources govern the design:

- Supabase API keys: https://supabase.com/docs/guides/getting-started/api-keys — modern `sb_secret_*` keys are project-scoped application credentials, **not JWT bearer tokens**; do **not** send secrets to a host other than the owning project's Supabase endpoint. Protect keys from chat, logs, GitHub/CI, web clients and foreign destinations.
- Supabase private Storage downloads: https://supabase.com/docs/guides/storage/serving/downloads — private `/storage/v1/object/authenticated/` access requires a valid user Authorization context (or a separately signed URL); a generic gateway error is not RLS/object-denial evidence.

**Security finding:** the original cross-project test transmitted a PRIMARY secret as an `apikey` to a Vault endpoint. This violated the provider's secret-scoping guidance. There is no confirmed third-party disclosure in available evidence; nonetheless, the primary secret's rotation/exposure assessment must occur under an explicitly approved credential-inventory and no-downtime rotation plan. Never revoke a key blindly while production may depend on it.

## Current safe operator phases — only same-project credentials

The standalone `scripts/investing/rl9c2b2cStorageIsolationProbe.mjs` is read-only, may run only on a dedicated Linux security workstation and **must not** be imported into application runtime.

- `VAULT_POSITIVE`: use a Vault-owned secret on **the Vault host only**; demand HTTP 200 and the exact synthetic canary bytes, no redirects or oversized bodies. This is a Vault credential/content integrity proof, not a broad admin boundary.
- `PRIMARY_SELF_CONTROL`: use a PRIMARY-owned secret on **the PRIMARY host only**; demand HTTP 200 from the primary Storage bucket-list API. Evidence is exclusively `PRIMARY_KEY_VALID_ON_OWN_PROJECT_ONLY`, never cross-project isolation.
- `ANONYMOUS_DENIAL`: use **only a Vault-owned publishable or legacy anon key**, first require successful Vault Auth gateway positive control, then demand **HTTP 401 or 403** on the exact private Vault canary. Generic HTTP 400, invalid own-key control, 404, 200, redirect, timeout or network error all **BLOCK**. A successful phase must still be distinguished from user JWT/RLS and cloud-admin-isolation proof.

**Permanently retired for this candidate:** `PRIMARY_DENIAL` and `PRIMARY_KEY_GATEWAY_DENIAL`. The CLI validates allowed phase names **before reading credential mounts**; these two names now yield `RL9C2B2C_BLOCKED`, and no outbound HTTP is sent. Future test designs must never transmit a project secret to another project's Supabase host. Previously downloaded/pinned WSL scripts from pre-fix SHAs are **unsafe and must not be run again**. Retain their redacted audit records if useful, but remove their execute permission locally and don't load their cached code with a real credential.

The HTTP helper independently enforces **expected project hostname**: HTTPS only, exact 20-character project ref, no alternate hostname/port, no userinfo, no URL query or fragment; `redirect: manual`, `cache: no-store`, an 8-second timeout and bounded streaming for the positive canary read. Every key-bearing request is constrained to its own project at the lowest transport level. No HTTP response body, credential, private URL, canary locator or token is printed.

### Sensitive input contract

- `SYNTRAKE_VAULT_C2C_PHASE`: one of the **three** phases above.
- `SYNTRAKE_VAULT_C2C_CONFIG_FILE`: secure absolute owner-only JSON file outside the repository with **exactly** `primaryProjectRef`, `vaultProjectRef`, `bucket`, `objectPath`.
- `SYNTRAKE_VAULT_C2C_CREDENTIAL_FILE`: owner-only credential mount, only for `VAULT_POSITIVE` and `PRIMARY_SELF_CONTROL`.
- `SYNTRAKE_VAULT_C2C_PUBLIC_KEY_FILE`: Vault publishable/anon mount, only for `ANONYMOUS_DENIAL`.

The probe checks secure path ancestry (non-symlink, root or current UID ownership, not group/world writable), file descriptor mode 0600, hard-link count one and size bound. Credentials never belong in command arguments, stdout/stderr, process environment values, repository, CI or Vercel. Operator must independently review any locally generated wrapper. A passed synthetic test is *not* a real credential or isolation acceptance.

Outputs are fixed phase, fixed evidence classification, status and deterministic `subjectDigest` bound to project refs + synthetic canary. Outputs are **not signed attestations**; evidence must be independently observed and stored with the exact Git SHA and provider/as-of separately.

## Canonical next gates before RL-9C2B2C / real Vault acceptance

1. **Provider project boundary — VERIFIED narrowly:** the projects are separate, live Supabase provider-scoped IDs and database endpoints; provider documentation says keys are project-scoped. This is *provider contractual assurance*, not an independently demonstrated private-object denial with foreign secret material.
2. **Vault anonymous/least privilege — PENDING:** establish using only Vault-public/anon identity and Vault-issued valid Authorization, or independently witnessed real read-only Postgres RLS tests. Zero policies and metadata alone do not prove every HTTP/S3 download path.
3. **Administration / IAM / custody — BLOCKED:** projects share an organization. Demonstrate restricted org administrators and independent Vault worker/custody or explicitly authorize a structurally separate org/provider after cost/governance review. No assumption that the PRIMARY application's lack of a Vault API key prevents Supabase org administrators from accessing both projects.
4. **Expanded attack surface — BLOCKED:** Storage authenticated and signed URLs, S3 keys, SQL service roles/grants, JWT signing provenance, Edge Functions, network/perimeter, rotation/revocation and off-host logging must be assessed. There must be no ordinary Investing/Trading app authority to read or mutate secret truth.
5. **Functional RL-9C secret holdout workflow — BLOCKED:** real worker operation, embargo, evidence integrity, HMAC/reuse/nonce correctness, one-shot consume/reveal concurrency, retry/idempotency, backup/recovery, custodian independence, and immutable audit have not been proved end-to-end.
6. **Authorization — BLOCKED:** no real holdouts, live financial actions, migrations, credential rotations, org moves, production deploy or merge without explicit owner authorization and a passing exact-SHA gate.

**Current decision:** RL-9C2B2C `SAFE_PREFLIGHT_CANDIDATE`; RL-9C `IN_PROGRESS / NOT_ACCEPTED`. Run Labs in standby only after remaining gates are evidenced. Continue Investing/Trading Core independently of optional Labs.
