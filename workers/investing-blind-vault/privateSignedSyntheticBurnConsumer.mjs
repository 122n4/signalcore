/**
 * RL-9C2B2G — isolated worker, SYNTHETIC-ONLY signed PG-burn fixture bridge.
 *
 * An Ed25519 signature binds one fixture event, committed-reservation
 * identity, and ciphertext object. The worker never accepts an unsigned,
 * independently supplied event hash as authority through this facade.
 *
 * IMPORTANT: The worker cannot verify that the signing service queried
 * PostgreSQL correctly. Issuer trust and physical isolation are NOT proved;
 * this module MUST NOT be wired into isolatedServer.mjs or used with real
 * holdouts. It returns only synthetic encrypted envelopes, never plaintext.
 */
import { createHash, createPublicKey, timingSafeEqual, verify } from 'node:crypto';
import { createSyntheticVaultConsumeOnceRehearsalV1 } from './privateSyntheticConsumeOnce.mjs';

const DOMAIN = 'SYNTRAKE:RL9_SYNTHETIC_COMMITTED_BURN_ATTESTATION:V1\n';
const HEX64 = /^[0-9A-F]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const BASE64 = /^[A-Za-z0-9+/]{86}==$/u;
const MAX_AGE_MS = 60_000;
const FUTURE_SKEW_MS = 5_000;
const CLAIM_FIELDS = [
  'schemaVersion', 'audience', 'tenantId', 'registrationHashHex',
  'evaluationHashHex', 'revealStartedEventHashHex', 'burnReservationId',
  'burnState', 'privateObjectLocator', 'issuedAtMs', 'expiresAtMs',
];
const TOKEN_FIELDS = ['claims','signatureBase64'];
const CONFIG_FIELDS = ['syntheticStoreConfig','trustedSignerPublicKeyDer','trustedSignerPublicKeySha256Hex'];

function deny() { throw new Error('AUTHORITY_FAILURE'); }
function snapshot(value, keys) {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        (Object.getPrototypeOf(value) !== Object.prototype &&
         Object.getPrototypeOf(value) !== null)) deny();
    const own = Reflect.ownKeys(value);
    if (own.length !== keys.length ||
        own.some(k => typeof k !== 'string' || !keys.includes(k))) deny();
    const clean = Object.create(null);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of keys) {
      const d = descriptors[key];
      if (!d || !d.enumerable || !('value' in d)) deny();
      clean[key] = d.value;
    }
    return Object.freeze(clean);
  } catch { deny(); }
}
function claimsV1(untrusted) {
  const data = snapshot(untrusted, CLAIM_FIELDS);
  if (data.schemaVersion !== 'RL9_SYNTHETIC_COMMITTED_BURN_ATTESTATION_V1' ||
      data.audience !== 'ISOLATED_VAULT_SYNTHETIC_TEST_ONLY' ||
      data.burnState !== 'BURNED_NOT_AUTHORIZED' ||
      typeof data.tenantId !== 'string' || !UUID.test(data.tenantId) ||
      typeof data.burnReservationId !== 'string' || !UUID.test(data.burnReservationId) ||
      ['registrationHashHex','evaluationHashHex','revealStartedEventHashHex',
        'privateObjectLocator'].some(k => typeof data[k] !== 'string' || !HEX64.test(data[k])) ||
      typeof data.issuedAtMs !== 'number' || !Number.isSafeInteger(data.issuedAtMs) ||
      typeof data.expiresAtMs !== 'number' || !Number.isSafeInteger(data.expiresAtMs) ||
      data.issuedAtMs < 0 || data.expiresAtMs <= data.issuedAtMs ||
      data.expiresAtMs - data.issuedAtMs > MAX_AGE_MS) deny();
  // Stable, exact signed byte representation, independent of caller key order.
  return Object.freeze(Object.fromEntries(CLAIM_FIELDS.map(key=>[key,data[key]])));
}

/** Pure canonicalization for disposable issuer tests; NOT a signing authority. */
export function syntheticBurnAttestationSigningBytesV1(claims) {
  return Buffer.from(DOMAIN + JSON.stringify(claimsV1(claims)), 'utf8');
}

/**
 * PINNED ED25519 PUBLIC KEY; never accept a signing key, bearer token,
 * Supabase service_role or an ordinary app's caller claims as trust.
 */
export function createVerifiedSyntheticBurnConsumerV1(untrustedConfig) {
  const config = snapshot(untrustedConfig, CONFIG_FIELDS);
  const rawKey = config.trustedSignerPublicKeyDer;
  if (!Buffer.isBuffer(rawKey) || rawKey.length < 32 || rawKey.length > 512 ||
      typeof config.trustedSignerPublicKeySha256Hex !== 'string' ||
      !HEX64.test(config.trustedSignerPublicKeySha256Hex)) deny();
  let publicKey;
  try {
    const publicKeyBytes = Buffer.from(rawKey);
    const actual = createHash('sha256').update(publicKeyBytes).digest();
    const expected = Buffer.from(config.trustedSignerPublicKeySha256Hex,'hex');
    if (actual.length !== expected.length || !timingSafeEqual(actual,expected)) deny();
    publicKey = createPublicKey({key:publicKeyBytes,format:'der',type:'spki'});
    if (publicKey.asymmetricKeyType !== 'ed25519') deny();
  } catch { deny(); }

  // Synthetic storage factory still rejects copied ordinary app credentials,
  // weak root permissions, Windows POSIX claims and any REAL storage mode.
  const synthetic = createSyntheticVaultConsumeOnceRehearsalV1(config.syntheticStoreConfig);
  return Object.freeze({
    consumeSignedSyntheticBurnOnceV1(untrustedToken) {
      const token = snapshot(untrustedToken,TOKEN_FIELDS);
      const claims = claimsV1(token.claims);
      if (typeof token.signatureBase64 !== 'string' ||
          !BASE64.test(token.signatureBase64)) deny();
      const sig = Buffer.from(token.signatureBase64,'base64');
      if (sig.length !== 64 || sig.toString('base64') !== token.signatureBase64) deny();
      const now = Date.now();
      if (claims.issuedAtMs > now + FUTURE_SKEW_MS ||
          claims.expiresAtMs <= now) deny();
      const body = syntheticBurnAttestationSigningBytesV1(claims);
      try {
        if (!verify(null, body, publicKey, sig)) deny();
      } catch { deny(); }
      // Signed claim is still only a SYNTHETIC replay exercise, not proof
      // of a real PostgreSQL issuer, physical Vault boundary, or byte grant.
      // Read must remain unavailable via all deployed/public ingress paths.
      return synthetic.consumeSyntheticSealedEnvelopeOnceV1({
        classification:'SYNTHETIC_TEST_VECTOR',
        privateObjectLocator:claims.privateObjectLocator,
        evaluationHashHex:claims.evaluationHashHex,
        revealStartedEventHashHex:claims.revealStartedEventHashHex,
      });
    },
  });
}
