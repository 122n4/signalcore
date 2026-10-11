/**
 * RL-9C2B1 dedicated-process bootstrap, inert without explicit private mounts.
 * Never import from Next, Supabase, Research/AI or Trading runtimes.
 */
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createIsolatedVaultServerV1, assertIsolatedVaultEnvironmentV1 } from './isolatedServer.mjs';

const SHA256_HEX = /^[A-F0-9]{64}$/u;
const MODE = 'ISOLATED_SECRET_VAULT_V1';

function blocked() { throw new Error('MISSING_VAULT_CAPABILITY'); }
function privateFile(path, { key = false } = {}) {
  // On Windows a POSIX mode check cannot prove the ACL on the private key.
  if (process.platform === 'win32' || typeof path !== 'string' || !isAbsolute(path)) blocked();
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || (key && (stat.mode & 0o077) !== 0)) blocked();
    const actual = realpathSync(path);
    const cwd = resolve(process.cwd());
    if (actual === cwd || actual.startsWith(`${cwd}${sep}`)) blocked();
    const bytes = readFileSync(actual);
    if (bytes.length === 0 || bytes.length > 256 * 1024) blocked();
    return bytes;
  } catch { blocked(); }
}

/** A runnable process boundary, not an operational Vault. Loopback-only until audited network deployment. */
export async function startIsolatedVaultWorkerV1(environment = process.env) {
  assertIsolatedVaultEnvironmentV1(environment);
  const allowed = [
    'SYNTRAKE_VAULT_WORKER_MODE', 'SYNTRAKE_VAULT_TLS_KEY_PATH',
    'SYNTRAKE_VAULT_TLS_CERT_PATH', 'SYNTRAKE_VAULT_CLIENT_CA_PATH',
    'SYNTRAKE_VAULT_TRUSTED_CLIENT_SHA256', 'SYNTRAKE_VAULT_BIND_PORT',
  ];
  for (const name of Object.keys(environment)) {
    if (name.startsWith('SYNTRAKE_VAULT_') && !allowed.includes(name)) blocked();
  }
  if (environment.SYNTRAKE_VAULT_WORKER_MODE !== MODE ||
      !SHA256_HEX.test(environment.SYNTRAKE_VAULT_TRUSTED_CLIENT_SHA256 ?? '')) blocked();
  const portRaw = environment.SYNTRAKE_VAULT_BIND_PORT;
  if (typeof portRaw !== 'string' || !/^[1-9][0-9]{0,4}$/u.test(portRaw)) blocked();
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) blocked();

  const server = createIsolatedVaultServerV1({
    environment,
    serverKey: privateFile(environment.SYNTRAKE_VAULT_TLS_KEY_PATH, { key: true }),
    serverCertificate: privateFile(environment.SYNTRAKE_VAULT_TLS_CERT_PATH),
    clientCaCertificate: privateFile(environment.SYNTRAKE_VAULT_CLIENT_CA_PATH),
    trustedClientCertificateSha256: environment.SYNTRAKE_VAULT_TRUSTED_CLIENT_SHA256,
  });
  try {
    await new Promise((accept, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => { server.off('error', reject); accept(); });
    });
  } catch {
    server.close();
    blocked();
  }
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startIsolatedVaultWorkerV1().catch(() => {
    // Fixed failure exit, no echo of env, keys, file paths or TLS exceptions.
    process.stderr.write('MISSING_VAULT_CAPABILITY\n');
    process.exitCode = 1;
  });
}
