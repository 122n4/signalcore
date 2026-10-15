# I5 RL-9C2B1 — Dedicated Worker mTLS Ingress V1

Status: GITHUB_DRAFT_CANDIDATE / NOT_ACCEPTED / SECRET_VAULT_NOT_OPERATIONAL

Predecessor: `86552fcc988abd0124b103ffff0034ef8d745b40` (RL-9C2A accepted code-only SHA).

## Scope

`workers/investing-blind-vault/isolatedServer.mjs` creates a TLS 1.3
server requiring a client certificate signed by a dedicated CA, **and**
matching an exact SHA-256 pin over that certificate's DER bytes. No
ordinary bearer credential (including Supabase `service_role`) authorizes
secret access. All endpoints require mTLS; only `GET /internal/live` can
return 204 and `GET /internal/ready` always returns 503 `VAULT_UNAVAILABLE`.
Every other path returns 404. NO `seal`, `open`, `list`, `search`, `preview`,
`stat`, `decrypt` or `consume` interface exists.

`startIsolatedWorker.mjs` is a separate runnable Node worker process. It
requires exact isolated mode, TLS private key / cert / client CA files under
absolute paths outside the current source tree, non-world-readable private
key files and a pinned client certificate SHA-256. It binds on IPv4 loopback
only. It rejects ordinary Next/Supabase/Trading/Clerk/Stripe credentials in
its environment and unexpected `SYNTRAKE_VAULT_*` startup configuration.
The boot executable does not depend on Next/Vercel or expose its functions
through the ordinary Investing Research barrel.

These are **technical checks**, not proofs that actual Production deployment
is separate. In particular, possession of a pinned certificate does not prove
scientific authority to seal a registration, bypass an embargo, or reveal.

## Synthetic test contract

`tests/investingGenesisI5Rl9c2b1VaultIsolatedIngress.test.ts` provisions
**temporary synthetic** CA, server and two client certificates using the
OpenSSL CLI during the tests. It verifies actual TLS negotiation, absence
of a cert, CA-signed but unpinned client, ordinary bearer-only attempts,
route-deny behavior, not-ready status, and fail-closed worker boot.
OpenSSL is a test prerequisite; no private key is committed to Git.

## Explicitly missing — future mandatory gates

1. **REAL independent infrastructure:** separate worker principal, isolated
   runtime/VM/container, independent secrets store, secret storage account,
   network access controls and audit trails. Not this code-only slice.
2. **REAL credential negative tests:** run against ordinary production-like
   Supabase `service_role`, `investing_app`, browser, AI/optimizer, Passport,
   Trading and ordinary provider paths. Synthetic mTLS tests alone DO NOT
   prove any of these properties in a deployed environment.
3. **Server-side scientific authority** reconstructed from accepted RL-9B
   registration/tenant/Investigation/scope/commitment/promotion and exact
   future `REVEAL_STARTED` event; never caller-supplied identities alone.
4. **Storage and key custody:** private object store, external KMS envelope
   key, per-key nonce uniqueness proof (random nonce alone is insufficient),
   rotation and crash-safe persistence. No holdouts admitted until audited.
5. **RL-9C3/4:** atomic embargo and evidence of prior non-exposure; confidential
   anti-reuse index across relabeling and rotations; durable one-shot consume
   fence independent of caller/retry/process.
6. **RL-9D/E:** evaluator with one-shot claim/reveal events, adversarial
   concurrency, managed preview and separately authorized Production gate.

## Authorization and acceptance

GitHub candidate branch and Draft PR publication are owner-authorized for
independent review. No merge, migration, credential provision, infrastructure
change, Production deployment, or real holdout ingest is authorized.
Main remains the predecessor until a separate reviewed integration gate.
Highest permissible result after successful independent tests:
`RL-9C2B1_MTLS_PROCESS_INGRESS_TESTED / PHYSICAL_ISOLATION_NOT_PROVEN`.

Do not call this a completed RL-9C2B or RL-9C Secret Evidence Vault.
