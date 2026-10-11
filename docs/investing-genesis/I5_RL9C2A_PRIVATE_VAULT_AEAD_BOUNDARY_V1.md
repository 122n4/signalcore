# I5 RL-9C2A — Private Vault Authenticated Envelope Boundary V1

Status: CANDIDATE / AES_GCM_ENVELOPE_EXECUTABLE / PHYSICAL_VAULT_ISOLATION_NOT_PROVEN

Canonical accepted predecessor SHA:
`20097996c1ca754a26ac81d4676983a3ccd2913e`

Authority: accepted RL-9 Blind Truth Design Freeze, RL-9B persistence and
merged RL-9C1 cryptographic primitives. No new scientific HashRef domain.

## Purpose and exact executable scope

This candidate provides a PRIVATE-WORKER-INTENDED AEAD envelope primitive
under `workers/investing-blind-vault/envelope.ts`. It is not exposed via
the Next app or the ordinary `lib/investing/research/index.ts` barrel.

Encryption: AES-256-GCM, 32-byte key, random 12-byte nonce, 16-byte
authentication tag, Node.js CSPRNG. Keys are injected by the future
isolated worker, not fetched from ordinary application env variables.

Exact authenticated associated data (AAD):

```text
UTF8("SYNTRAKE:BLIND_TRUTH_VAULT_ENVELOPE_AAD:V1\n")
+ UTF8(JSON.stringify({
  schemaVersion: "BLIND_TRUTH_VAULT_ENVELOPE_AAD_V1",
  tenantId,
  registrationHashHex,
  holdoutScopeDigestHex,
  commitmentHashHex,
  keyVersion
}))
```

AAD field order is fixed as shown. Tenant UUID is lowercase canonical;
three digests are 64 uppercase hexadecimal characters. `keyVersion`
is a closed token, not a key or cryptographic authority. All four binding
values must be independently derived and proven by the trusted worker from
accepted server-side RL-9B metadata; caller-supplied strings are NOT proof
of ownership or authority.

Envelope is a CLOSED secret-only operational record:

```text
schemaVersion = BLIND_TRUTH_VAULT_ENVELOPE_V1
algorithm     = AES_256_GCM
keyVersion
nonceHex      = 24 uppercase hex chars
ciphertextBase64 = canonical standard Base64
tagHex        = 32 uppercase hex chars
```

No plaintext, salt, encryption key, locator, ciphertext, nonce, tag or
`keyVersion` may be added to the accepted PUBLIC Vault Seal HashRef,
Passport or ordinary Research/AI path. This envelope is PRIVATE STORAGE
material only. AES-GCM integrity and the public salted SHA-256 commitment
are different invariants; on reveal both must be verified independently.

Envelope decrypt returns bytes only to a future dedicated worker that
has already proven durable `REVEAL_STARTED` and completed a successful
consume-once authorization transaction. The current primitive cannot
itself prove that prerequisite and MUST NOT be exposed as an API handler.
GCM tentative buffers and local key copies are zeroized on failure/success;
the caller must immediately zeroize any returned verified plaintext.

A temporary 8 MiB in-memory limit prevents unbounded allocation in this
early implementation. Production-sized holdouts require an independently
audited chunked streaming AEAD format, object manifest, resource ceilings
and atomic storage protocol before admission. Do not silently truncate
large holdouts or misrepresent this as a production ingestion engine.

## Threat model and hard non-claims

This repository-level code is NOT a physically separated secret capability.
It contains NO independent worker process, dedicated secret credentials,
private object store, key-management system, ACL, mTLS, network policy,
signed request validator, durable access audit or Proof of Capability
Separation. It does not prove `service_role` or `investing_app` cannot
read private ciphertext in a future deployment.

Do not deploy these functions inside the ordinary Vercel/Next runtime.
Do not put keys into NEXT_PUBLIC_* variables, Supabase service_role,
user-controlled configs, Git, logs, analytics, traces, AI prompts or
fixtures. The values used in tests are deliberately PUBLIC SYNTHETIC KEYS.

Required worker authority:

1. A distinct deployable process, principal and credential that are never
   present in ordinary web, Research, AI, Passport, Trading or service_role.
2. A dedicated, private encrypted object store and scoped object names,
   inaccessible to the normal Supabase/Next authority.
3. Server-side derivation of tenant, Investigation, registration, holdout
   scope and commitment from accepted RL-9B state, never from client IDs
   alone; revalidation before operations.
4. Explicit authenticated internal transport (e.g. mutually authenticated
   endpoint/short-lived purpose-bound capability), deny-by-default,
   no generic list/search/preview/download interface.
5. Durable registration+embargo fence and prior exposure proof BEFORE
   an authoritative seal, including every ordinary market provider path.
6. Transactionally persistent confidential HMAC anti-reuse index across
   relabelings and key rotations, separate from public scientific hashes.
7. `REVEAL_STARTED` durably accepted before read, exactly-once secret
   consume inside private storage authority, non-retryable after crash.
8. Append-only access audit and negative credential tests against the
   ACTUAL deployed ordinary credentials, not just unit mocks.
9. Multi-instance/concurrent failure recovery: no second opener; fail
   closed if storage, key rotation, logging completeness or ACL fails.

The worker must not be considered available or safe until independent
deployment credentials/storage and malicious-path integration tests
demonstrate these controls in an isolated environment.

## Tests and evidence

`tests/investingGenesisI5Rl9c2aVaultEnvelope.test.ts` contains:
- independently constructed Python cryptography AESGCM fixed ciphertext
  and authentication-tag vector (synthetic 00..1F key, 00..0B nonce);
- nondeterministic nonce and real authenticated roundtrip;
- denial of swapped tenant, Registration, scope, commitment, key version;
- denial of wrong key, altered nonce/tag/ciphertext and noncanonical encoding;
- denial of extra fields, invalid key shape, malformed/plaintext limits;
- no ordinary Research barrel import, direct ambient creds or console logs.

This tests the encryption ENVELOPE and its deterministic AAD contract. It
does not test deployment-based authorization, protected storage, embargo,
anti-reuse uniqueness or one-shot reveal. CI success cannot establish any
of those missing properties.

## Gates and authorization

Candidate may undergo GitHub CI, crypto vector replay and diff audit.
No Production DDL/DML, Supabase migration, secret deployment, credential
creation, Vercel production change command, real data ingestion, merge,
financial action or RL-9C `CURRENT_ACCEPTED` declaration is authorized.

Next: RL-9C2B separately provisioned worker+storage and capability negative
tests, RL-9C3 embargo/audit, RL-9C4 anti-reuse and durable consume, RL-9D
evaluation and RL-9E scientific closure.

Highest admissible outcome of this candidate:
`RL-9C2A_ENVELOPE_PRIMITIVE_TESTED / SECRET_VAULT_NOT_OPERATIONAL`.
