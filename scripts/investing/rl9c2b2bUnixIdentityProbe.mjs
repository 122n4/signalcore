/**
 * RL-9C2B2B: disposable Linux kernel UID isolation rehearsal.
 * ONLY synthetic bytes. NOT a deployed Vault or a storage credential proof.
 * Must run as root on an ephemeral CI runner without application secrets.
 */
import { randomInt } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chownSync, chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PRIVATE_MARKER = 'SYNTRAKE_RL9C2B2B_SYNTHETIC_NONREAL_OBJECT_V1\n';
const RESTRICTED_ENV = /^(?:SUPABASE_|NEXT_|NEXT_PUBLIC_|DATABASE_URL$|CLERK_|STRIPE_|PGPASSWORD$|ALPACA_|TRADING_|INVESTING_)/u;
const DENIED_CODES = new Set(['EACCES', 'EPERM']);
function fail() { throw new Error('RL9C2B2B_ISOLATION_PROOF_FAILED'); }

function probe(target) {
  try {
    const observed = readFileSync(target, 'utf8');
    if (observed !== PRIVATE_MARKER) fail();
    process.stdout.write('AUTHORIZED_SYNTHETIC_READ\n');
  } catch (error) {
    if (DENIED_CODES.has(error?.code)) process.stdout.write('DENIED_BY_OS\n');
    else fail();
  }
}

function chooseUnusedUids() {
  const passwd = readFileSync('/etc/passwd', 'utf8');
  const used = new Set(passwd.split('\n').filter(Boolean).map(line => Number(line.split(':')[2])));
  for (let i = 0; i < 50; i++) {
    const candidate = randomInt(250000, 600000);
    if (candidate !== 0 && !used.has(candidate) && !used.has(candidate + 1)) return [candidate, candidate + 1];
  }
  fail();
}

function runAs(uid, gid, script, protectedFile, extra = {}) {
  const result = spawnSync(process.execPath, [script, '--probe', protectedFile], {
    uid, gid, cwd: tmpdir(), encoding: 'utf8', timeout: 5000,
    env: { SYNTRAKE_TEST_CLASSIFICATION: 'SYNTHETIC_ONLY', ...extra },
    maxBuffer: 512,
  });
  if (result.error || result.signal || result.status !== 0 || result.stderr) fail();
  return result.stdout;
}

function main() {
  if (process.platform !== 'linux' || process.getuid?.() !== 0 || process.geteuid?.() !== 0) fail();
  if (Object.entries(process.env).some(([key, value]) => RESTRICTED_ENV.test(key) && value)) fail();
  const [ordinaryUid, vaultUid] = chooseUnusedUids();
  const directory = mkdtempSync(join(tmpdir(), 'syntrake-rl9c2b2b-'));
  const objectPath = join(directory, 'synthetic-private-envelope');
  try {
    writeFileSync(objectPath, PRIVATE_MARKER, { mode: 0o600, flag: 'wx' });
    chmodSync(directory, 0o700);
    chmodSync(objectPath, 0o600);
    chownSync(objectPath, vaultUid, vaultUid);
    chownSync(directory, vaultUid, vaultUid);
    const directoryStat = statSync(directory);
    const objectStat = statSync(objectPath);
    if ((directoryStat.mode & 0o777) !== 0o700 || directoryStat.uid !== vaultUid ||
        (objectStat.mode & 0o777) !== 0o600 || objectStat.uid !== vaultUid) fail();
    const script = fileURLToPath(import.meta.url);
    if (runAs(vaultUid, vaultUid, script, objectPath) !== 'AUTHORIZED_SYNTHETIC_READ\n') fail();
    // The ordinary application principal can hold a synthetic service_role string,
    // but cannot traverse the directory belonging to another Linux UID.
    const denied = runAs(ordinaryUid, ordinaryUid, script, objectPath, {
      SUPABASE_SERVICE_ROLE_KEY: 'SYNTHETIC_NOT_REAL_OR_AUTHORITY',
    });
    if (denied !== 'DENIED_BY_OS\n') fail();
    // Linux root always bypasses discretionary UID separation; production must
    // demonstrate that the ordinary runtime is non-root and lacks privilege escalation.
    if (!existsSync(objectPath) || readFileSync(objectPath, 'utf8') !== PRIVATE_MARKER) fail();
    process.stdout.write('RL9C2B2B_LINUX_TWO_PRINCIPAL_REHEARSAL_PASS\n');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[2] === '--probe') {
  if (process.argv.length !== 4 || process.env.SYNTRAKE_TEST_CLASSIFICATION !== 'SYNTHETIC_ONLY') fail();
  probe(resolve(process.argv[3]));
} else if (process.argv.length === 2) main();
else fail();
