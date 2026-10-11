# I5 RL-9C2B2A — Synthetic-only Private Ciphertext Staging V1

Status: CANDIDATE / NOT_ACCEPTED / NOT_DEPLOYED / SECRET_VAULT_NOT_OPERATIONAL

Predecessor: RL-9C2B1 GitHub accepted code, squash `99ffdbd714ab6a33089fb4ab54f83a0781a8099a`.

## Purpose

Provide an executable, POSIX-only encrypted-envelope **staging primitive** for
synthetic rehearsal. This is NOT the real RL-9C2B credential-isolated storage
service. The ordinary `service_role`, `investing_app`, Research, Passport, AI,
Trading or frontend must not gain access to this module, its local root or its
future private object IDs.

The implementation `workers/investing-blind-vault/privateCiphertextStore.mjs`
uses an already provisioned external absolute directory, owned by the effective
worker UID, with mode 0700 and no symlink. It refuses the source directory,
Windows ACL uncertainty, absent isolated mode, unexpected ordinary credentials,
and non-synthetic staging classification. It does NOT create Production roots.

The only exported factory creates an adapter with one operation,
`stageSyntheticEnvelopeV1`. No `get`, `list`, `read`, `preview`, `open`,
`consume`, seal or reveal API exists. The mTLS worker server does not import it,
its `/internal/ready` remains 503 and there is no network storage endpoint.

The adapter strictly checks the closed AES-256-GCM envelope format. It stores
only the envelope ciphertext, tag and nonce, not any plaintext, salt or raw
observations. It does not possess an encryption/decryption key; therefore it
**cannot prove actual GCM authenticity** and is not suitable for real input.

A private 0600 append-only nonce reservation is made with POSIX O_EXCL, indexed
by SHA-256 of key version and nonce. This rejects repeated version/nonce on
synthetic restarts. Reservation is not rolled back after any later crash/failure
(the nonce remains burned). Each object uses a fresh random 256-bit private ID,
a 0600 temporary file, fsync, atomic hardlink without overwrite, and directory
fsync. No unapproved overwrite or object-read interface is exposed.

## Non-claims / operational blockers

- A local UNIX filesystem under the same OS principal is **not** physical
  isolation from the ordinary app. Requires a separately provisioned host,
  protected UID, storage account, IAM and negative tests against real ordinary
  credentials before allowing any holdout. Root/parent races, multi-host
  atomicity and power-loss recovery are not proven by this rehearsal format.
- The nonce reservation is by a caller-supplied `keyVersion`, **not** proven
  attached to a KMS key. Multi-instance/global nonce uniqueness and rotation
  continuity remain unsolved. Absolutely no real encryption key in this slice.
- No trusted RL-9B server-side authority reconstruction, embargo, previous
  exposure proof, confidential anti-reuse truth normalization/HMAC index,
  durable consume-once fence or evaluator/reveal integration exists.
- A string classification `SYNTHETIC_TEST_VECTOR` is for test-only safety
  signaling, **not** a security authority for future production acceptance.
- Neither private locators, ciphertext nor salts may ever enter public
  scientific HashRef payloads, Research, AI, logs, telemetry, SQL literals,
  ordinary snapshots or Passport. The private locator output may only be
  consumed by a future independently authorized Vault-only persistence path.
- Filesystem sync promises and crash recovery must be audited in the actual
  deployment FS; successful CI tests alone do not prove hardware durability.

## Acceptance tests

Vitest tests verify synthetic encrypted-envelope staging, 0600/0700 modes,
opaque random names, unchanged mTLS worker readiness, duplicate nonce rejection
after reopening the store, invalid/cross-process-credential configuration,
malformed inputs, world-readable roots, symlinks and absence of public routes.

Highest admissible result: `RL-9C2B2A_SYNTHETIC_STAGING_TESTED`.
Full RL-9C2B remains `IN_PROGRESS / PHYSICAL_STORAGE_ISOLATION_NOT_PROVEN`.

No merge, key material, external private infrastructure provisioning, real
secret use, Supabase DDL/DML, migrations or manual Production deploy is
permitted in this candidate without separate owner authorization.
