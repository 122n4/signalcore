import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  InvestingEnginePersistenceReaderV1,
  InvestingEnginePersistenceServiceV1,
  InvestingEngineReplayServiceV1,
} from "@/lib/investing/engine/v1/persistence";
import { PostgresInvestingEnginePersistenceAdapterV1 as Adapter } from "@/lib/investing/engine/v1/persistence/postgres";
import {
  assertDestructiveInvestingQaDatabase,
  assertEffectiveDestructiveInvestingQaDatabase,
} from "@/scripts/qa/investingDestructiveQaGuard";
import { InvestingEnginePhase4CIntegrityScanner } from "@/scripts/qa/investingEnginePhase4CIntegrityScanner";
import {
  buildPhase4BInput,
  PHASE4B_ACCOUNT_ID,
  purePhase3FRunnerForPersistence,
} from "@/tests/fixtures/investingEnginePhase4BFixture";
import { constraint, d } from "@/tests/fixtures/investingEnginePhase3FFixture";

const databaseUrl = process.env.INVESTING_4C_TEST_DATABASE_URL;
const configuredDatabaseUrl = databaseUrl ?? "postgresql://invalid/phase4c_not_configured";
const pgDescribe = databaseUrl ? describe : describe.skip;
const destructiveTarget = databaseUrl
  ? assertDestructiveInvestingQaDatabase(
      databaseUrl,
      process.env.ALLOW_DESTRUCTIVE_INVESTING_QA,
    )
  : null;

const OWNERS = [
  { ownerId: "user_phase3f_1", accountId: PHASE4B_ACCOUNT_ID },
  { ownerId: "phase4c_owner_b", accountId: "55555555-5555-4555-8555-555555555555" },
  { ownerId: "phase4c_owner_c", accountId: "66666666-6666-4666-8666-666666666666" },
] as const;

function ownerModelOverrides(ownerIndex: number) {
  return ownerIndex === 0
    ? undefined
    : { VWCE: { commissionBps: d(String(30 + ownerIndex)) } };
}

function ownerConstraints(ownerIndex: number) {
  return ownerIndex === 0
    ? undefined
    : [constraint({ id: `phase4c_owner_${ownerIndex}` })];
}

function percentile(values: readonly number[], quantile: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1);
  return Number(sorted[Math.max(0, index)].toFixed(3));
}

