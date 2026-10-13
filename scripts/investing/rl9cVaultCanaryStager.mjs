/**
 * RL-9C operator-only canary staging for an already provisioned *separate*
 * Supabase Vault project. No bucket creation, no secret holdouts, no key
 * provisioning, no project mutation other than one explicitly invoked canary
 * object write. Never import into app/, Next or a Vault reveal worker.
 *
 * Execute only with operator-owned POSIX private credential mounts.
 * This code is not an RL-9C acceptance or a substitute for real isolation.
 */
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import {
  SYNTHETIC_MARKER, validateCanaryConfig, readPrivateMount,
  proveCanaryPhase, canarySubjectDigest,
} from './rl9c2b2cStorageIsolationProbe.mjs';

const BLOCKED = 'RL9C_CANARY_STAGE_BLOCKED';
const LIMIT = 2048;
const SECRET = /^sb_secret_[A-Za-z0-9_-]{22}_[A-Za-z0-9_-]{8}$/u;
const JWT_PART = /^[A-Za-z0-9_-]+$/u;
const OBJECT_PREFIX = 'rl9c2b2c-isolation-canary-v1/';
const ENV_ALLOWED = new Set([
  'SYNTRAKE_VAULT_C2C_CONFIG_FILE',
  'SYNTRAKE_VAULT_C2C_CREDENTIAL_FILE',
  'SYNTRAKE_VAULT_CANARY_STAGE_MODE',
]);
const denied = () => { throw Error(BLOCKED); };

function validServiceKey(credential) {
  if (typeof credential !== 'string' || credential.length > 4096 ||
      credential.length < 20 || /\\s/u.test(credential)) denied();
  if (credential.startsWith('sb_secret_')) {
    if (!SECRET.test(credential)) denied();
    return;
  }
  const parts = credential.split('.');
  if (parts.length !== 3 || parts.some(p => !JWT_PART.test(p))) denied();
  try {
    const parsed = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (parsed?.role !== 'service_role') denied();
  } catch { denied(); }
}

function responseBytes(response, max = LIMIT) {
  return (async () => {
    if (!response || !Number.isInteger(response.status) ||
        !response.body?.getReader) denied();
    const chunks = []; let bytes = 0;
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) denied();
      bytes += value.byteLength;
      if (bytes > max) { await reader.cancel(); denied(); }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, bytes);
  })();
}

async function request(fetcher, url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    return await fetcher(url, {
      ...options, redirect: 'manual', cache: 'no-store', signal: controller.signal,
    });
  } catch { denied(); }
  finally { clearTimeout(timer); }
}

function headers(credential, extra = {}) {
  const h = { apikey: credential, accept: 'application/json', ...extra };
  // Modern Supabase secret keys are api keys, not a JWT bearer token.
  if (!credential.startsWith('sb_secret_')) h.authorization = `Bearer ${credential}`;
  return h;
}

/**
 * Stages ONLY the single public synthetic marker, never arbitrary bytes.
 * The vault service-role credential is supplied exclusively from a separately
 * mounted private file by the operator CLI. Staging requires an extant PRIVATE
 * bucket and prohibits overwrite. The positive readback is from the existing
 * independent read-only credential-isolation probe.
 */
export async function stageExistingPrivateVaultCanaryV1({
  config: raw, credential, fetcher = fetch,
}) {
  const c = validateCanaryConfig(raw);
  validServiceKey(credential);
  if (typeof fetcher !== 'function' ||
      !c.objectPath.startsWith(OBJECT_PREFIX)) denied();
  const base = `https://${c.vaultProjectRef}.supabase.co/storage/v1`;
  const bucketUrl = `${base}/bucket/${encodeURIComponent(c.bucket)}`;
  const objectUrl = `${base}/object/${encodeURIComponent(c.bucket)}/${c.objectPath}`;
  try {
    const bucket = await request(fetcher, bucketUrl, {
      method: 'GET', headers: headers(credential),
    });
    if (bucket.status !== 200) denied();
    const rawBucket = await responseBytes(bucket);
    let metadata;
    try { metadata = JSON.parse(rawBucket.toString('utf8')); }
    catch { denied(); }
    if (metadata?.public !== false || metadata?.name !== c.bucket ||
        metadata?.id !== c.bucket) denied();

    const inserted = await request(fetcher, objectUrl, {
      method: 'POST',
      headers: headers(credential, {
        'content-type': 'text/plain; charset=utf-8',
        'x-upsert': 'false',
        'cache-control': 'no-store',
      }),
      body: SYNTHETIC_MARKER,
    });
    if (inserted.status !== 200 && inserted.status !== 201) denied();
    await inserted.body?.cancel?.();

    // A write acknowledgement alone is not proof of private byte readability.
    // The existing probe re-reads and byte-compares the synthetic marker.
    const positive = await proveCanaryPhase({
      phase: 'VAULT_POSITIVE', config: c, credential, fetcher,
    });
    if (positive.status !== 'PASS' ||
        positive.subjectDigest !== canarySubjectDigest(c)) denied();
    return Object.freeze({
      status: 'SYNTHETIC_CANARY_STAGED_AND_READBACK_VERIFIED',
      subjectDigest: positive.subjectDigest,
      classification: 'OPERATOR_SYNTHETIC_CANARY_ONLY',
    });
  } catch { denied(); }
}

function cleanEnvironment(env) {
  if (!env || typeof env !== 'object') denied();
  for (const [name, value] of Object.entries(env)) {
    if (value && (/^(?:SUPABASE_|DATABASE_URL$|PGPASSWORD$|CLERK_|STRIPE_|NEXT_PUBLIC_|INVESTING_|TRADING_)/u.test(name) ||
        (name.startsWith('SYNTRAKE_VAULT_') && !ENV_ALLOWED.has(name)))) denied();
  }
}
export async function runCanaryStagerCliV1({env=process.env,fetcher=fetch}={}) {
  cleanEnvironment(env);
  if (process.platform !== 'linux' || process.argv.length !== 2 ||
      env.SYNTRAKE_VAULT_CANARY_STAGE_MODE !== 'SYNTHETIC_CANARY_ONLY') denied();
  let config;
  try { config = JSON.parse(readPrivateMount(env.SYNTRAKE_VAULT_C2C_CONFIG_FILE)); }
  catch { denied(); }
  const credential = readPrivateMount(env.SYNTRAKE_VAULT_C2C_CREDENTIAL_FILE)
    .replace(/\\r?\\n$/u,'');
  const out = await stageExistingPrivateVaultCanaryV1({config,credential,fetcher});
  process.stdout.write(JSON.stringify(out)+'\\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCanaryStagerCliV1().catch(() => {
    process.stderr.write(BLOCKED+'\\n');
    process.exitCode = 1;
  });
}
