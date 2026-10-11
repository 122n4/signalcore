import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  deriveBlindTruthHoldoutCommitmentV1,
  deriveBlindTruthReuseFingerprintV1,
  generateBlindTruthCommitmentSaltV1,
  verifyBlindTruthHoldoutCommitmentV1,
} from "../lib/investing/secretVault/blindTruthVaultCrypto";

const salt = Buffer.from(Array.from({ length: 32 }, (_, i) => i));
const key = Buffer.from(Array.from({ length: 32 }, (_, i) => 32 + i));
const plaintext = Buffer.from('{"market":"BTCUSD","close":"123.45"}\n', "utf8");
const canonicalTruth = Buffer.from('{"market":"BTCUSD","time":"2026-01-01","field":"close","value":"123.45"}\n', "utf8");
// Golden vectors computed independently using Python hashlib / hmac.
const expectedCommitment = "692A400EA2DFEC9BFACD14FBF91B5C93AB3B52F4A488FA6D765D64875D78D041";
const expectedFingerprint = "DB5A3A1A1707503B5824CFE9ED9F4FED908EDED5BBE14E2C813EE34F1BCFD462";

const makeVerify = () => ({
  secretSalt: salt,
  exactCanonicalHoldoutPlaintextBytes: plaintext,
  publicCommitmentHash: expectedCommitment,
  declaredPlaintextByteLength: String(plaintext.length),
});

