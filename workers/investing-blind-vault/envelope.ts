/**
 * RL-9C2A — isolated-worker-only authenticated envelope primitive.
 *
 * NOT a deployed vault or authority decision. This file must not be imported
 * by app/, lib/investing/research/, the browser, or the ordinary API runtime.
 * Physical credential separation, storage, embargo, anti-reuse and consume-once
 * remain mandatory later gates.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const AAD_PREFIX = Buffer.from("SYNTRAKE:BLIND_TRUTH_VAULT_ENVELOPE_AAD:V1\n", "utf8");
const KEY_SIZE = 32;
const NONCE_SIZE = 12;
const TAG_SIZE = 16;
const MAX_PLAINTEXT_BYTES = 8 * 1024 * 1024;
const HEX64 = /^[0-9A-F]{64}$/u;
const HEX24 = /^[0-9A-F]{24}$/u;
const HEX32 = /^[0-9A-F]{32}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const KEY_VERSION = /^[A-Z][A-Z0-9_]{0,63}$/u;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;

export type BlindTruthVaultEnvelopeBindingV1 = Readonly<{
  tenantId: string;
  registrationHashHex: string;
  holdoutScopeDigestHex: string;
  commitmentHashHex: string;
}>;

export type BlindTruthVaultEncryptedEnvelopeV1 = Readonly<{
  schemaVersion: "BLIND_TRUTH_VAULT_ENVELOPE_V1";
  algorithm: "AES_256_GCM";
  keyVersion: string;
  nonceHex: string;
  ciphertextBase64: string;
  tagHex: string;
}>;

/** Only the private worker may call this with its distinct 32-byte encryption key. */
export function encryptBlindTruthVaultEnvelopeV1(input: Readonly<{
  vaultEncryptionKey: Uint8Array;
  keyVersion: string;
  binding: BlindTruthVaultEnvelopeBindingV1;
  exactCanonicalPlaintextBytes: Uint8Array;
}>): BlindTruthVaultEncryptedEnvelopeV1 {
  exactFields(input, ["vaultEncryptionKey", "keyVersion", "binding", "exactCanonicalPlaintextBytes"], "MALFORMED_HOLDOUT");
  const key = validateSecretKey(input.vaultEncryptionKey);
  try {
    const aad = authenticatedContext(input.binding, input.keyVersion);
    const plaintext = validatedPlaintext(input.exactCanonicalPlaintextBytes);
    const nonce = randomBytes(NONCE_SIZE);
    const cipher = createCipheriv("aes-256-gcm", key, nonce, { authTagLength: TAG_SIZE });
    cipher.setAAD(aad, { plaintextLength: plaintext.length });
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Object.freeze({
      schemaVersion: "BLIND_TRUTH_VAULT_ENVELOPE_V1" as const,
      algorithm: "AES_256_GCM" as const,
      keyVersion: input.keyVersion,
      nonceHex: nonce.toString("hex").toUpperCase(),
      ciphertextBase64: ciphertext.toString("base64"),
      tagHex: tag.toString("hex").toUpperCase(),
    });
  } catch {
    throw new Error("MALFORMED_HOLDOUT");
  } finally {
    key.fill(0);
  }
}

/**
 * The private worker must separately prove authorization + consumed reveal
 * claim before calling this function. No reusable read endpoint is supplied.
 * The returned Buffer must be zeroized by the worker after one evaluation.
 */
