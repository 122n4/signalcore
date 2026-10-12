/**
 * RL-9C2B2E — SYNTHETIC ONLY durable burn-before-ciphertext-read rehearsal.
 *
 * Not connected to isolatedServer.mjs, no real reveal authority, no key,
 * decrypt API, seal authorization or service endpoint. A caller-supplied
 * REVEAL_STARTED hash is NOT evidence that such an event was persisted.
 *
 * Do not use for real holdout material. The only result is an encrypted
 * envelope; plaintext is never returned by this module.
 */
import { createHash } from 'node:crypto';
import { constants, closeSync, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { assertIsolatedVaultEnvironmentV1 } from './isolatedServer.mjs';

const MODE = 'ISOLATED_REHEARSAL_V1';
const HEX64 = /^[0-9A-F]{64}$/u;
const HEX24 = /^[0-9A-F]{24}$/u;
const HEX32 = /^[0-9A-F]{32}$/u;
const VERSION = /^[A-Z][A-Z0-9_]{0,63}$/u;
const MAX_CIPHERTEXT_DOCUMENT_BYTES = 12 * 1024 * 1024;
const O_EXCLUSIVE = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW || 0);
const O_DIRECTORY = constants.O_RDONLY | (constants.O_DIRECTORY || 0) | (constants.O_NOFOLLOW || 0);
const O_SEALED = constants.O_RDONLY | (constants.O_NOFOLLOW || 0);
const NONCE = 'SYNTRAKE:BLIND_TRUTH_SYNTHETIC_ONE_SHOT:V1\n';

function deny(code = 'VAULT_UNAVAILABLE') { throw new Error(code); }
function snapshot(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) deny('MALFORMED_HOLDOUT');
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) deny('MALFORMED_HOLDOUT');
    if (Reflect.ownKeys(value).length !== keys.length ||
        Reflect.ownKeys(value).some(k => typeof k !== 'string' || !keys.includes(k))) deny('MALFORMED_HOLDOUT');
    const data = Object.create(null);
    for (const name of keys) {
      const d = Object.getOwnPropertyDescriptor(value, name);
      if (!d || !d.enumerable || !('value' in d)) deny('MALFORMED_HOLDOUT');
      data[name] = d.value;
    }
    return Object.freeze(data);
  } catch { deny('MALFORMED_HOLDOUT'); }
}
function directory(dir) {
  try {
    const s = lstatSync(dir);
    if (!s.isDirectory() || s.isSymbolicLink() || (s.mode & 0o077) !== 0 ||
        realpathSync(dir) !== dir || typeof process.getuid !== 'function' || s.uid !== process.getuid()) deny();
  } catch { deny(); }
}
function ensureDirectory(root, basename) {
  const dir = join(root, basename);
  if (!existsSync(dir)) {
    try { mkdirSync(dir, { mode: 0o700 }); } catch { deny(); }
  }
  directory(dir);
  return dir;
}
function syncDirectory(dir) {
  let fd;
  try {
    fd = openSync(dir, O_DIRECTORY);
    fsyncSync(fd);
  } catch { deny(); }
  finally { if (fd !== undefined) closeSync(fd); }
}
function reserveForever(dir, name, payload) {
  let fd;
  try {
    fd = openSync(join(dir, name), O_EXCLUSIVE, 0o600);
    writeFileSync(fd, payload, 'ascii');
    fsyncSync(fd);
  } catch { deny(); }
  finally { if (fd !== undefined) closeSync(fd); }
  // Durable directory entry BEFORE encrypted material can be opened.
  syncDirectory(dir);
}
function checkedEnvelope(value) {
  const e = snapshot(value, ['schemaVersion','algorithm','keyVersion','nonceHex','ciphertextBase64','tagHex']);
  if (e.schemaVersion !== 'BLIND_TRUTH_VAULT_ENVELOPE_V1' ||
      e.algorithm !== 'AES_256_GCM' ||
      typeof e.keyVersion !== 'string' || !VERSION.test(e.keyVersion) ||
      typeof e.nonceHex !== 'string' || !HEX24.test(e.nonceHex) ||
      typeof e.tagHex !== 'string' || !HEX32.test(e.tagHex) ||
      typeof e.ciphertextBase64 !== 'string' || !e.ciphertextBase64 ||
      e.ciphertextBase64.length > MAX_CIPHERTEXT_DOCUMENT_BYTES) deny('MALFORMED_HOLDOUT');
  const decoded = Buffer.from(e.ciphertextBase64, 'base64');
  if (decoded.length === 0 || decoded.length > 8 * 1024 * 1024 ||
      decoded.toString('base64') !== e.ciphertextBase64) deny('MALFORMED_HOLDOUT');
  return Object.freeze({
    schemaVersion:e.schemaVersion,algorithm:e.algorithm,keyVersion:e.keyVersion,
    nonceHex:e.nonceHex,ciphertextBase64:e.ciphertextBase64,tagHex:e.tagHex,
  });
}
function readSealedCiphertextOnly(root, locator) {
  const objectDir = join(root, 'objects');
  directory(objectDir);
  let fd;
  try {
    fd = openSync(join(objectDir, locator + '.sealed'), O_SEALED);
    const info = fstatSync(fd);
    if (!info.isFile() || info.nlink !== 1 || (info.mode & 0o777) !== 0o600 ||
        info.size < 1 || info.size > MAX_CIPHERTEXT_DOCUMENT_BYTES ||
        typeof process.getuid !== 'function' || info.uid !== process.getuid()) deny();
    const serialized = readFileSync(fd, 'utf8');
    if (!serialized.endsWith('\n') || serialized.includes('\n', 0) && serialized.indexOf('\n') !== serialized.length - 1) deny('MALFORMED_HOLDOUT');
    return checkedEnvelope(JSON.parse(serialized));
  } catch {
    deny('VAULT_UNAVAILABLE');
  } finally { if (fd !== undefined) closeSync(fd); }
}

