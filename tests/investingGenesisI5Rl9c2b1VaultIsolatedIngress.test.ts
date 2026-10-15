import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, X509Certificate } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { createServer as createTcpServer, type AddressInfo } from 'node:net';
import { createIsolatedVaultServerV1, assertIsolatedVaultEnvironmentV1 } from '../workers/investing-blind-vault/isolatedServer.mjs';
import { startIsolatedVaultWorkerV1 } from '../workers/investing-blind-vault/startIsolatedWorker.mjs';

const cleanEnv = Object.freeze({ SYNTRAKE_VAULT_WORKER_MODE: 'ISOLATED_SECRET_VAULT_V1' });
let dir: string;
let ca: Buffer;
let serverCert: Buffer;
let serverKey: Buffer;
let trustedCert: Buffer;
let trustedKey: Buffer;
let untrustedCert: Buffer;
let untrustedKey: Buffer;
let pinned: string;
let port: number;
let server: ReturnType<typeof https.createServer>;

function openssl(...args: string[]) {
  execFileSync('openssl', args, { cwd: dir, stdio: 'ignore', timeout: 15000 });
}
function generateLeaf(name: string, usage: 'server' | 'client') {
  openssl('req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${name}.key`, '-out', `${name}.csr`, '-subj', `/CN=rl9c2b1-${name}`);
  const ext = usage === 'server' ? 'subjectAltName=IP:127.0.0.1\nextendedKeyUsage=serverAuth\n' : 'extendedKeyUsage=clientAuth\n';
  fs.writeFileSync(path.join(dir, `${name}.ext`), ext);
  openssl('x509', '-req', '-in', `${name}.csr`, '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial', '-out', `${name}.crt`, '-days', '1', '-sha256', '-extfile', `${name}.ext`);
}
function request(options: { client?: 'trusted' | 'untrusted'; method?: string; route?: string; authorization?: string; overridePort?: number } = {}) {
  const tlsOptions = options.client === 'trusted' ? { key: trustedKey, cert: trustedCert } : options.client === 'untrusted' ? { key: untrustedKey, cert: untrustedCert } : {};
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = https.request({
      hostname: '127.0.0.1', port: options.overridePort ?? port, path: options.route ?? '/internal/live', method: options.method ?? 'GET',
      ca, rejectUnauthorized: true, ...tlsOptions,
      headers: options.authorization ? { authorization: options.authorization } : undefined,
      timeout: 4000,
    }, res => {
      const parts: Buffer[] = [];
      res.on('data', (part: Buffer) => parts.push(part));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(parts).toString('utf8') }));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.end();
  });
}

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'syntrake-rl9c2b1-'));
  openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'ca.key', '-out', 'ca.crt', '-subj', '/CN=rl9c2b1-synthetic-ca', '-days', '1', '-sha256');
  generateLeaf('server', 'server');
  generateLeaf('trusted', 'client');
  generateLeaf('untrusted', 'client');
  ca = fs.readFileSync(path.join(dir, 'ca.crt'));
  serverCert = fs.readFileSync(path.join(dir, 'server.crt'));
  serverKey = fs.readFileSync(path.join(dir, 'server.key'));
  trustedCert = fs.readFileSync(path.join(dir, 'trusted.crt'));
  trustedKey = fs.readFileSync(path.join(dir, 'trusted.key'));
  untrustedCert = fs.readFileSync(path.join(dir, 'untrusted.crt'));
  untrustedKey = fs.readFileSync(path.join(dir, 'untrusted.key'));
  pinned = createHash('sha256').update(new X509Certificate(trustedCert).raw).digest('hex').toUpperCase();
  server = createIsolatedVaultServerV1({ serverKey, serverCertificate: serverCert, clientCaCertificate: ca, trustedClientCertificateSha256: pinned, environment: cleanEnv });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); }); });
  port = (server.address() as AddressInfo).port;
}, 45000);

afterAll(async () => {
  if (server?.listening) await new Promise<void>(resolve => server.close(() => resolve()));
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
  serverKey?.fill(0); trustedKey?.fill(0); untrustedKey?.fill(0);
});

