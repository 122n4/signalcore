# I5 RL-9C2B2D — Zero-Incremental-Spend Vault Development / Deferred Infrastructure Admission V1

Status: `ZERO_ADDITIONAL_INFRASTRUCTURE_SPEND / DESIGN_CANDIDATE / NOT_ACCEPTED / REAL_HOLDOUTS_BLOCKED`.
Accepted Git predecessor: `eed8d65d2facf83edd9736c8815d3f18faf2816b`. This file is an operator provisioning and independent-audit checklist, **not** an authorization token or an executable authority substitute.

## Purpose and minimum decision

Complete the real infrastructure/security boundary needed to use the accepted RL-9C2B2C **read-only** preflight with actual credentials and **only an explicitly synthetic canary**. A successful preflight is required, but is not sufficient, to enable any real holdout. No Lab feature may become a dependency of Investing Core or Trading Core. `service_role` is a capability, never scientific or reveal authorization.

As-of 2026-10-11 (read-only Supabase inventory):
- Primary organization `gdttkvgpfohoxwyguiuu`, `Signal core`, plan `pro`.
- Primary project `qdnvbamoamtkujzwrxdb`, `eu-west-1`, `ACTIVE_HEALTHY`.
- Historical project `haqvskoudtpyuohdnlbn`, `portfolio`, `INACTIVE`, in the **same** organization. DO NOT reuse, reactivate or migrate it as Vault without separate inventory and authorization.
- Primary database migration count: 110. This design candidate makes no schema or storage changes.
Recheck every fact at execution time. A project name, client-provided ID or database `service_role` is not proof of ownership or grant.

## Owner's current decision — NO additional paid infrastructure

Owner direction (2026-10-11): **there is no VPS**. Do not assume any existing standalone worker/host. The user already pays for Supabase Pro and operates GitHub/Vercel, and currently elects **NO additional paid project, second Pro organization, VPS, managed Vault, KMS or other recurring spend**. Prior discussion about a new Pro organization was an unapproved option, not a purchase or a mandatory dependency.

**Track A, now — implement/test software without provisioning:**
- Continue bounded deterministic RL-9 contracts, guards and synthetic test vectors in isolated code candidates/PRs, using already connected GitHub CI and Vercel Preview only within existing subscription limits; do not claim that CI/storage usage itself is guaranteed to be free.
- Build canonical holdout-scope overlap and deny policies, provider/field mapping ambiguity rejection, evidence/access-audit completeness checks, HMAC anti-reuse *simulations*, idempotent one-shot state transition contracts and crash/retry negative tests. No actual registration may be admitted without durable embargo and real provenance.
- Explicitly disable real seal/reveal/holdout ingestion, confidential key generation, hidden-truth storage and live Vault worker availability. `NO_REAL_HOLDOUT` or `BLOCKED` is the correct outcome. Existing mTLS/Linux/Supabase preflights remain **synthetic/test-only**.
- Ordinary Supabase Storage or Postgres may store **public metadata only** within accepted migrations, never real holdout secrets or their decrypt keys in this stage. Do not introduce unreviewed writes or schema changes.
- Research Lab remains optional and must never become a runtime dependency of Investing Core or Trading Core. Do not hold core product work hostage to paid Lab infrastructure.

**Track B, deferred — physical Vault proof only when its owner authorizes real infrastructure:**
- A **separate Supabase project in the existing Pro organization** is one possible lower-cost option, but additional Compute fees apply and organization owners/admins remain a shared privileged plane.
- A **separate Pro organization/project** may improve administrative scope but brings a separate subscription, and the same human/API administrator across both organizations still collapses that boundary.
- A third-party object store or privately hosted worker can work only with separately proved IAM, independent key custody, immutable access evidence and a durable transactional one-shot index. No existing VPS is available. Storage-free-tier marketing is not a security proof and may require additional services.
- Encrypting ciphertext in the existing primary Supabase project with an **independently held, unavailable-to-primary** decryption key can protect confidentiality against a compromised primary service-role, but does **not** protect ciphertext secrecy/integrity/availability, and may fail the accepted Vault authority/access-isolation mandate. If a key is in the same ordinary Next/Vercel environment or administrative control plane, this isolation is not established.
- Any future solution needs an explicit threat-model decision, real access-denial/rotation/recovery rehearsal, provider-specific price/terms, separate budget authorization and custody ownership. No solution is selected or provisioned now.

**Forbidden inference:** A green CI, synthetic AES/mTLS/UID result, mock HTTP denial, code-only read probe, Supabase RLS policy, or new bucket/project by itself **never** changes `REAL_HOLDOUTS_BLOCKED`.

## Admission sequence (strict order; synthetic material only)

