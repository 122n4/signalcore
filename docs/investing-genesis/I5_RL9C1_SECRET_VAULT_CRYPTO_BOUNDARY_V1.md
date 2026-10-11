# I5 RL-9C1 — Secret Vault Cryptographic Primitives

Status: CANDIDATE / CRYPTO_PRIMITIVES_ONLY / NOT ACCEPTED

Accepted predecessor: 0862c1f7ce9330e64b6e4cb13b21f7cea261deb5.

Upstream scientific authority: accepted RL-9 design freeze and accepted
RL-9B public metadata persistence. No new scientific HashRef domain is
introduced here.

## Executable implementation in this candidate

The worker-only source module at
lib/investing/secretVault/blindTruthVaultCrypto.ts implements:

- Domain-separated SHA-256 commitment of the exact secret 32-byte salt
  followed by exact canonical holdout plaintext bytes.
- CSPRNG salt generation through Node.js crypto.randomBytes(32).
- Canonical 64-character uppercase SHA-256 verification; constant-time
  digest comparison; closed byte-length, salt and malformed-data checks.
- Domain-separated secret HMAC-SHA-256 over pre-verified provider-independent
  normalized holdout truth bytes.
- Fail-closed fixed error codes that do not echo secret material.

Prefixes are the accepted freeze domains followed by exactly one UTF-8
newline byte 0x0A. The commitment preimage is:
domain-prefix + 32-byte salt + exact canonical plaintext bytes.
The fingerprint preimage is:
reuse-domain-prefix + verified canonical truth bytes, HMAC'd with a
separate confidential 32-byte reuse key.

The focused Vitest suite covers independently calculated Python hashlib/hmac
goldens, salt shape, random salt generation, tampering, bad lengths, invalid
keys, missing inputs and non-export into the ordinary Research barrel.

## What this does NOT establish

This is not a deployed or secure vault. These functions are crypto building
blocks only. They do not create a usable secret-holding capability, worker,
encryption envelope, storage backend, server authority, key rotation, embargo,
prior-exposure proof, complete confidential index, atomic duplicate prevention,
durable reveal claim, consume-once or crash-safe recovery.

The input named verifiedCanonicalHoldoutTruthBytes is a required PRECONDITION;
the crypto function does not certify provider-independent canonicalization.
A future trusted verifier must prove that property before using HMAC for
anti-reuse. Comparing fingerprints without historical index and key-rotation
continuity does not prove duplicate prevention.

No standard Supabase service_role credential, ordinary investing_app runtime,
AI/optimizer, browser or Research provider may possess vault keys or
capabilities. TypeScript module separation in one repository is not
runtime capability separation. The physical security boundary requires
independent deployment and negative credential tests before acceptance.

## Subsequent executable slices and blockers

RL-9C2: implement dedicated secret-capability worker/storage with distinct
credentials, authenticated envelope encryption and independent authorization.
Prove no read path exists from investing_app, standard service_role, public
API, Passport, optimizer or browser. Select/provision real infrastructure only
after explicit owner authorization.

RL-9C3: implement independent scope/truth normalizer, data-provider embargo,
durable fence, prior-exposure scanning and append-only access-audit evidence.
Ambiguous market/field/provider mappings fail closed.

RL-9C4: implement transactional secret reuse index with key-rotation
continuity and exact one-shot consume bound to durable REVEAL_STARTED.
Demonstrate concurrent claims, duplicated requests, crash-after-claim,
restarts, identity mismatches and recovery that never reopens a reveal.

RL-9D / RL-9E: integrate the privileged worker with accepted public RL-9B
writers and deterministic evaluator, rehearse PostgreSQL 17 and managed
Supabase, run malicious-path tests, audit and gate each deployment separately.

## Authorization and status

Authorized for this candidate: branch, crypto primitive source, isolated
tests, this bounded contract, CI and independent audit.

NOT authorized by this slice: a production key/credential, Supabase migration,
data mutation, Production storage, new route/API exposure, Vercel deployment,
merge, Paper, Live, broker or financial operation.

Highest possible gate for this slice:
RL-9C1 CRYPTO_PRIMITIVES_TESTED / SECRET_VAULT_NOT_IMPLEMENTED.
