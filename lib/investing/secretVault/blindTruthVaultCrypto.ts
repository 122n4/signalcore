/**
 * RL-9C1 cryptographic building blocks for a future isolated vault worker.
 *
 * NOT a deployed secret vault, authorized ingestion path, embargo, anti-reuse
 * database, durable consume-once mechanism, or Proof of Capability Separation.
 * Keep this module outside the ordinary Research barrel and application routes.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const HOLDOUT_COMMITMENT_PREFIX = Buffer.from("SYNTRAKE:BLIND_TRUTH_HOLDOUT_COMMITMENT:V1\n", "utf8");
const REUSE_FINGERPRINT_PREFIX = Buffer.from("SYNTRAKE:BLIND_TRUTH_REUSE_FINGERPRINT:V1\n", "utf8");
const SECRET_SALT_LENGTH = 32;
const REUSE_KEY_LENGTH = 32;
const COMMITMENT_RE = /^[0-9A-F]{64}$/u;
const POSITIVE_CANONICAL_INTEGER_RE = /^[1-9][0-9]*$/u;

export type BlindTruthVaultCryptoBytesV1 = Uint8Array;

export function generateBlindTruthCommitmentSaltV1(): Buffer {
  return randomBytes(SECRET_SALT_LENGTH);
}

/** Exact design-freeze SHA-256 preimage. The salt remains private to the vault. */
export function deriveBlindTruthHoldoutCommitmentV1(input: Readonly<{
  secretSalt: BlindTruthVaultCryptoBytesV1;
  exactCanonicalHoldoutPlaintextBytes: BlindTruthVaultCryptoBytesV1;
}>): string {
  const salt = requireBytes(input?.secretSalt, "MALFORMED_COMMITMENT");
  if (salt.length !== SECRET_SALT_LENGTH) throw new Error("MALFORMED_COMMITMENT");
  const plaintext = requireBytes(input.exactCanonicalHoldoutPlaintextBytes, "MALFORMED_HOLDOUT");
  return createHash("sha256")
    .update(HOLDOUT_COMMITMENT_PREFIX).update(salt).update(plaintext)
    .digest("hex").toUpperCase();
}

/** Fails closed without echoing secret bytes, salt, or any user-supplied text. */
export function verifyBlindTruthHoldoutCommitmentV1(input: Readonly<{
  secretSalt: BlindTruthVaultCryptoBytesV1;
  exactCanonicalHoldoutPlaintextBytes: BlindTruthVaultCryptoBytesV1;
  publicCommitmentHash: string;
  declaredPlaintextByteLength: string;
}>): void {
  if (typeof input?.publicCommitmentHash !== "string" || !COMMITMENT_RE.test(input.publicCommitmentHash)) {
    throw new Error("MALFORMED_COMMITMENT");
  }
  const length = input.declaredPlaintextByteLength;
  if (typeof length !== "string" || !POSITIVE_CANONICAL_INTEGER_RE.test(length)) {
    throw new Error("PLAINTEXT_LENGTH_MISMATCH");
  }
  const plaintext = requireBytes(input.exactCanonicalHoldoutPlaintextBytes, "MALFORMED_HOLDOUT");
  if (BigInt(plaintext.length) !== BigInt(length)) throw new Error("PLAINTEXT_LENGTH_MISMATCH");
  const actual = Buffer.from(deriveBlindTruthHoldoutCommitmentV1({
    secretSalt: input.secretSalt, exactCanonicalHoldoutPlaintextBytes: plaintext,
  }), "hex");
  const expected = Buffer.from(input.publicCommitmentHash, "hex");
  if (!timingSafeEqual(actual, expected)) throw new Error("COMMITMENT_MISMATCH");
}

/**
 * Secret HMAC primitive, NOT a duplicate-detection oracle or canonicalizer.
 * Callers MUST first prove normalized provider-independent truth bytes, durable
 * confidential index integrity, atomic uniqueness and key-rotation continuity.
 * No ordinary Research/AI/API code may hold the reuse key or fingerprint.
 */
export function deriveBlindTruthReuseFingerprintV1(input: Readonly<{
  vaultReuseKey: BlindTruthVaultCryptoBytesV1;
  verifiedCanonicalHoldoutTruthBytes: BlindTruthVaultCryptoBytesV1;
}>): string {
  const key = requireBytes(input?.vaultReuseKey, "MISSING_VAULT_CAPABILITY");
  if (key.length !== REUSE_KEY_LENGTH) throw new Error("MISSING_VAULT_CAPABILITY");
  const truth = requireBytes(input.verifiedCanonicalHoldoutTruthBytes, "MALFORMED_HOLDOUT");
  return createHmac("sha256", key)
    .update(REUSE_FINGERPRINT_PREFIX).update(truth)
    .digest("hex").toUpperCase();
}

function requireBytes(value: unknown, reason: "MALFORMED_COMMITMENT" | "MALFORMED_HOLDOUT" | "MISSING_VAULT_CAPABILITY"): Buffer {
  if (!(value instanceof Uint8Array) || value.byteLength === 0) throw new Error(reason);
  return Buffer.from(value);
}