export function decryptBlindTruthVaultEnvelopeV1(input: Readonly<{
  vaultEncryptionKey: Uint8Array;
  expectedKeyVersion: string;
  expectedBinding: BlindTruthVaultEnvelopeBindingV1;
  envelope: BlindTruthVaultEncryptedEnvelopeV1;
}>): Buffer {
  exactFields(input, ["vaultEncryptionKey", "expectedKeyVersion", "expectedBinding", "envelope"], "MALFORMED_HOLDOUT");
  const key = validateSecretKey(input.vaultEncryptionKey);
  try {
    const envelope = input.envelope;
    exactFields(envelope, ["schemaVersion", "algorithm", "keyVersion", "nonceHex", "ciphertextBase64", "tagHex"], "MALFORMED_HOLDOUT");
    if (envelope.schemaVersion !== "BLIND_TRUTH_VAULT_ENVELOPE_V1" || envelope.algorithm !== "AES_256_GCM") {
      throw new Error("MALFORMED_HOLDOUT");
    }
    if (typeof input.expectedKeyVersion !== "string" || !KEY_VERSION.test(input.expectedKeyVersion) ||
        input.expectedKeyVersion !== envelope.keyVersion) throw new Error("AUTHORITY_FAILURE");
    const aad = authenticatedContext(input.expectedBinding, input.expectedKeyVersion);
    if (typeof envelope.nonceHex !== "string" || !HEX24.test(envelope.nonceHex) ||
        typeof envelope.tagHex !== "string" || !HEX32.test(envelope.tagHex) ||
        typeof envelope.ciphertextBase64 !== "string" ||
        envelope.ciphertextBase64.length === 0 ||
        envelope.ciphertextBase64.length > Math.ceil(MAX_PLAINTEXT_BYTES / 3) * 4 ||
        !BASE64.test(envelope.ciphertextBase64)) throw new Error("MALFORMED_HOLDOUT");
    const ciphertext = Buffer.from(envelope.ciphertextBase64, "base64");
    if (ciphertext.length === 0 || ciphertext.length > MAX_PLAINTEXT_BYTES ||
        ciphertext.toString("base64") !== envelope.ciphertextBase64) throw new Error("MALFORMED_HOLDOUT");
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.nonceHex, "hex"), { authTagLength: TAG_SIZE });
    decipher.setAAD(aad, { plaintextLength: ciphertext.length });
    decipher.setAuthTag(Buffer.from(envelope.tagHex, "hex"));
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext;
  } catch (error) {
    if (error instanceof Error && error.message === "AUTHORITY_FAILURE") throw error;
    throw new Error("MALFORMED_HOLDOUT");
  } finally {
    key.fill(0);
  }
}

function authenticatedContext(binding: BlindTruthVaultEnvelopeBindingV1, keyVersion: string): Buffer {
  exactFields(binding, ["tenantId", "registrationHashHex", "holdoutScopeDigestHex", "commitmentHashHex"], "AUTHORITY_FAILURE");
  if (typeof binding.tenantId !== "string" || !UUID.test(binding.tenantId) ||
      typeof binding.registrationHashHex !== "string" || !HEX64.test(binding.registrationHashHex) ||
      typeof binding.holdoutScopeDigestHex !== "string" || !HEX64.test(binding.holdoutScopeDigestHex) ||
      typeof binding.commitmentHashHex !== "string" || !HEX64.test(binding.commitmentHashHex) ||
      typeof keyVersion !== "string" || !KEY_VERSION.test(keyVersion)) throw new Error("AUTHORITY_FAILURE");
  const aad = {
    schemaVersion: "BLIND_TRUTH_VAULT_ENVELOPE_AAD_V1",
    tenantId: binding.tenantId,
    registrationHashHex: binding.registrationHashHex,
    holdoutScopeDigestHex: binding.holdoutScopeDigestHex,
    commitmentHashHex: binding.commitmentHashHex,
    keyVersion,
  };
  return Buffer.concat([AAD_PREFIX, Buffer.from(JSON.stringify(aad), "utf8")]);
}

function validateSecretKey(input: unknown): Buffer {
  if (!(input instanceof Uint8Array) || input.length !== KEY_SIZE) throw new Error("MISSING_VAULT_CAPABILITY");
  return Buffer.from(input);
}

function validatedPlaintext(input: unknown): Buffer {
  if (!(input instanceof Uint8Array) || input.byteLength < 1 || input.byteLength > MAX_PLAINTEXT_BYTES) {
    throw new Error("MALFORMED_HOLDOUT");
  }
  return Buffer.from(input);
}

function exactFields(input: unknown, fields: readonly string[], failureCode: "MALFORMED_HOLDOUT" | "AUTHORITY_FAILURE"): void {
  if (input === null || typeof input !== "object" || Array.isArray(input)) throw new Error(failureCode);
  const found = Object.keys(input).sort();
  if (found.length !== fields.length || fields.some((name, i) => found[i] !== [...fields].sort()[i])) throw new Error(failureCode);
}
