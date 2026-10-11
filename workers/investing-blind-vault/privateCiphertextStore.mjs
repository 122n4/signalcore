/**
 * RL-9C2B2A: Synthetic-only, append-only encrypted-envelope file staging.
 * This is NOT a deployed secret store or a seal/reveal/authorization boundary.
 * Not connected to isolatedServer.mjs; exposes no read/reveal API.
 */
import { createHash, randomBytes } from 'node:crypto';
import { constants, closeSync, existsSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { assertIsolatedVaultEnvironmentV1 } from './isolatedServer.mjs';

const REQUIRED_ENV = 'ISOLATED_REHEARSAL_V1';
const MAX_CIPHERTEXT_BYTES = 8 * 1024 * 1024;
const HEX_64 = /^[0-9A-F]{64}$/u;
const HEX_24 = /^[0-9A-F]{24}$/u;
const HEX_32 = /^[0-9A-F]{32}$/u;
const VERSION = /^[A-Z][A-Z0-9_]{0,63}$/u;
const FILE_FLAGS = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW || 0);
const DIR_FLAGS = constants.O_RDONLY | (constants.O_DIRECTORY || 0) | (constants.O_NOFOLLOW || 0);

function fail(code = 'VAULT_UNAVAILABLE') { throw new Error(code); }
function closedDataSnapshot(obj, fields) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) fail('MALFORMED_HOLDOUT');
  try {
    const prototype = Object.getPrototypeOf(obj);
    if (prototype !== Object.prototype && prototype !== null) fail('MALFORMED_HOLDOUT');
    const keys = Reflect.ownKeys(obj);
    if (keys.length !== fields.length || keys.some(key => typeof key !== 'string' || !fields.includes(key))) fail('MALFORMED_HOLDOUT');
    const snapshot = Object.create(null);
    for (const name of fields) {
      const descriptor = Object.getOwnPropertyDescriptor(obj, name);
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) fail('MALFORMED_HOLDOUT');
      snapshot[name] = descriptor.value;
    }
    return Object.freeze(snapshot);
  } catch { fail('MALFORMED_HOLDOUT'); }
}
function isSecureDirectory(dir) {
  const st = lstatSync(dir);
  if (!st.isDirectory() || st.isSymbolicLink() || (st.mode & 0o077) !== 0 || realpathSync(dir) !== dir) fail();
  if (typeof process.getuid !== 'function' || st.uid !== process.getuid()) fail();
}
function ensureSubdir(root, name) {
  const dir = join(root, name);
  if (!existsSync(dir)) {
    try { mkdirSync(dir, { mode: 0o700 }); } catch { fail(); }
  }
  isSecureDirectory(dir);
  return dir;
}
function fsyncDirectory(dir) {
  let fd;
  try { fd = openSync(dir, DIR_FLAGS); fsyncSync(fd); } catch { fail(); }
  finally { if (fd !== undefined) closeSync(fd); }
}
function writeExclusiveDurably(path, payload) {
  let fd;
  try {
    fd = openSync(path, FILE_FLAGS, 0o600);
    writeFileSync(fd, payload);
    fsyncSync(fd);
  } catch { fail(); }
  finally { if (fd !== undefined) closeSync(fd); }
}
function validateEnvelope(value) {
  value = closedDataSnapshot(value, ['schemaVersion', 'algorithm', 'keyVersion', 'nonceHex', 'ciphertextBase64', 'tagHex']);

  if (value.schemaVersion !== 'BLIND_TRUTH_VAULT_ENVELOPE_V1' || value.algorithm !== 'AES_256_GCM' ||
    typeof value.keyVersion !== 'string' || !VERSION.test(value.keyVersion) ||
    typeof value.nonceHex !== 'string' || !HEX_24.test(value.nonceHex) ||
    typeof value.tagHex !== 'string' || !HEX_32.test(value.tagHex) ||
    typeof value.ciphertextBase64 !== 'string' || value.ciphertextBase64.length === 0 ||
    value.ciphertextBase64.length > Math.ceil(MAX_CIPHERTEXT_BYTES / 3) * 4) fail('MALFORMED_HOLDOUT');
  const decoded = Buffer.from(value.ciphertextBase64, 'base64');
  if (!decoded.length || decoded.length > MAX_CIPHERTEXT_BYTES || decoded.toString('base64') !== value.ciphertextBase64) fail('MALFORMED_HOLDOUT');
  // Structural validation only: GCM authenticity requires a future key-owning worker.
  return value;
}

/** Synthetic test and rehearsal only. No keys, secrets or real holdouts admitted. */
export function createSyntheticPrivateCiphertextStoreV1(config) {
  config = closedDataSnapshot(config, ['environment', 'rootDirectory', 'storageMode']);
  assertIsolatedVaultEnvironmentV1(config.environment);
  if (config.storageMode !== REQUIRED_ENV ||
      config.environment.SYNTRAKE_VAULT_SYNTHETIC_STORE_MODE !== REQUIRED_ENV ||
      process.platform === 'win32' ||
      typeof config.rootDirectory !== 'string' || !isAbsolute(config.rootDirectory)) fail();
  const root = resolve(config.rootDirectory);
  const source = resolve(process.cwd());
  if (root === source || root.startsWith(`${source}${sep}`)) fail();
  try { isSecureDirectory(root); } catch { fail(); }
  const objects = ensureSubdir(root, 'objects');
  const nonceIndex = ensureSubdir(root, 'nonce-reservations');
  fsyncDirectory(root);

  return Object.freeze({
    /** No read, list, preview, open, reveal, consume or public locator service. */
    stageSyntheticEnvelopeV1(input) {
      input = closedDataSnapshot(input, ['classification', 'envelope']);
      if (input.classification !== 'SYNTHETIC_TEST_VECTOR') fail('MISSING_VAULT_CAPABILITY');
      const envelope = validateEnvelope(input.envelope);
      // Revalidate directory protection before each local staging operation.
      try { isSecureDirectory(root); isSecureDirectory(objects); isSecureDirectory(nonceIndex); } catch { fail(); }
      const nonceKey = createHash('sha256').update('SYNTRAKE:PRIVATE_VAULT_NONCE_RESERVATION:V1\n')
        .update(envelope.keyVersion).update('\n').update(envelope.nonceHex).digest('hex').toUpperCase();
      const reservation = join(nonceIndex, `${nonceKey}.reserved`);
      // A reserved nonce remains burned after any later failure or crash.
      // This is a rehearsal index, NOT a multi-host KMS-backed nonce allocation proof.
      writeExclusiveDurably(reservation, Buffer.from('RESERVED\n', 'ascii'));
      fsyncDirectory(nonceIndex);
      const locator = randomBytes(32).toString('hex').toUpperCase();
      if (!HEX_64.test(locator)) fail();
      const final = join(objects, `${locator}.sealed`);
      const pending = join(objects, `.${locator}.pending`);
      const serialized = Buffer.from(JSON.stringify(envelope) + '\n', 'utf8');
      try {
        writeExclusiveDurably(pending, serialized);
        // POSIX hardlink creation is atomic and fails rather than replacing an existing object.
        linkSync(pending, final);
        unlinkSync(pending);
        fsyncDirectory(objects);
      } catch { fail(); } finally { serialized.fill(0); }
      // Private-only locator; NEVER return this to the ordinary Research/AI/Passport runtime.
      return Object.freeze({ status: 'STAGED_SYNTHETIC', privateObjectLocator: locator });
    },
  });
}