function processPersist(runId: string, idempotencyKey: string): Promise<{ status: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      "-r",
      "./scripts/register-alias.cjs",
      "./node_modules/jiti/bin/jiti.js",
      "tests/fixtures/investingEnginePhase4BProcessWorker.ts",
    ], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        INVESTING_4B_TEST_DATABASE_URL: configuredDatabaseUrl,
        INVESTING_4B_PROCESS_RUN_ID: runId,
        INVESTING_4B_PROCESS_IDEMPOTENCY_KEY: idempotencyKey,
      },
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("exit", (exitCode) => {
      if (exitCode !== 0) {
        reject(new Error(`phase4c_process_failed:${exitCode}:${stderr}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim().split(/\r?\n/u).at(-1) ?? ""));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function processIntegrityScan(): Promise<{
  exitCode: number | null;
  report: {
    status: string;
    issues: readonly { code: string }[];
  };
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      "-r",
      "./scripts/register-alias.cjs",
      "./node_modules/jiti/bin/jiti.js",
      "scripts/qa/runInvestingEnginePhase4CIntegrityScan.ts",
    ], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        INVESTING_4C_TEST_DATABASE_URL: configuredDatabaseUrl,
      },
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("exit", (exitCode) => {
      try {
        resolve({
          exitCode,
          report: JSON.parse(stdout.trim()) as {
            status: string;
            issues: readonly { code: string }[];
          },
        });
      } catch (error) {
        reject(new Error(`phase4c_integrity_cli_invalid:${exitCode}:${stderr}`, {
          cause: error,
        }));
      }
    });
  });
}

function crashDuringReadPhase(phase: "load" | "verify" | "replay"): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      "-r",
      "./scripts/register-alias.cjs",
      "./node_modules/jiti/bin/jiti.js",
      "tests/fixtures/investingEnginePhase4CReadCrashWorker.ts",
    ], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        INVESTING_4C_READ_CRASH_DATABASE_URL: configuredDatabaseUrl,
        INVESTING_4C_READ_CRASH_PHASE: phase,
      },
      windowsHide: true,
    });
    let pending = "";
    let stderr = "";
    let killed = false;
    child.stdout.on("data", (chunk) => {
      pending += String(chunk);
      if (!killed && pending.includes(`"phase":"${phase}"`)) {
        killed = child.kill("SIGKILL");
      }
    });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("exit", (exitCode, signal) => {
      if (!killed || (exitCode === 0 && signal === null)) {
        reject(new Error(`phase4c_read_crash_failed:${phase}:${exitCode}:${signal}:${stderr}`));
        return;
      }
      resolve();
    });
  });
}

pgDescribe("FASE 4C PostgreSQL operational validation", () => {
  const admin = new pg.Pool({ connectionString: configuredDatabaseUrl, max: 12 });
  const adapter = new Adapter({ connectionString: configuredDatabaseUrl, max: 12 });
  const service = new InvestingEnginePersistenceServiceV1(adapter);
  const reader = new InvestingEnginePersistenceReaderV1(adapter);
  const replay = new InvestingEngineReplayServiceV1(
    reader,
    purePhase3FRunnerForPersistence,
  );

  function scanner() {
    return new InvestingEnginePhase4CIntegrityScanner({
      pool: admin,
      reader,
      replay,
    });
  }

  beforeAll(async () => {
    const effective = await admin.connect();
    try {
      const parameters = (effective as unknown as {
        connectionParameters: { host: string; port: number; database: string };
      }).connectionParameters;
      assertEffectiveDestructiveInvestingQaDatabase(destructiveTarget!, parameters);
    } finally {
      effective.release();
    }
    for (const owner of OWNERS) {
      await admin.query(
        `insert into public.investing_accounts(
           id,user_id,portfolio_id,base_currency,environment,status
         ) values($1,$2,$3,'EUR','paper','active') on conflict(id) do nothing`,
        [owner.accountId, owner.ownerId, `phase4c-${owner.ownerId}`],
      );
    }
  });

  afterAll(async () => {
    await adapter.close();
    await admin.end();
  });

  it("starts empty, passes R5 and scans without writes", async () => {
    const gateClient = await admin.connect();
    try {
      await gateClient.query("begin read only");
      await gateClient.query("set local role service_role");
      const gate = await gateClient.query(
        "select public.investing_engine_historical_gate_v1() report",
      );
      expect(gate.rows[0].report.decision).toBe("historical_set_empty");
      expect(gate.rows[0].report.counts.totalRelevantRows).toBe(0);
      await gateClient.query("rollback");
    } finally {
      gateClient.release();
    }

    const before = await scanner().scan();
    const after = await scanner().scan();
    expect(before.status).toBe("clean");
    expect(before.writes).toBe("none");
    expect(before.counts).toEqual({
      investing_engine_runs: 0,
      investing_engine_artifacts: 0,
      investing_engine_phase_summaries: 0,
      investing_engine_reason_evidence: 0,
      investing_engine_shadow_packages: 0,
      investing_engine_idempotency_keys: 0,
    });
    expect(after.tableHashes).toEqual(before.tableHashes);
    expect(after.reportHash).toBe(before.reportHash);
  });

  it("persists, reloads, verifies and replays after process and pool restart", async () => {
    const runId = "phase4c_canonical_restart";
    const input = buildPhase4BInput({
      userId: OWNERS[0].ownerId,
      accountId: OWNERS[0].accountId,
      runId,
      idempotencyKey: runId,
    }).input;
    expect((await service.persist(input)).status).toBe("inserted");
    expect((await service.persist(input)).status).toBe("idempotent_existing");

    const restartedAdapter = new Adapter({ connectionString: configuredDatabaseUrl, max: 2 });
    try {
      const restartedService = new InvestingEnginePersistenceServiceV1(restartedAdapter);
      const loaded = await restartedService.reader.loadByRunId({
        ownerId: OWNERS[0].ownerId,
        accountId: OWNERS[0].accountId,
        runId,
      });
      const replayed = await new InvestingEngineReplayServiceV1(
        restartedService.reader,
        purePhase3FRunnerForPersistence,
      ).replay(loaded.loaded.run.identity);
      expect(replayed.status).toBe("replay_match");
      expect(replayed.persistedFinalResultHash).toBe(replayed.replayedFinalResultHash);
      expect((await restartedService.persist(input)).status).toBe("idempotent_existing");
    } finally {
      await restartedAdapter.close();
    }

    const processResults = await Promise.all([
      processPersist("phase4c_process_restart", "phase4c_process_restart"),
      processPersist("phase4c_process_restart", "phase4c_process_restart"),
    ]);
    expect(processResults.map((result) => result.status).sort()).toEqual([
      "idempotent_existing",
      "inserted",
    ]);
  }, 30_000);

  it("serializes retries while isolating owners and allowing independent keys", async () => {
    const exact = buildPhase4BInput({
      userId: OWNERS[1].ownerId,
      accountId: OWNERS[1].accountId,
      runId: "phase4c_concurrent_exact",
      idempotencyKey: "phase4c_concurrent_exact",
      cash: "1801",
      modelOverrides: ownerModelOverrides(1),
      constraints: ownerConstraints(1),
    }).input;
    const exactResults = await Promise.all([service.persist(exact), service.persist(exact)]);
    expect(exactResults.map((result) => result.status).sort()).toEqual([
      "idempotent_existing",
      "inserted",
    ]);

    const independent = await Promise.all(OWNERS.slice(1).map((owner, index) =>
      service.persist(buildPhase4BInput({
        userId: owner.ownerId,
        accountId: owner.accountId,
        runId: `phase4c_owner_independent_${index}`,
        idempotencyKey: `phase4c_owner_independent_${index}`,
        cash: String(800 + index),
        modelOverrides: ownerModelOverrides(index + 1),
        constraints: ownerConstraints(index + 1),
      }).input)));
    expect(independent.every((result) => result.status === "inserted")).toBe(true);

    await expect(reader.loadByRunId({
      ownerId: OWNERS[2].ownerId,
      accountId: OWNERS[2].accountId,
      runId: "phase4c_owner_independent_0",
    })).rejects.toMatchObject({ code: "persistence_not_found" });

    const scopes = independent.map((result) => ({
      ownerId: result.ownerId,
      accountId: result.accountId,
      runId: result.runId,
    }));
    const replays = await Promise.all(scopes.map((scope) => replay.replay(scope)));
    expect(replays.every((result) => result.status === "replay_match")).toBe(true);
  }, 30_000);

  it("recalculates real payload hashes and fails closed for payload-only corruption", async () => {
    const runId = "phase4c_canonical_restart";
    const artifactType = "canonical_input";
    const baseline = await scanner().scan();
    expect(baseline.status).toBe("clean");
    expect(baseline.runChecks.every((check) =>
      check.loadVerifyStatus === "verified"
      && check.replayStatus === "replay_match"
      && check.manifestHash !== null)).toBe(true);

    const artifact = await admin.query<{ canonical_payload: string; content_hash: string }>(
      `select canonical_payload,content_hash
       from public.investing_engine_artifacts
       where run_id=$1 and artifact_type=$2`,
      [runId, artifactType],
    );
    const originalPayload = artifact.rows[0].canonical_payload;
    const originalContentHash = artifact.rows[0].content_hash;
    const tamperedPayload = originalPayload.replace(
      '"asOf":"2026-07-20T10:00:00.000Z"',
      '"asOf":"2026-07-20T10:00:01.000Z"',
    );
    expect(tamperedPayload).not.toBe(originalPayload);

    const replacePayload = async (canonicalPayload: string) => {
      const client = await admin.connect();
      try {
        await client.query("set session_replication_role=replica");
        await client.query(
          `update public.investing_engine_artifacts
           set canonical_payload=$3
           where run_id=$1 and artifact_type=$2`,
          [runId, artifactType, canonicalPayload],
        );
      } finally {
        await client.query("set session_replication_role=origin");
        client.release();
      }
    };

    await replacePayload(tamperedPayload);
    try {
      const stored = await admin.query<{ content_hash: string }>(
        `select content_hash from public.investing_engine_artifacts
         where run_id=$1 and artifact_type=$2`,
        [runId, artifactType],
      );
      expect(stored.rows[0].content_hash).toBe(originalContentHash);

      const first = await scanner().scan();
      const second = await scanner().scan();
      const codes = first.issues.map((entry) => entry.code);
      expect(first.status).toBe("blocked");
      expect(codes).toContain("ARTIFACT_CONTENT_HASH_MISMATCH");
      expect(codes).toContain("LOAD_VERIFY_FAILED");
      expect(codes).toContain("REPLAY_BLOCKED");
      expect(codes).toContain("MANDATORY_CHECK_INCOMPLETE");
      expect(second.status).toBe("blocked");
      expect(second.issues).toEqual(first.issues);
      expect(second.tableHashes).toEqual(first.tableHashes);
      expect(second.reportHash).toBe(first.reportHash);

      const cli = await processIntegrityScan();
      expect(cli.exitCode).toBe(2);
      expect(cli.report.status).toBe("blocked");
      expect(cli.report.issues.map((entry) => entry.code)).toContain(
        "ARTIFACT_CONTENT_HASH_MISMATCH",
      );
    } finally {
      await replacePayload(originalPayload);
    }

    const recovered = await scanner().scan();
    expect(recovered.status).toBe("clean");
    expect(recovered.tableHashes).toEqual(baseline.tableHashes);
    expect(recovered.reportHash).toBe(baseline.reportHash);
  }, 30_000);

  it("blocks controlled corruption and returns to the same fingerprint after recovery", async () => {
    const baseline = await scanner().scan();
    expect(baseline.status).toBe("clean");
    const runId = "phase4c_canonical_restart";
    const artifact = await admin.query(
      `select artifact_type,content_hash from public.investing_engine_artifacts
       where run_id=$1 order by artifact_type limit 1`,
      [runId],
    );
    const artifactType = artifact.rows[0].artifact_type;
    const contentHash = artifact.rows[0].content_hash;

    await admin.query("set session_replication_role=replica");
    try {
      await admin.query(
        `update public.investing_engine_artifacts set content_hash=$3
         where run_id=$1 and artifact_type=$2`,
        [runId, artifactType, "0".repeat(64)],
      );
    } finally {
      await admin.query("set session_replication_role=origin");
    }
    try {
      const corrupted = await scanner().scan();
      expect(corrupted.status).toBe("blocked");
      expect(corrupted.issues.map((entry) => entry.code)).toContain(
        "ARTIFACT_CONTENT_HASH_MISMATCH",
      );
      expect(corrupted.issues.map((entry) => entry.code)).toContain(
        "ARTIFACT_ROOT_HASH_MISMATCH",
      );
    } finally {
      await admin.query("set session_replication_role=replica");
      try {
        await admin.query(
          `update public.investing_engine_artifacts set content_hash=$3
           where run_id=$1 and artifact_type=$2`,
          [runId, artifactType, contentHash],
        );
      } finally {
        await admin.query("set session_replication_role=origin");
      }
    }

    await admin.query("set session_replication_role=replica");
    try {
      await admin.query(
        `update public.investing_engine_artifacts set run_id='phase4c_orphan_probe'
         where run_id=$1 and artifact_type=$2`,
        [runId, artifactType],
      );
    } finally {
      await admin.query("set session_replication_role=origin");
    }
    try {
      const incomplete = await scanner().scan();
      const issueCodes = incomplete.issues.map((entry) => entry.code);
      expect(issueCodes).toContain("ARTIFACT_INVENTORY_MISSING");
      expect(issueCodes).toContain("ORPHAN_ARTIFACT");
      expect(incomplete.status).toBe("blocked");
    } finally {
      await admin.query("set session_replication_role=replica");
      try {
        await admin.query(
          `update public.investing_engine_artifacts set run_id=$1
           where run_id='phase4c_orphan_probe' and artifact_type=$2`,
          [runId, artifactType],
        );
      } finally {
        await admin.query("set session_replication_role=origin");
      }
    }

    const recovered = await scanner().scan();
    expect(recovered.status).toBe("clean");
    expect(recovered.tableHashes).toEqual(baseline.tableHashes);
    expect(recovered.reportHash).toBe(baseline.reportHash);
  }, 30_000);

  it("survives process crashes during load, verify and replay without writes or locks", async () => {
    const before = await scanner().scan();
    expect(before.status).toBe("clean");
    for (const phase of ["load", "verify", "replay"] as const) {
      await crashDuringReadPhase(phase);
    }
    const after = await scanner().scan();
    const waitingLocks = await admin.query(
      `select count(*)::int count from pg_locks
       where database=(select oid from pg_database where datname=current_database())
         and not granted`,
    );
    expect(after.status).toBe("clean");
    expect(after.tableHashes).toEqual(before.tableHashes);
    expect(after.reportHash).toBe(before.reportHash);
    expect(waitingLocks.rows[0].count).toBe(0);
  }, 30_000);

  it("records bounded capacity observations without inventing targets", async () => {
    const latencies: number[] = [];
    for (let index = 0; index < 24; index += 1) {
      const owner = OWNERS[index % OWNERS.length];
      const runId = `phase4c_capacity_${String(index).padStart(3, "0")}`;
      const startedAt = performance.now();
      await service.persist(buildPhase4BInput({
        userId: owner.ownerId,
        accountId: owner.accountId,
        runId,
        idempotencyKey: runId,
        cash: String(1_000 + index),
        modelOverrides: ownerModelOverrides(index % OWNERS.length),
        constraints: ownerConstraints(index % OWNERS.length),
      }).input);
      latencies.push(performance.now() - startedAt);
    }

    const scanStartedAt = performance.now();
    const report = await scanner().scan();
    const scanDurationMs = performance.now() - scanStartedAt;
    const database = await admin.query(
      `select pg_database_size(current_database())::bigint::text size_bytes,
              (select count(*)::int from pg_stat_activity where datname=current_database()) connections,
              (select count(*)::int from pg_locks where database=(
                select oid from pg_database where datname=current_database()
              ) and not granted) waiting_locks`,
    );
    const metrics = {
      syntheticRuns: 24,
      owners: OWNERS.length,
      artifactsPerRun: 12,
      persistLatencyMs: {
        p50: percentile(latencies, 0.5),
        p95: percentile(latencies, 0.95),
        p99: percentile(latencies, 0.99),
      },
      scanDurationMs: Number(scanDurationMs.toFixed(3)),
      databaseSizeBytes: Number(database.rows[0].size_bytes),
      connections: database.rows[0].connections,
      waitingLocks: database.rows[0].waiting_locks,
      finalCounts: report.counts,
    };
    console.info(`[FASE 4C CAPACITY] ${JSON.stringify(metrics)}`);
    expect(report.status).toBe("clean");
    expect(metrics.waitingLocks).toBe(0);
    expect(metrics.persistLatencyMs.p99).toBeGreaterThanOrEqual(metrics.persistLatencyMs.p50);
  }, 60_000);
});
