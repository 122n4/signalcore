# I5 RL-9C2B2D — Independent Secret Vault Infrastructure Admission V1

Status: `DESIGN_CANDIDATE / NOT_ACCEPTED / NO_INFRASTRUCTURE_PROVISIONED / REAL_HOLDOUTS_BLOCKED`.
Accepted Git predecessor: `eed8d65d2facf83edd9736c8815d3f18faf2816b`. This file is an operator provisioning and independent-audit checklist, **not** an authorization token or an executable authority substitute.

## Purpose and minimum decision

Complete the real infrastructure/security boundary needed to use the accepted RL-9C2B2C **read-only** preflight with actual credentials and **only an explicitly synthetic canary**. A successful preflight is required, but is not sufficient, to enable any real holdout. No Lab feature may become a dependency of Investing Core or Trading Core. `service_role` is a capability, never scientific or reveal authorization.

As-of 2026-10-11 (read-only Supabase inventory):
- Primary organization `gdttkvgpfohoxwyguiuu`, `Signal core`, plan `pro`.
- Primary project `qdnvbamoamtkujzwrxdb`, `eu-west-1`, `ACTIVE_HEALTHY`.
- Historical project `haqvskoudtpyuohdnlbn`, `portfolio`, `INACTIVE`, in the **same** organization. DO NOT reuse, reactivate or migrate it as Vault without separate inventory and authorization.
- Primary database migration count: 110. This design candidate makes no schema or storage changes.
Recheck every fact at execution time. A project name, client-provided ID or database `service_role` is not proof of ownership or grant.

## Candidate infrastructure choice — NOT an approved purchase

Preferred implementation **for the first real canary rehearsal**:
1. Owner-controlled **new Supabase organization** (not `gdttkvgpfohoxwyguiuu`) with a new **project** in `eu-west-1` and a *private* synthetic-only Storage bucket. This uses the existing operator-side RL-9C2B2C preflight.
2. A separate, hardened Linux worker runtime/principal and separate secrets custody. Existing worker code is mTLS test-only, binds loopback, and has no seal/reveal endpoint. A network tunnel or private ingress and independent certificate lifecycle require a later, separately reviewed integration.
3. No ordinary Vercel/Next process, normal Investing/Trading job, public client, GitHub runner, shared administration token or ordinary `service_role` may possess Vault project secrets, KMS keys or private-object locators.
4. A separate organization is **not** proof of human administrative separation. Any shared Supabase owner/admin account, OAuth connection, Personal Access Token, SSO recovery route, CI credential or provider-level break-glass principal can still be an authority bridge. Enumerate/review these explicitly. The minimum current objective is isolation from ordinary application `service_role`; stronger admin/insider isolation remains a separate threat model gate.

Official indicative price, 2026-10-11: Supabase Pro **starts at USD 25/month with one Micro project**; another Micro project in an already paid Pro organization starts at **about USD 10/month**. Costs may vary with taxes, compute, storage, egress, log drains, key-management and worker hosting. Provider pricing does **not** replace a current organization-specific quote. Free plan may be useful for short disposable synthetic rehearsal, but inactivity pausing and missing paid protections make it unsuitable as evidence of production continuity. Alternative Cloudflare R2 has a Standard free allowance but requires a separately designed S3 adapter, key policy, audit chain and durable transactional private ledger, so is NOT an interchangeable drop-in backend.

**Before ANY charge or resource mutation:** the owner must explicitly select provider, new/existing organization, subscription and region; name the private credential custodian and approve the exact quote and maximum budget. For Supabase, request the provider's project cost for the selected actual organization, present it and obtain explicit confirmation. If the new organization does not exist yet, its creation and billing acceptance is a distinct owner action. This document cannot provide approval. No unattended cost action.

## Admission sequence (strict order; synthetic material only)

**G0 — Owner authority and budget (BLOCKED):** record explicit scope, plan, paid/Free decision, region, payer and stop/rollback authority, plus dedicated worker and KMS/secrets cost estimates. Check administrative principals, MFA, recovery access and cost ceilings. No secrets or privileged tokens in ChatGPT, Codex, Git, CI, Vercel preview or public logs.

