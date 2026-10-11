import { createCipheriv, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSyntheticPrivateCiphertextStoreV1 } from '../workers/investing-blind-vault/privateCiphertextStore.mjs';

const environment = { SYNTRAKE_VAULT_WORKER_MODE: 'ISOLATED_SECRET_VAULT_V1', SYNTRAKE_VAULT_SYNTHETIC_STORE_MODE: 'ISOLATED_REHEARSAL_V1' };
const syntheticBytes = Buffer.from('SYNTHETIC_FICTIONAL_HOLDOUT_NOT_REAL\n');
const key = Buffer.alloc(32, 0x37); // synthetic public fixture key only
const validEnvelope = () => {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([cipher.update(syntheticBytes), cipher.final()]);
  return { schemaVersion: 'BLIND_TRUTH_VAULT_ENVELOPE_V1', algorithm: 'AES_256_GCM', keyVersion: 'SYNTHETIC_K1',
    nonceHex: nonce.toString('hex').toUpperCase(), ciphertextBase64: ciphertext.toString('base64'),
    tagHex: cipher.getAuthTag().toString('hex').toUpperCase() };
};
function withRoot(fn: (root: string) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'syntrake-rl9c2b2a-'));
  fs.chmodSync(root, 0o700);
  try { fn(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
function store(root: string, env: Record<string, string> = environment) {
  return createSyntheticPrivateCiphertextStoreV1({ rootDirectory: root, storageMode: 'ISOLATED_REHEARSAL_V1', environment: env });
}

// Linux/POSIX security properties are NOT portable to Windows ACLs.
describe.skipIf(process.platform === 'win32')('RL-9C2B2A synthetic-only private ciphertext staging, not operational vault', () => {
  it('writes only a validated AES-GCM envelope to an unlisted opaque 0600 private object', () => withRoot(root => {
    const vault = store(root);
    expect(Object.keys(vault)).toEqual(['stageSyntheticEnvelopeV1']);
    const envelope = validEnvelope();
    const response = vault.stageSyntheticEnvelopeV1({ classification: 'SYNTHETIC_TEST_VECTOR', envelope });
    expect(response.status).toBe('STAGED_SYNTHETIC');
    expect(response.privateObjectLocator).toMatch(/^[0-9A-F]{64}$/u);
    const objectDir = path.join(root, 'objects');
    const entries = fs.readdirSync(objectDir);
    expect(entries).toEqual([`${response.privateObjectLocator}.sealed`]);
    const p = path.join(objectDir, entries[0]);
    expect(fs.statSync(p).mode & 0o777).toBe(0o600);
    const persisted = fs.readFileSync(p, 'utf8');
    expect(JSON.parse(persisted)).toEqual(envelope);
    expect(persisted).not.toContain('SYNTHETIC_FICTIONAL_HOLDOUT_NOT_REAL');
    expect(fs.statSync(path.join(root, 'nonce-reservations')).mode & 0o777).toBe(0o700);
  }));

  it('rejects nonce reuse even after a fresh store instance is reconstructed', () => withRoot(root => {
    const first = store(root);
    const envelope = validEnvelope();
    first.stageSyntheticEnvelopeV1({ classification: 'SYNTHETIC_TEST_VECTOR', envelope });
    const second = store(root);
    expect(() => second.stageSyntheticEnvelopeV1({ classification: 'SYNTHETIC_TEST_VECTOR', envelope })).toThrow('VAULT_UNAVAILABLE');
    expect(() => second.stageSyntheticEnvelopeV1({ classification: 'SYNTHETIC_TEST_VECTOR', envelope: { ...envelope, ciphertextBase64: 'ZmFrZQ==' } })).toThrow('VAULT_UNAVAILABLE');
    expect(fs.readdirSync(path.join(root, 'objects'))).toHaveLength(1);
    expect(fs.readdirSync(path.join(root, 'nonce-reservations'))).toHaveLength(1);
  }));

  it('rejects fake/plaintext/oversized payload shapes before reservation', () => withRoot(root => {
    const s = store(root);
    const envelope = validEnvelope();
    const bad = [
      { ...envelope, extra: 'secret' },
      { ...envelope, ciphertextBase64: '!!!' },
      { ...envelope, tagHex: 'ff'.repeat(16) },
      { ...envelope, nonceHex: 'aa'.repeat(12) },
      { ...envelope, keyVersion: '../../external' },
      { ...envelope, ciphertextBase64: Buffer.alloc(8 * 1024 * 1024 + 1, 1).toString('base64') },
    ];
    for (const e of bad) expect(() => s.stageSyntheticEnvelopeV1({ classification: 'SYNTHETIC_TEST_VECTOR', envelope: e })).toThrow('MALFORMED_HOLDOUT');
    expect(fs.readdirSync(path.join(root, 'nonce-reservations'))).toHaveLength(0);
  }));

  it('rejects inherited toJSON, hidden properties, and accessor payloads before any persistence', () => withRoot(root => {
    const s = store(root);
    const valid = validEnvelope();
    const poisoned = Object.assign(Object.create({ toJSON: () => ({ PLAINTEXT_LEAKED: 'synthetic-secret-injection' }) }), valid);
    const accessor = { ...valid };
    Object.defineProperty(accessor, 'ciphertextBase64', {
      enumerable: true, get() { throw new Error('SENSITIVE_INPUT_MUST_NOT_LEAK'); },
    });
    const hidden = { ...valid };
    Object.defineProperty(hidden, 'toJSON', { enumerable: false, value() { return { unsafe: true }; } });
    const symbol = { ...valid, [Symbol('hidden')]: 'extra' };
    for (const envelope of [poisoned, accessor, hidden, symbol]) {
      expect(() => s.stageSyntheticEnvelopeV1({ classification: 'SYNTHETIC_TEST_VECTOR', envelope })).toThrow('MALFORMED_HOLDOUT');
    }
    expect(fs.readdirSync(path.join(root, 'objects'))).toHaveLength(0);
    expect(fs.readdirSync(path.join(root, 'nonce-reservations'))).toHaveLength(0);
  }));

  it('blocks non-synthetic classification and refuses ordinary runtime credentials', () => withRoot(root => {
    const s = store(root);
    expect(() => s.stageSyntheticEnvelopeV1({ classification: 'REAL', envelope: validEnvelope() })).toThrow('MISSING_VAULT_CAPABILITY');
    expect(() => store(root, { ...environment, SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-role' })).toThrow('MISSING_VAULT_CAPABILITY');
    expect(() => createSyntheticPrivateCiphertextStoreV1({ rootDirectory: root, environment, storageMode: 'PRODUCTION' })).toThrow('VAULT_UNAVAILABLE');
  }));

  it('rejects world-readable and group-readable roots; never repairs them silently', () => withRoot(root => {
    fs.chmodSync(root, 0o755);
    expect(() => store(root)).toThrow('VAULT_UNAVAILABLE');
    expect(fs.statSync(root).mode & 0o777).toBe(0o755);
  }));

  it('rejects symlinked root, invalid/relative roots and source-folder authority', () => withRoot(root => {
    const link = `${root}-symlink`;
    fs.symlinkSync(root, link);
    try {
      expect(() => store(link)).toThrow('VAULT_UNAVAILABLE');
      expect(() => store('./storage')).toThrow('VAULT_UNAVAILABLE');
      expect(() => store(process.cwd())).toThrow('VAULT_UNAVAILABLE');
    } finally { fs.unlinkSync(link); }
  }));

  it('fails closed when the nonce index is corrupted or has a symlink', () => withRoot(root => {
    store(root);
    const idx = path.join(root, 'nonce-reservations');
    fs.rmSync(idx, { recursive: true });
    fs.symlinkSync(path.join(root, 'objects'), idx);
    expect(() => store(root)).toThrow('VAULT_UNAVAILABLE');
  }));

  it('does not change worker readiness nor add any public secret endpoint', async () => {
    const fsPath = path.join(process.cwd(), 'workers/investing-blind-vault/isolatedServer.mjs');
    const serverCode = fs.readFileSync(fsPath, 'utf8');
    expect(serverCode).not.toContain('privateCiphertextStore');
    const ordinaryBarrel = fs.readFileSync(path.join(process.cwd(), 'lib/investing/research/index.ts'), 'utf8');
    expect(ordinaryBarrel).not.toContain('privateCiphertextStore');
  });
});
