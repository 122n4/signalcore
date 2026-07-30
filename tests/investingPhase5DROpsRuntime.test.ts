import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/requestUser", () => ({
  getRequestUserId: vi.fn(async () => null),
}));
vi.mock("@/lib/investing/identity/infrastructure/postgresDirectory.server", () => ({
  createInvestingIdentityDirectoryPoolV1: vi.fn(() => ({
    end: vi.fn(async () => undefined),
  })),
  PostgresInvestingScopeDirectoryAdapterV1: class {
    findMemberships = vi.fn();
    findPortfolios = vi.fn();
  },
}));
vi.mock("@/lib/investing/engine/v1/persistence/postgres", () => ({
  PostgresInvestingEnginePersistenceAdapterV1: class {
    findRunByScope = vi.fn();
    findRunByIdempotency = vi.fn();
    findRunByFinalHash = vi.fn();
    findLatestRun = vi.fn();
    loadCompleteRun = vi.fn();
  },
}));

import {
  OfficialInvestingOpsReplayProjectionV1,
  OfficialInvestingOpsVerifierProjectionV1,
  ScopedInvestingOpsIntegrityProjectionV1,
} from "@/lib/investing/ops/infrastructure/projections.server";
import { PostgresInvestingOpsReadModelV1 } from
  "@/lib/investing/ops/infrastructure/postgresReadModel.server";
import { createProductionInvestingOpsRuntimeV1 } from
  "@/lib/investing/ops/infrastructure/factory.server";
import { InvestingEnginePhase4CIntegrityScanner } from
  "@/lib/investing/engine/v1/integrity/scanner.server";
import { InvestingOpsOfficialServicesAdapterV1 } from
  "@/lib/investing/ops/adapter.server";
import { createInvestingOpsSoftBudgetV1 } from
  "@/lib/investing/ops/infrastructure/softBudget.server";

const scope = {
  contractVersion: "investing-identity-context/v1",
  authenticatedUserId: "user-a",
  ownerId: "owner-a",
  tenantId: "tenant-a",
  portfolioId: "portfolio-a",
  accountId: "account-a",
  role: "owner",
  permissions: ["investing:read"],
  requestId: "request-a",
} as const;
const testBudget = {
  remainingMs: () => 5_000,
  expired: () => false,
} as const;