describe('RL-9C2B1 separate worker ingress — NOT an operational vault', () => {
  it('requires isolated mode and refuses ordinary Supabase/service_role, Next, Clerk, Trading credentials', () => {
    expect(() => assertIsolatedVaultEnvironmentV1({})).toThrow('MISSING_VAULT_CAPABILITY');
    for (const name of ['SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'DATABASE_URL', 'CLERK_SECRET_KEY', 'STRIPE_SECRET_KEY', 'TRADING_BROKER_KEY']) {
      expect(() => assertIsolatedVaultEnvironmentV1({ ...cleanEnv, [name]: 'synthetic-ordinary-credential' })).toThrow('MISSING_VAULT_CAPABILITY');
    }
    expect(() => assertIsolatedVaultEnvironmentV1(cleanEnv)).not.toThrow();
  });
  it('rejects missing TLS keys, unpinned client identity, and extra config fields', () => {
    expect(() => createIsolatedVaultServerV1({ environment: cleanEnv } as never)).toThrow('MISSING_VAULT_CAPABILITY');
    expect(() => createIsolatedVaultServerV1({ serverKey, serverCertificate: serverCert, clientCaCertificate: ca, environment: cleanEnv, trustedClientCertificateSha256: 'bad' })).toThrow('MISSING_VAULT_CAPABILITY');
    expect(() => createIsolatedVaultServerV1({ serverKey, serverCertificate: serverCert, clientCaCertificate: ca, environment: cleanEnv, trustedClientCertificateSha256: pinned, storage: 'public' } as never)).toThrow('MISSING_VAULT_CAPABILITY');
  });
  it('rejects a request with only ordinary service_role bearer credentials and no client certificate', async () => {
    await expect(request({ authorization: 'Bearer synthetic-service-role' })).rejects.toThrow();
  });
  it('rejects a distinct certificate signed by the same trusted CA but not pinned', async () => {
    expect(await request({ client: 'untrusted' })).toEqual({ status: 403, body: 'AUTHORITY_FAILURE' });
  });
  it('permits pinned mTLS liveness but never reports Vault readiness', async () => {
    expect(await request({ client: 'trusted' })).toEqual({ status: 204, body: '' });
    expect(await request({ client: 'trusted', route: '/internal/ready' })).toEqual({ status: 503, body: 'VAULT_UNAVAILABLE' });
  });
  it('provides no secret storage, reveal, list, search or preview endpoint even to pinned client', async () => {
    for (const [method, route] of [['GET', '/'], ['GET', '/internal/live?preview=true'], ['GET', '/objects'], ['POST', '/seal'], ['POST', '/consume'], ['GET', '/tenant/11111111-1111-4111-8111-111111111111']]) {
      const response = await request({ client: 'trusted', method, route, authorization: 'Bearer synthetic-service-role' });
      expect(response).toEqual({ status: 404, body: 'AUTHORITY_FAILURE' });
      expect(response.body).not.toContain('synthetic-service-role');
    }
  });
  it.skipIf(process.platform === 'win32')('boots an isolated loopback process only with private TLS mounts, and remains unready', async () => {
    // Synthetic files created during this test are outside the repository.
    fs.chmodSync(path.join(dir, 'server.key'), 0o600);
    const reserve = createTcpServer();
    await new Promise<void>(resolve => reserve.listen(0, '127.0.0.1', () => resolve()));
    const availablePort = (reserve.address() as AddressInfo).port;
    await new Promise<void>(resolve => reserve.close(() => resolve()));
    const launched = await startIsolatedVaultWorkerV1({
      ...cleanEnv,
      SYNTRAKE_VAULT_TLS_KEY_PATH: path.join(dir, 'server.key'),
      SYNTRAKE_VAULT_TLS_CERT_PATH: path.join(dir, 'server.crt'),
      SYNTRAKE_VAULT_CLIENT_CA_PATH: path.join(dir, 'ca.crt'),
      SYNTRAKE_VAULT_TRUSTED_CLIENT_SHA256: pinned,
      SYNTRAKE_VAULT_BIND_PORT: String(availablePort),
    });
    try {
      expect((launched.address() as AddressInfo).address).toBe('127.0.0.1');
      expect(await request({ client: 'trusted', overridePort: availablePort, route: '/internal/ready' })).toEqual({ status: 503, body: 'VAULT_UNAVAILABLE' });
    } finally {
      await new Promise<void>(resolve => launched.close(() => resolve()));
    }
  });
  it('fails closed without private mounts or a required worker bootstrap manifest', async () => {
    await expect(startIsolatedVaultWorkerV1({})).rejects.toThrow('MISSING_VAULT_CAPABILITY');
    await expect(startIsolatedVaultWorkerV1({ ...cleanEnv, SYNTRAKE_VAULT_BIND_PORT: '0' })).rejects.toThrow('MISSING_VAULT_CAPABILITY');
    await expect(startIsolatedVaultWorkerV1({ ...cleanEnv, SYNTRAKE_VAULT_BIND_PORT: '8080', SYNTRAKE_VAULT_TRUSTED_CLIENT_SHA256: pinned, SYNTRAKE_VAULT_TLS_KEY_PATH: '/absent/key', SYNTRAKE_VAULT_TLS_CERT_PATH: '/absent/cert', SYNTRAKE_VAULT_CLIENT_CA_PATH: '/absent/ca' })).rejects.toThrow('MISSING_VAULT_CAPABILITY');
  });
});
