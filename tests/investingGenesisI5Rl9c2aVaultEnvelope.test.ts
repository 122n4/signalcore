import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  decryptBlindTruthVaultEnvelopeV1,
  encryptBlindTruthVaultEnvelopeV1,
  type BlindTruthVaultEncryptedEnvelopeV1,
  type BlindTruthVaultEnvelopeBindingV1,
} from "../workers/investing-blind-vault/envelope";

const key = Buffer.from(Array.from({ length: 32 }, (_, i) => i));
const plaintext = Buffer.from('{"rows":[{"time":"2026-01-01","value":"123.45"}]}\n', "utf8");
const binding: BlindTruthVaultEnvelopeBindingV1 = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  registrationHashHex: "A".repeat(64),
  holdoutScopeDigestHex: "B".repeat(64),
  commitmentHashHex: "C".repeat(64),
};
const keyVersion = "K20261011A";

// Independently generated with Python cryptography.hazmat.primitives.ciphers.aead.AESGCM.
// Known fixture key: 00..1F; nonce: 00..0B; AAD: accepted exact JSON and domain-prefix.
// This fixture is synthetic, publicly known test material: NEVER use as a real vault key.
const pythonAes256GcmFixture: BlindTruthVaultEncryptedEnvelopeV1 = {
  schemaVersion: "BLIND_TRUTH_VAULT_ENVELOPE_V1",
  algorithm: "AES_256_GCM",
  keyVersion,
  nonceHex: "000102030405060708090A0B",
  ciphertextBase64: "PCCkdLKW4CHWOrX/2IQdT7n0tQTCTXJMCUrVtD9FIsRgfNuZjfswqUaXUdm9pVVlk1M=",
  tagHex: "3E930E20C38A74AD429085C53F13F85E",
};

function open(envelope: BlindTruthVaultEncryptedEnvelopeV1, expectedBinding = binding, expectedKeyVersion = keyVersion, vaultEncryptionKey = key) {
  return decryptBlindTruthVaultEnvelopeV1({ envelope, expectedBinding, expectedKeyVersion, vaultEncryptionKey });
}