/**
 * A synthetic, direct test-only capability. No real seal/reveal operation
 * becomes available through the isolated mTLS server, ordinary Investing
 * service, or browser. Operates only on a private POSIX 0700 directory.
 */
export function createSyntheticVaultConsumeOnceRehearsalV1(config) {
  config = snapshot(config, ['environment','rootDirectory','storageMode']);
  assertIsolatedVaultEnvironmentV1(config.environment);
  if (config.storageMode !== MODE ||
      config.environment.SYNTRAKE_VAULT_SYNTHETIC_STORE_MODE !== MODE ||
      typeof config.rootDirectory !== 'string' || !isAbsolute(config.rootDirectory) ||
      process.platform === 'win32') deny();
  const root = resolve(config.rootDirectory);
  const source = resolve(process.cwd());
  if (root === source || root.startsWith(source + sep)) deny();
  directory(root);
  directory(join(root,'objects'));
  const claims = ensureDirectory(root,'synthetic-consume-claims');
  const evaluations = ensureDirectory(root,'synthetic-evaluation-claims');
  syncDirectory(root);

  return Object.freeze({
    /**
     * Caller hashes are synthetic fixture tokens ONLY, not a real attestation
     * from the PostgreSQL RevealResultEvent writer. No external authority.
     * Permanently burns both evaluation identity and object locator BEFORE
     * reading an encrypted object. A crash at any point can only reduce
     * availability: it must never allow a second consumption.
     */
    consumeSyntheticSealedEnvelopeOnceV1(untrusted) {
      const input = snapshot(untrusted, [
        'classification','privateObjectLocator','evaluationHashHex','revealStartedEventHashHex',
      ]);
      if (input.classification !== 'SYNTHETIC_TEST_VECTOR') deny('MISSING_VAULT_CAPABILITY');
      const {privateObjectLocator:locator,evaluationHashHex:evaluation,
        revealStartedEventHashHex:reveal} = input;
      if (typeof locator !== 'string' || !HEX64.test(locator) ||
          typeof evaluation !== 'string' || !HEX64.test(evaluation) ||
          typeof reveal !== 'string' || !HEX64.test(reveal)) deny('AUTHORITY_FAILURE');
      directory(root);directory(claims);directory(evaluations);
      // Order is deliberate. If one reservation fails, the first is burned.
      // A different object cannot be consumed for an already-burned evaluation.
      reserveForever(evaluations, evaluation + '.claimed',
        NONCE + 'evaluation=' + evaluation + '\nreveal=' + reveal + '\n');
      const objectClaim = createHash('sha256').update(NONCE)
        .update(locator).digest('hex').toUpperCase();
      reserveForever(claims, objectClaim + '.claimed',
        NONCE + 'evaluation=' + evaluation + '\nreveal=' + reveal + '\n');
      return Object.freeze({status:'SYNTHETIC_CONSUMED_ONCE',
        envelope:readSealedCiphertextOnly(root, locator)});
    },
  });
}