describe("FASE 5D-R official projections", () => {
  it("creates the soft budget once per production operation and propagates it", () => {
    const source = readFileSync(
      path.resolve(
        process.cwd(),
        "lib/investing/ops/infrastructure/factory.server.ts",
      ),
      "utf8",
    ).replace(/\r\n/gu, "\n");
    expect(source.match(/createInvestingOpsSoftBudgetV1\(/gu)).toHaveLength(1);
    for (const fragment of [
      "PostgresInvestingScopeDirectoryAdapterV1(pool, budget)",
      "PostgresInvestingOpsReadModelV1(pool, budget)",
      "budget,\n        })",
      "OfficialInvestingOpsVerifierProjectionV1(pool, budget)",
      "pool,\n          pureRunner,\n          budget",
      "InvestingOpsOfficialServicesAdapterV1(\n          dependencies,\n          budget",
    ]) {
      expect(source).toContain(fragment);
    }
  });

  it("uses one cumulative monotonic budget across every adapter stage", async () => {
    let now = 0;
    const budget = createInvestingOpsSoftBudgetV1(5_000, () => now);
    const observed: Array<readonly [string, number]> = [];
    const stage = <T>(name: string, result: T) => async () => {
      observed.push([name, budget.remainingMs()]);
      now += 1_000;
      return result;
    };
    const adapter = new InvestingOpsOfficialServicesAdapterV1({
      readModel: {
        readScope: stage("read", {
          runs: [{
            runId: "run-a",
            ownerId: scope.ownerId,
            tenantId: scope.tenantId,
            portfolioId: scope.portfolioId,
            accountId: scope.accountId,
            asOf: "2026-07-25T00:00:00.000Z",
            state: "complete",
            quality: "complete",
            requestOutcome: null,
            reasonCode: null,
            idempotencyConflict: null,
            ambiguousCommitRecovery: null,
          }],
          failures: null,
          telemetryComplete: false,
        }),
      },
      integrity: { inspectScope: stage("integrity", "pass" as const) },
      verifier: { inspectRun: stage("verifier", "pass" as const) },
      replay: { inspectRun: stage("replay", "pass" as const) },
    }, budget);
    await expect(adapter.inspect(scope)).resolves.toMatchObject({
      integrity: "pass",
      verifier: "pass",
      replay: "pass",
    });
    expect(observed).toEqual([
      ["read", 5_000],
      ["integrity", 4_000],
      ["verifier", 3_000],
      ["replay", 2_000],
    ]);
  });

  it("does not start the next OPS stage after a prior stage exhausts the budget", async () => {
    let now = 0;
    const budget = createInvestingOpsSoftBudgetV1(5_000, () => now);
    const integrity = vi.fn();
    const adapter = new InvestingOpsOfficialServicesAdapterV1({
      readModel: {
        readScope: async () => {
          now = 5_000;
          return { runs: [], failures: null, telemetryComplete: false };
        },
      },
      integrity: { inspectScope: integrity },
      verifier: { inspectRun: vi.fn() },
      replay: { inspectRun: vi.fn() },
    }, budget);
    await expect(adapter.inspect(scope)).rejects.toThrow(
      "investing_ops_budget_expired",
    );
    expect(integrity).not.toHaveBeenCalled();
  });

  it("creates a non-null production service with idempotent lifecycle", async () => {
    const runtime = createProductionInvestingOpsRuntimeV1({
      connectionString: "postgresql://postgres:postgres@127.0.0.1:1/phase5dr_unavailable",
      readUser: async () => "user-a",
    });
    expect(runtime.service).toBeTruthy();
    expect(runtime.service.snapshot).toBeTypeOf("function");
    await runtime.close();
    await runtime.close();
  });

  it("reads only the authenticated scope in a bounded read-only transaction", async () => {
    const queries: Array<readonly [string, readonly unknown[] | undefined]> = [];
    const client = {
      query: vi.fn(async (sql: string, values?: readonly unknown[]) => {
        queries.push([sql, values]);
        if (sql.includes("from public.investing_engine_runs")) {
          return {
            rows: [{
              run_id: "run-a",
              owner_id: "owner-a",
              account_id: "account-a",
              as_of: "2026-07-25T00:00:00.000Z",
              state: "complete",
              quality: "complete",
            }],
          };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const model = new PostgresInvestingOpsReadModelV1({
      connect: async () => client,
    } as never, testBudget);
    const dataset = await model.readScope(scope);
    expect(dataset.runs.map((run) => run.runId)).toEqual(["run-a"]);
    expect(dataset.failures).toBeNull();
    expect(dataset.telemetryComplete).toBe(false);
    expect(queries.some(([sql]) => sql.includes("repeatable read read only"))).toBe(true);
    expect(queries.some(([sql]) => sql.includes("set local role authenticated"))).toBe(true);
    expect(queries.some(([sql]) => sql.includes("statement_timeout"))).toBe(true);
    expect(queries.some(([, values]) => values?.includes("owner-a"))).toBe(true);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rolls back, releases and preserves the pool after a PostgreSQL read failure", async () => {
    let fail = true;
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("from public.investing_engine_runs") && fail) {
          fail = false;
          throw new Error("query_cancelled");
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const model = new PostgresInvestingOpsReadModelV1({
      connect: async () => client,
    } as never, testBudget);
    await expect(model.readScope(scope)).rejects.toThrow("query_cancelled");
    expect(client.query).toHaveBeenCalledWith("rollback");
    expect(client.release).toHaveBeenCalledOnce();
    await expect(model.readScope(scope)).resolves.toMatchObject({ runs: [] });
    expect(client.release).toHaveBeenCalledTimes(2);
  });

  it("rejects a cross-scope database row instead of filtering it", async () => {
    const client = {
      query: vi.fn(async (sql: string) => sql.includes("from public.investing_engine_runs")
        ? {
            rows: [{
              run_id: "secret-run",
              owner_id: "owner-b",
              account_id: "account-b",
              as_of: "2026-07-25T00:00:00.000Z",
              state: "complete",
              quality: "complete",
            }],
          }
        : { rows: [] }),
      release: vi.fn(),
    };
    const model = new PostgresInvestingOpsReadModelV1({
      connect: async () => client,
    } as never, testBudget);
    await expect(model.readScope(scope)).rejects.toThrow("ops_scope_projection_mismatch");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("returns pass only after the complete shared scoped scanner succeeds", async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("transaction_read_only")) return { rows: [{ read_only: "on" }] };
        if (sql.includes("count(*)::int count")) return { rows: [{ count: 0 }] };
        if (sql.includes("table_hash")) return { rows: [{ table_hash: "0".repeat(64) }] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const projection = new ScopedInvestingOpsIntegrityProjectionV1({
      pool: { connect: async () => client } as never,
      pureRunner: vi.fn() as never,
      budget: testBudget,
    });
    await expect(projection.inspectScope(scope)).resolves.toBe("pass");
    expect(client.query).toHaveBeenCalledWith("set local role authenticated");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("returns incomplete on dependency or budget failure", async () => {
    const projection = new ScopedInvestingOpsIntegrityProjectionV1({
      pool: { connect: async () => { throw new Error("secret"); } } as never,
      pureRunner: vi.fn() as never,
      budget: testBudget,
    });
    await expect(projection.inspectScope(scope)).resolves.toBe("incomplete");
  });

  it("rejects 26 runs before load or replay can scan a partial subset", async () => {
    const reader = { loadByRunId: vi.fn() };
    const replay = { replay: vi.fn() };
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("count(*)::int count")) return { rows: [{ count: 26 }] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const scanner = new InvestingEnginePhase4CIntegrityScanner({
      pool: { connect: async () => client } as never,
      reader: reader as never,
      replay: replay as never,
      scope: {
        authenticatedUserId: scope.authenticatedUserId,
        ownerId: scope.ownerId,
        accountId: scope.accountId,
        maxRuns: 25,
        timeoutMs: 5_000,
      },
    });
    await expect(scanner.scan()).rejects.toThrow(
      "investing_phase4c_scanner_budget_exceeded",
    );
    expect(reader.loadByRunId).not.toHaveBeenCalled();
    expect(replay.replay).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith("rollback");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("allows all 25 bounded runs to reach the mandatory replay check", async () => {
    const replay = {
      replay: vi.fn(async (selector: { runId: string }) => ({
        status: "replay_match",
        runId: selector.runId,
        ownerId: scope.ownerId,
        accountId: scope.accountId,
        manifestHash: `${selector.runId}-manifest`,
        persistedFinalResultHash: `${selector.runId}-hash`,
        replayedFinalResultHash: `${selector.runId}-hash`,
        mismatchPaths: [],
        errorCode: null,
        writes: "none",
      })),
    };
    const client = emptyScannerClient(25);
    const scanner = scannerWithBudget(client, replay, () => 5_000);
    const report = await scanner.scan();
    expect(report.status).toBe("blocked");
    expect(report.runChecks).toHaveLength(25);
    expect(replay.replay).toHaveBeenCalledTimes(25);
  });

  it("does not start replay when the soft budget expires first", async () => {
    const replay = { replay: vi.fn() };
    const remaining = [1_000, 0];
    const client = emptyScannerClient(1);
    const scanner = scannerWithBudget(client, replay, () => remaining.shift() ?? 0);
    await expect(scanner.scan()).rejects.toThrow("investing_phase4c_scanner_timeout");
    expect(replay.replay).not.toHaveBeenCalled();
  });

  it("waits for a synchronous replay then discards it when the budget expired", async () => {
    let expired = false;
    const replay = {
      replay: vi.fn(async () => {
        expired = true;
        return { status: "replay_match" };
      }),
    };
    const client = emptyScannerClient(1);
    const scanner = scannerWithBudget(client, replay, () => expired ? 0 : 1_000);
    await expect(scanner.scan()).rejects.toThrow("investing_phase4c_scanner_timeout");
    expect(replay.replay).toHaveBeenCalledOnce();
  });

  it("fails closed when the authenticated verifier read is unavailable", async () => {
    const projection = new OfficialInvestingOpsVerifierProjectionV1({
      connect: async () => { throw new Error("secret"); },
    } as never, testBudget);
    await expect(projection.inspectRun({ scope, runId: "run-a" }))
      .resolves.toBe("failed");
  });

  it("never converts verifier or replay failure into pass", async () => {
    const verifier = new OfficialInvestingOpsVerifierProjectionV1({
      connect: async () => { throw new Error("secret"); },
    } as never, testBudget);
    const replay = new OfficialInvestingOpsReplayProjectionV1(
      { connect: async () => { throw new Error("secret"); } } as never,
      vi.fn() as never,
      testBudget,
    );
    await expect(verifier.inspectRun({ scope, runId: "run-a" })).resolves.toBe("failed");
    await expect(replay.inspectRun({ scope, runId: "run-a" })).resolves.toBe("blocked");
  });
});

function emptyScannerClient(runCount = 0) {
  const runs = Array.from({ length: runCount }, (_, index) => ({
    run_id: `run-${index}`,
    owner_id: scope.ownerId,
    account_id: scope.accountId,
    final_result_hash: `run-${index}-hash`,
    manifest_version: "investing-engine-persistence-manifest/v3",
    environment: "paper",
    executable: false,
    source: "investing_engine_v1_phase3f",
    hashes: {},
  }));
  return {
    query: vi.fn(async (sql: string) => {
      if (sql.includes("transaction_read_only")) return { rows: [{ read_only: "on" }] };
      if (sql.includes("count(*)::int count")) return { rows: [{ count: runCount }] };
      if (sql.includes("table_hash")) return { rows: [{ table_hash: "0".repeat(64) }] };
      if (sql.includes("from public.investing_engine_runs")) {
        return { rows: runs };
      }
      return { rows: [] };
    }),
    release: vi.fn(),
  };
}

function scannerWithBudget(
  client: ReturnType<typeof emptyScannerClient>,
  replay: { replay: ReturnType<typeof vi.fn> },
  remainingMs: () => number,
) {
  return new InvestingEnginePhase4CIntegrityScanner({
    pool: { connect: async () => client } as never,
    reader: {
      loadByRunId: vi.fn(async (selector: { runId: string }) => ({
        manifest: { manifestHash: `${selector.runId}-manifest` },
      })),
    } as never,
    replay: replay as never,
    scope: {
      authenticatedUserId: scope.authenticatedUserId,
      ownerId: scope.ownerId,
      accountId: scope.accountId,
      maxRuns: 25,
      timeoutMs: 5_000,
      remainingMs,
    },
  });
}