**G1 — Physical isolation (BLOCKED):** owner provisions independent organization/project and a separate worker host/principal. Verify organization ID differs from primary, secret sources differ, privilege path from ordinary Vercel app/worker and primary `service_role` to Vault is absent, and Vault data is not mounted or replicated in the primary system. Protect independent network entry, TLS trust and key management. Inventory all owner/admin/API-token overlaps.

**G2 — Synthetic private canary (BLOCKED):** dedicated Vault operator creates only the exact marker `SYNTRAKE:RL9C2B2C:SYNTHETIC_CANARY_V1\n`, one random 32-hex object name in the dedicated private bucket. No real holdout, decryption key, commitment salt, HMAC index or scientific truth. Independently attest bucket privacy, public/S3 routes, project identity and canary exact bytes. Record provider and as-of in restricted evidence.

**G3 — Real-credential read-only denial (BLOCKED):** run the accepted RL-9C2B2C script on separate operator-controlled Linux principals, with owner-only credential/config files outside the repository and no ordinary application secrets in the environment. Required positive: Vault key reads exactly the marker (200); primary **actual privileged key** works against its own project (200) but returns 401/403 for the same Vault object; Vault publishable/anon key returns 401/403 for that same object. Never count 404, invalid keys, redirects, missing-key gateway 401 or transport failures as proof. Match reports' exact subject digest, source SHA, provider/as-of and custody.

**G4 — Independent adversarial access paths (BLOCKED):** separately test ordinary application process, primary `service_role`, browser/anon, research optimizer, Trading, direct SQL/postgres, Storage REST, S3, signed URL, organization admin/PAT and shared-network/backup paths. Real-denial findings must not reveal secret contents. Public/signed objects, shared root/account permissions or unenumerated backdoors block the gate.

**G5 — Recovery and actual security controls (BLOCKED):** prove audit evidence binding (trusted/signed attestation), independent backup/restore, rotation/revocation, monitoring/alerting, unavailable-provider fail closed, separation of KMS keys, and custody of durable anti-reuse/one-shot state. One canary read does NOT prove embargo, one-shot reveal, HMAC anti-reuse, confidential evaluation or RL-9 closure.

**G6 — New acceptance gate:** independent auditor compares real provider configuration and witnessed evidence to exact Git SHA. In the absence of ANY required evidence or after mismatch: `BLOCKED / REAL_HOLDOUTS_FORBIDDEN`. Only a separately authorized code/DB/worker acceptance could later enable real encrypted holdouts. No automatic unlock based on this document, a canary PASS, or a green CI.

## Immediate boundaries

- This candidate authorizes **NO** Supabase project/org/bucket creation, secret or key generation, service access, host provisioning, migration, DDL/DML, Git merge, or Production deployment.
- Production resources, financial truth, tenant auth, RL-9B embargo and execution/reveal authority remain unchanged.
- Allowed now: independent read-only inventory, price/security comparison, operator instructions and a reviewable documentation PR.
- STOP if a plan/cost is not explicitly confirmed, if only the existing organization is available, if administrator identities overlap beyond the threat mandate, if privileged credentials would enter shared automation, or if a provider's 401 can be explained without enforcing Vault private-object policy.

## References (verify as-of before execution)

- Supabase Pricing: https://supabase.com/pricing
- Supabase organization access control: https://supabase.com/docs/guides/platform/access-control
- Supabase API keys: https://supabase.com/docs/guides/getting-started/api-keys
- Supabase Storage private buckets: https://supabase.com/docs/guides/storage/buckets/fundamentals
- Accepted code preflight: `scripts/investing/rl9c2b2cStorageIsolationProbe.mjs`.
- RL-9 accepted design: `I5_RL9_BLIND_TRUTH_EVIDENCE_VAULT_V1_DESIGN_FREEZE_V1.md`.

What this candidate supersedes: **nothing**. It is a provisioning proposal downstream of the existing accepted RL-9 design and cannot compete with the accepted source contracts.