describe("I5 RL-9C1 private-vault cryptographic primitives, not a deployed vault", () => {
  it("computes the exact domain-separated salted SHA-256 commitment golden", () => {
    expect(deriveBlindTruthHoldoutCommitmentV1({ secretSalt: salt, exactCanonicalHoldoutPlaintextBytes: plaintext })).toBe(expectedCommitment);
    expect(expectedCommitment).toMatch(/^[0-9A-F]{64}$/u);
    expect(() => verifyBlindTruthHoldoutCommitmentV1(makeVerify())).not.toThrow();
  });

  it("fails closed on same-length plaintext tampering and salt substitution without leaking bytes", () => {
    const changed = Buffer.from(plaintext);
    changed[20] ^= 1;
    const changedSalt = Buffer.from(salt);
    changedSalt[0] ^= 1;
    for (const input of [
      { ...makeVerify(), exactCanonicalHoldoutPlaintextBytes: changed },
      { ...makeVerify(), secretSalt: changedSalt },
    ]) {
      expect(() => verifyBlindTruthHoldoutCommitmentV1(input)).toThrow("COMMITMENT_MISMATCH");
      try { verifyBlindTruthHoldoutCommitmentV1(input); } catch (error) {
        expect((error as Error).message).not.toContain("BTCUSD");
        expect((error as Error).message).not.toContain("123.45");
      }
    }
  });

  it("rejects malformed salts and empty/non-byte secret material", () => {
    expect(() => deriveBlindTruthHoldoutCommitmentV1({ secretSalt: Buffer.alloc(31), exactCanonicalHoldoutPlaintextBytes: plaintext })).toThrow("MALFORMED_COMMITMENT");
    expect(() => deriveBlindTruthHoldoutCommitmentV1({ secretSalt: Buffer.alloc(33), exactCanonicalHoldoutPlaintextBytes: plaintext })).toThrow("MALFORMED_COMMITMENT");
    expect(() => deriveBlindTruthHoldoutCommitmentV1({ secretSalt: salt, exactCanonicalHoldoutPlaintextBytes: Buffer.alloc(0) })).toThrow("MALFORMED_HOLDOUT");
    expect(() => deriveBlindTruthHoldoutCommitmentV1({ secretSalt: salt, exactCanonicalHoldoutPlaintextBytes: "hidden" as never })).toThrow("MALFORMED_HOLDOUT");
  });

  it("rejects bad length encoding, incorrect length and malformed or wrong hashes", () => {
    const v = makeVerify();
    expect(() => verifyBlindTruthHoldoutCommitmentV1({ ...v, declaredPlaintextByteLength: "00037" })).toThrow("PLAINTEXT_LENGTH_MISMATCH");
    expect(() => verifyBlindTruthHoldoutCommitmentV1({ ...v, declaredPlaintextByteLength: "38" })).toThrow("PLAINTEXT_LENGTH_MISMATCH");
    expect(() => verifyBlindTruthHoldoutCommitmentV1({ ...v, declaredPlaintextByteLength: "0" })).toThrow("PLAINTEXT_LENGTH_MISMATCH");
    expect(() => verifyBlindTruthHoldoutCommitmentV1({ ...v, publicCommitmentHash: v.publicCommitmentHash.toLowerCase() })).toThrow("MALFORMED_COMMITMENT");
    expect(() => verifyBlindTruthHoldoutCommitmentV1({ ...v, publicCommitmentHash: "SECRET_HOLDOUT" })).toThrow("MALFORMED_COMMITMENT");
    expect(() => verifyBlindTruthHoldoutCommitmentV1({ ...v, publicCommitmentHash: "0".repeat(64) })).toThrow("COMMITMENT_MISMATCH");
  });

  it("uses 32-byte cryptographically random commitment salts", () => {
    const first = generateBlindTruthCommitmentSaltV1();
    const second = generateBlindTruthCommitmentSaltV1();
    expect(first).toHaveLength(32);
    expect(second).toHaveLength(32);
    expect(first.equals(second)).toBe(false);
  });

  it("derives secret reuse fingerprint from truth bytes, not provider metadata or salt", () => {
    const derived = deriveBlindTruthReuseFingerprintV1({ vaultReuseKey: key, verifiedCanonicalHoldoutTruthBytes: canonicalTruth });
    expect(derived).toBe(expectedFingerprint);
    expect(deriveBlindTruthReuseFingerprintV1({ vaultReuseKey: key, verifiedCanonicalHoldoutTruthBytes: Buffer.from(canonicalTruth) })).toBe(expectedFingerprint);
    expect(derived).toMatch(/^[0-9A-F]{64}$/u);
  });

  it("fails closed for a missing/incorrect HMAC key and malformed truth bytes", () => {
    expect(() => deriveBlindTruthReuseFingerprintV1({ vaultReuseKey: Buffer.alloc(31), verifiedCanonicalHoldoutTruthBytes: canonicalTruth })).toThrow("MISSING_VAULT_CAPABILITY");
    expect(() => deriveBlindTruthReuseFingerprintV1({ vaultReuseKey: Buffer.alloc(0), verifiedCanonicalHoldoutTruthBytes: canonicalTruth })).toThrow("MISSING_VAULT_CAPABILITY");
    expect(() => deriveBlindTruthReuseFingerprintV1({ vaultReuseKey: key, verifiedCanonicalHoldoutTruthBytes: Buffer.alloc(0) })).toThrow("MALFORMED_HOLDOUT");
    expect(() => deriveBlindTruthReuseFingerprintV1({ vaultReuseKey: key, verifiedCanonicalHoldoutTruthBytes: "hidden" as never })).toThrow("MALFORMED_HOLDOUT");
    expect(deriveBlindTruthReuseFingerprintV1({ vaultReuseKey: Buffer.alloc(32, 77), verifiedCanonicalHoldoutTruthBytes: canonicalTruth })).not.toBe(expectedFingerprint);
  });

  it("keeps secret operations outside ordinary Research exports and avoids logging and ambient credentials", () => {
    const root = path.resolve(__dirname, "..");
    const barrel = fs.readFileSync(path.join(root, "lib/investing/research/index.ts"), "utf8");
    const research = fs.readFileSync(path.join(root, "lib/investing/research/blindTruth.ts"), "utf8");
    const vault = fs.readFileSync(path.join(root, "lib/investing/secretVault/blindTruthVaultCrypto.ts"), "utf8");
    expect(barrel).not.toMatch(/secretVault|VaultCrypto|ReuseFingerprint/iu);
    expect(research).not.toMatch(/secretVault|createHmac|vaultReuseKey|secretSalt/iu);
    expect(vault).not.toMatch(/console\.(log|debug|warn|error)|process\.env|service_role/iu);
    expect(vault).not.toContain("import { createClient }");
  });
});
