# RL-9C2B2G — Signed Committed Burn Attestation (Synthetic)

**Status:** `DRAFT / EXECUTABLE_TEST_INTEGRATION / NOT_REAL_VAULT_AUTHORITY / NO_ALLOCATION_OR_PRODUCTION`.

Unaccepted immediate predecessor Draft PR #151: `ff30f860274c8476088b281101b7a4e8adc54ea5`. Accepted main remains unchanged; all PRs #138–#151 are independent unmerged candidates, and all live holdout registrations remain blocked.

## Specific improvement over B2F

Previously the synthetic private worker accepted a caller-supplied event hash and evaluation hash. The B2F PostgreSQL test verified a committed `REVEAL_STARTED` event and consume reservation **in the same test**, but no cryptographic message bound that proof to the object the worker would consume.

This candidate adds `workers/investing-blind-vault/privateSignedSyntheticBurnConsumer.mjs`: a **worker-private, never-routed** consumer facade using an exactly pinned Ed25519 SPKI public key. The signer is an **independent fixture identity** that exists only in a disposable test. Its test-only issuance procedure is:

1. Commit the real RL-9B2 `REVEAL_STARTED` event.
2. Commit the B2F `BURNED_NOT_AUTHORIZED` reservation in real disposable PG17.
3. Perform a fresh PostgreSQL read of the **committed, joined event and reservation rows** and verify tenant, registration, evaluation and event identity.
4. Stage AES-GCM *fictional* ciphertext privately. Only then generate an Ed25519 keypair in the privileged test harness and sign one narrow, 60s-or-less token binding `tenantId`, `registrationHashHex`, `evaluationHashHex`, `revealStartedEventHashHex`, `burnReservationId`, `burnState=BURNED_NOT_AUTHORIZED`, `privateObjectLocator`, `audience=ISOLATED_VAULT_SYNTHETIC_TEST_ONLY`, strict issue/expiry times, and a domain/schema tag.
5. The worker verifies the pinned SPKI SHA-256, Ed25519 signature, exact canonical key schema, fixed audience, all identifiers, bounded TTL and narrow clock skew; only then does it call the previously tested synthetic filesystem consume-once primitive.
6. PG17 + private POSIX tests must prove repeat attempt refused by both PostgreSQL and the worker; independent pure-worker tests reject forged/changed fields, changed tenant or object, wrong key, wrong audience, malformed base64/signatures, expired/future tokens, accessor/prototype injection and copied ordinary credentials.

**No plaintext is exposed to any HTTP endpoint.** The synthetic facade returns only encrypted-envelope bytes for the fixture harness. The existing real mTLS ingress `isolatedServer.mjs` remains limited to liveness and a constant `503 VAULT_UNAVAILABLE` readiness; it never imports this facade. Neither ordinary Investing/Trading nor any public Vercel route can invoke it.

## Limits and mandatory production gates

A cryptographically signed *claim* is not proof that its signer was correctly authorized. Here the signer is a privileged disposable PG17 **test**; no real server owns a verified issuance API, no Vault keys or certificates are provisioned, no production host or secret state exists, and no full provider/cache embargo or historic non-exposure audit exists.

This change does NOT establish an authorized real secret consumption protocol, complete cross-process delivery/execution atomicity, cross-host or backup anti-reuse, cryptographic key rotation/revocation, multi-tenant mTLS client provisioning, canonical deterministic evaluator, reveal result lineage, nor automatic Trading Live mandates. It is intentionally impossible to obtain a `REAL` mode/ALLOW/read-secret response from this module.

This is a tangible **contract-level bridge with an executable PG17 fixture**, but operational RL-9 acceptance must still await a server-owned signer authenticated through tenant authority and authoritative DB state, a separate audited Vault credential with strict attestation verification, full byte-read/no-exposure evidence and evaluator/reconciliation closure. No merge, Production DDL/DML, Vercel Production deploy, real Vault spend, secret addition, financial mutation or change to supported real users is authorized.