**G0A — Code-only development (AUTHORIZED SCOPE):** zero incremental infrastructure purchases; deterministic guards and synthetic tests in separately audited PRs; no real holdouts/keys/private object creation, no production writes, no external service activation. **G0B — Paid infrastructure (DEFERRED / BLOCKED):** future owner must choose provider/organization/plan/region/custodian and explicitly approve a current total quote with a spending ceiling; enumerate administrator/MFA/recovery paths. No credentials in ChatGPT, Codex, Git, CI, Vercel or logs.

**G1 — Physical isolation (DEFERRED / BLOCKED):** owner provisions a separately authorized account/project/storage provider and independent worker/identity, with exact security boundary appropriate to the owner-approved threat model. Verify primary `service_role` and ordinary Vercel process cannot access Vault secret material, provider IAM, private object or independent keys; enumerate admin/PAT/root/CI/recovery bridges. Prove actual boundaries rather than assuming that a second project or organization is enough.

**G2 — Synthetic private canary (BLOCKED):** dedicated Vault operator creates only the exact marker `SYNTRAKE:RL9C2B2C:SYNTHETIC_CANARY_V1\n`, one random 32-hex object name in the dedicated private bucket. No real holdout, decryption key, commitment salt, HMAC index or scientific truth. Independently attest bucket privacy, public/S3 routes, project identity and canary exact bytes. Record provider and as-of in restricted evidence.

**G3 — Real-credential read-only denial (BLOCKED):** run the accepted RL-9C2B2C script on separate operator-controlled Linux principals, with owner-only credential/config files outside the repository and no ordinary application secrets in the environment. Required positive: Vault key reads exactly the marker (200); primary **actual privileged key** works against its own project (200) but returns 401/403 for the same Vault object; Vault publishable/anon key returns 401/403 for that same object. Never count 404, invalid keys, redirects, missing-key gateway 401 or transport failures as proof. Match reports' exact subject digest, source SHA, provider/as-of and custody.

**G4 — Independent adversarial access paths (BLOCKED):** separately test ordinary application process, primary `service_role`, browser/anon, research optimizer, Trading, direct SQL/postgres, Storage REST, S3, signed URL, organization admin/PAT and shared-network/backup paths. Real-denial findings must not reveal secret contents. Public/signed objects, shared root/account permissions or unenumerated backdoors block the gate.

**G5 — Recovery and actual security controls (BLOCKED):** prove audit evidence binding (trusted/signed attestation), independent backup/restore, rotation/revocation, monitoring/alerting, unavailable-provider fail closed, separation of KMS keys, and custody of durable anti-reuse/one-shot state. One canary read does NOT prove embargo, one-shot reveal, HMAC anti-reuse, confidential evaluation or RL-9 closure.

**G6 — New acceptance gate:** independent auditor compares real provider configuration and witnessed evidence to exact Git SHA. In the absence of ANY required evidence or after mismatch: `BLOCKED / REAL_HOLDOUTS_FORBIDDEN`. Only a separately authorized code/DB/worker acceptance could later enable real encrypted holdouts. No automatic unlock based on this document, a canary PASS, or a green CI.

## Immediate boundaries

- This candidate authorizes **NO** Supabase project/org/bucket creation, secret or key generation, service access, host provisioning, migration, DDL/DML, Git merge, or Production deployment.
- Production resources, financial truth, tenant auth, RL-9B embargo and execution/reveal authority remain unchanged.
- Allowed now: independent read-only inventory, architecture/security comparisons, documentation PR and **separate zero-new-cost executable deterministic/test-only slices** subject to ordinary GitHub gates. No new resource creation or real secrets.
- STOP any REAL Vault admission if there is no independently evidenced isolation, if provider identity or plan/cost is unapproved, if administrator/root/token overlap exceeds the threat mandate, if privileged credentials would enter shared automation, or if a provider's 401 can be explained without Vault object policy enforcement.

## References (verify as-of before execution)

- Supabase Pricing: https://supabase.com/pricing
- Supabase organization access control: https://supabase.com/docs/guides/platform/access-control
- Supabase API keys: https://supabase.com/docs/guides/getting-started/api-keys
- Supabase Storage private buckets: https://supabase.com/docs/guides/storage/buckets/fundamentals
- Accepted code preflight: `scripts/investing/rl9c2b2cStorageIsolationProbe.mjs`.
- RL-9 accepted design: `I5_RL9_BLIND_TRUTH_EVIDENCE_VAULT_V1_DESIGN_FREEZE_V1.md`.

What this candidate supersedes: **the earlier, unaccepted cost-first recommendation within this same candidate PR only**. It is not an amendment to the accepted RL-9 design and cannot compete with that authority. `RL-9`, `RL-10`, `RL-11` remain **IN_PROGRESS**, not accepted or waived. Removing required security gates would need a separately authorized design amendment; none is made here.
