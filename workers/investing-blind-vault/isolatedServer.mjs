/**
 * RL-9C2B1 — separate-process mTLS ingress boundary (NOT a secret vault).
 * Does not import app/, ordinary Investing/Trading, Supabase, or envelope.ts.
 * No seal, read, preview, list, decrypt or consume endpoint is available.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import https from 'node:https';

const SHA256_HEX = /^[A-F0-9]{64}$/u;
const FORBIDDEN_ENV = /^(?:NEXT_|NEXT_PUBLIC_|VERCEL_|SUPABASE_|CLERK_|STRIPE_|TRADING_|INVESTING_|ALPACA_|FINNHUB_|TWELVE_DATA_|DATABASE_URL$|POSTGRES_|PGHOST$|PGPORT$|PGUSER$|PGDATABASE$|PGPASSWORD$)/u;
const MODE = 'ISOLATED_SECRET_VAULT_V1';
const SERVER_FIELDS = ['serverKey', 'serverCertificate', 'clientCaCertificate', 'trustedClientCertificateSha256', 'environment'];

function fail(code = 'MISSING_VAULT_CAPABILITY') {
  throw new Error(code);
}

function exactFields(value, fields) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail();
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length || expected.some((field, i) => field !== actual[i])) fail();
}

/** Boot must fail if copied into the ordinary Next/Supabase/Trading process. */
export function assertIsolatedVaultEnvironmentV1(environment) {
  if (environment === null || typeof environment !== 'object' || Array.isArray(environment)) fail();
  if (environment.SYNTRAKE_VAULT_WORKER_MODE !== MODE) fail();
  for (const [name, value] of Object.entries(environment)) {
    if (FORBIDDEN_ENV.test(name) && value !== undefined && value !== '') fail();
  }
  // This is only a configuration guard, NOT proof of host/process isolation.
}

function bytes(value) {
  if (!Buffer.isBuffer(value) || value.length === 0 || value.length > 256 * 1024) fail();
  return value;
}

function matchesPinnedCertificate(socket, expectedFingerprintHex) {
  if (socket.authorized !== true) return false;
  const cert = socket.getPeerCertificate(true);
  if (!cert || !Buffer.isBuffer(cert.raw) || cert.raw.length === 0) return false;
  const actual = createHash('sha256').update(cert.raw).digest();
  const expected = Buffer.from(expectedFingerprintHex, 'hex');
  return timingSafeEqual(actual, expected);
}

function reply(res, status, code = '') {
  const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-type': 'text/plain; charset=utf-8' };
  res.writeHead(status, headers);
  res.end(code);
}

/**
 * Start with no secret-storage adapter: READINESS ALWAYS FALSE.
 * mTLS verifies a privately provisioned client CA plus an exact certificate pin.
 * This boundary is NOT connected to RL-9B authority or private storage yet.
 */
export function createIsolatedVaultServerV1(config) {
  exactFields(config, SERVER_FIELDS);
  assertIsolatedVaultEnvironmentV1(config.environment);
  if (typeof config.trustedClientCertificateSha256 !== 'string' ||
      !SHA256_HEX.test(config.trustedClientCertificateSha256)) fail();
  const serverKey = bytes(config.serverKey);
  const serverCertificate = bytes(config.serverCertificate);
  const clientCaCertificate = bytes(config.clientCaCertificate);
  let server;
  try {
    server = https.createServer({
      key: serverKey,
      cert: serverCertificate,
      ca: clientCaCertificate,
      requestCert: true,
      rejectUnauthorized: true,
      minVersion: 'TLSv1.3',
      maxVersion: 'TLSv1.3',
      maxHeaderSize: 8192,
    }, (req, res) => {
      // An independent trust-root certificate alone is insufficient: require pin.
      if (!matchesPinnedCertificate(req.socket, config.trustedClientCertificateSha256)) {
        req.resume();
        return reply(res, 403, 'AUTHORITY_FAILURE');
      }
      // Never parse the path to route secret requests. No secret endpoint exists.
      if (req.method === 'GET' && req.url === '/internal/live' && !req.headers['content-length'] && !req.headers['transfer-encoding']) {
        req.resume();
        return reply(res, 204);
      }
      if (req.method === 'GET' && req.url === '/internal/ready' && !req.headers['content-length'] && !req.headers['transfer-encoding']) {
        req.resume();
        return reply(res, 503, 'VAULT_UNAVAILABLE');
      }
      req.resume();
      return reply(res, 404, 'AUTHORITY_FAILURE');
    });
  } catch {
    fail(); // Never leak credential material or TLS provider errors.
  }
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.keepAliveTimeout = 1000;
  server.maxRequestsPerSocket = 2;
  server.maxConnections = 32;
  // No application logs, error reflection, or secret-bearing telemetry.
  return server;
}