describe("I5 RL-9C2A sealed worker envelope (NOT a deployed isolated vault)", () => {
  it("decrypts the independently generated Python AES-256-GCM fixture with exact AAD", () => {
    const result = open(pythonAes256GcmFixture);
    try { expect(result.equals(plaintext)).toBe(true); } finally { result.fill(0); }
  });

  it("randomizes 96-bit GCM nonces, roundtrips and authenticates exact plaintext", () => {
    const seal = () => encryptBlindTruthVaultEnvelopeV1({
      vaultEncryptionKey: key, binding, keyVersion, exactCanonicalPlaintextBytes: plaintext,
    });
    const a = seal(); const b = seal();
    expect(a.schemaVersion).toBe("BLIND_TRUTH_VAULT_ENVELOPE_V1");
    expect(a.algorithm).toBe("AES_256_GCM");
    expect(a.nonceHex).toMatch(/^[0-9A-F]{24}$/u);
    expect(a.tagHex).toMatch(/^[0-9A-F]{32}$/u);
    expect(a.nonceHex).not.toBe(b.nonceHex);
    expect(a.ciphertextBase64).not.toBe(b.ciphertextBase64);
    expect(JSON.stringify(a)).not.toContain("123.45");
    expect(JSON.stringify(a)).not.toContain(binding.tenantId);
    const opened = open(a);
    try { expect(opened.equals(plaintext)).toBe(true); } finally { opened.fill(0); }
    expect(Buffer.from(key)).toEqual(Buffer.from(Array.from({ length: 32 }, (_, i) => i)));
  });

  it("fails closed on cross-tenant, registration, scope and commitment substitutions", () => {
    const variants = [
      { ...binding, tenantId: "22222222-2222-4222-8222-222222222222" },
      { ...binding, registrationHashHex: "D".repeat(64) },
      { ...binding, holdoutScopeDigestHex: "D".repeat(64) },
      { ...binding, commitmentHashHex: "D".repeat(64) },
    ];
    for (const alternate of variants) expect(() => open(pythonAes256GcmFixture, alternate)).toThrow("MALFORMED_HOLDOUT");
    expect(() => open(pythonAes256GcmFixture, binding, "K20261011B")).toThrow("AUTHORITY_FAILURE");
  });

  it("rejects altered ciphertext, nonce, GCM tag and wrong key without returning bytes", () => {
    const e = pythonAes256GcmFixture;
    for (const changed of [
      { ...e, nonceHex: "010102030405060708090A0B" },
      { ...e, tagHex: "0" + e.tagHex.slice(1) },
      { ...e, ciphertextBase64: "A" + e.ciphertextBase64.slice(1) },
    ]) expect(() => open(changed)).toThrow("MALFORMED_HOLDOUT");
    expect(() => open(e, binding, keyVersion, Buffer.alloc(32, 77))).toThrow("MALFORMED_HOLDOUT");
  });

  it("rejects malformed envelopes and forbidden schema/algorithm/identity keys", () => {
    const e = pythonAes256GcmFixture;
    const cases = [
      { ...e, algorithm: "AES_256_CBC" },
      { ...e, schemaVersion: "BLIND_TRUTH_VAULT_ENVELOPE_V2" },
      { ...e, tagHex: e.tagHex.toLowerCase() },
      { ...e, tagHex: "EE" },
      { ...e, nonceHex: e.nonceHex.toLowerCase() },
      { ...e, ciphertextBase64: e.ciphertextBase64.slice(0, -1) },
      { ...e, ciphertextBase64: "A===" },
      { ...e, leakedSecret: "secret" },
    ];
    for (const input of cases) expect(() => open(input as never)).toThrow("MALFORMED_HOLDOUT");
    expect(() => open(e, { ...binding, extra: "secret" } as never)).toThrow("AUTHORITY_FAILURE");
    expect(() => open(e, { ...binding, tenantId: "USER_SUPPLIED" })).toThrow("AUTHORITY_FAILURE");
    expect(() => open(e, { ...binding, registrationHashHex: "a".repeat(64) })).toThrow("AUTHORITY_FAILURE");
  });

  it("fails closed on missing/short key, invalid input shape, and non-byte material", () => {
    const seal = (vaultEncryptionKey: Uint8Array, exactCanonicalPlaintextBytes: Uint8Array) =>
      encryptBlindTruthVaultEnvelopeV1({ vaultEncryptionKey, keyVersion, binding, exactCanonicalPlaintextBytes });
    expect(() => seal(Buffer.alloc(0), plaintext)).toThrow("MISSING_VAULT_CAPABILITY");
    expect(() => seal(Buffer.alloc(31), plaintext)).toThrow("MISSING_VAULT_CAPABILITY");
    expect(() => open(pythonAes256GcmFixture, binding, keyVersion, Buffer.alloc(33))).toThrow("MISSING_VAULT_CAPABILITY");
    expect(() => seal(key, Buffer.alloc(0))).toThrow("MALFORMED_HOLDOUT");
    expect(() => seal(key, "secret" as never)).toThrow("MALFORMED_HOLDOUT");
    expect(() => seal(key, Buffer.alloc(8 * 1024 * 1024 + 1))).toThrow("MALFORMED_HOLDOUT");
    expect(() => seal(key, plaintext).toString()).not.toContain("123.45");
  });

  it("keeps the worker-only code unreachable through ordinary Research exports", () => {
    const root = path.resolve(__dirname, "..");
    const crypto = fs.readFileSync(path.join(root, "workers/investing-blind-vault/envelope.ts"), "utf8");
    const researchBarrel = fs.readFileSync(path.join(root, "lib/investing/research/index.ts"), "utf8");
    const oldResearch = fs.readFileSync(path.join(root, "lib/investing/research/blindTruth.ts"), "utf8");
    const packages = fs.readFileSync(path.join(root, "package.json"), "utf8");
    expect(researchBarrel).not.toContain("investing-blind-vault");
    expect(oldResearch).not.toContain("investing-blind-vault");
    expect(packages).not.toContain("workers/investing-blind-vault");
    expect(crypto).not.toMatch(/process\.env|createClient|service_role|console\.(?:log|debug|warn|error)/iu);
    expect(crypto).not.toContain("createServer");
  });
});
