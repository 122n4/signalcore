import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  close,
  snapshot,
  listRuns,
  getRun,
  createRuntime,
} = vi.hoisted(() => {
  const close = vi.fn(async () => undefined);
  const snapshot = vi.fn();
  const listRuns = vi.fn();
  const getRun = vi.fn();
  return {
    close,
    snapshot,
    listRuns,
    getRun,
    createRuntime: vi.fn(() => ({
      service: { snapshot, listRuns, getRun },
      close,
    })),
  };
});

vi.mock("@/lib/investing/ops/infrastructure/factory.server", () => ({
  createProductionInvestingOpsRuntimeV1: createRuntime,
}));

import {
  loadInvestingDashboardV1,
  loadInvestingRunV1,
  loadInvestingRunsV1,
} from "@/lib/investing/ui/server/loader.server";

const run = {
  runId: "run-a",
  asOf: "2026-07-26T10:00:00.000Z",
  state: "complete",
  quality: "canonical",
  requestOutcome: "created",
  reasonCode: null,
  integrity: "pass",
  verifier: "pass",
  replay: "pass",
  idempotencyConflict: false,
  ambiguousCommitRecovery: false,
};
const scope = {
  ownerId: "owner-a",
  tenantId: "tenant-a",
  portfolioId: "portfolio-a",
  accountId: "account-a",
};
const ok = <T>(value: T) => ({ ok: true as const, value });
const denied = {
  contractVersion: "investing-identity-error/v1",
  ok: false as const,
  correlationId: null,
  error: {
    code: "identity_scope_not_authorized",
    reasonCode: "identity_scope_not_authorized",
  },
};
const notFound = {
  contractVersion: "investing-ops-error/v1",
  ok: false as const,
  correlationId: null,
  error: { code: "ops_run_not_found", reasonCode: "ops_run_not_found" },
};

describe("FASE 5E-R official runtime loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    snapshot.mockResolvedValue(denied);
    listRuns.mockResolvedValue(denied);
    getRun.mockResolvedValue(notFound);
  });

  it("creates the official runtime and always closes it after dashboard", async () => {
    const result = await loadInvestingDashboardV1({ connectionString: "qa" });
    expect(result.kind).toBe("unauthorized");
    expect(createRuntime).toHaveBeenCalledOnce();
    expect(createRuntime).toHaveBeenCalledWith({ connectionString: "qa" });
    expect(snapshot).toHaveBeenCalledWith({});
    expect(close).toHaveBeenCalledOnce();
  });

  it("closes the runtime when an OPS call throws", async () => {
    snapshot.mockRejectedValueOnce(new Error("secret stack"));
    await expect(loadInvestingDashboardV1()).resolves.toMatchObject({
      kind: "unavailable",
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it("loads official runs with a fixed backend-supported limit", async () => {
    listRuns.mockResolvedValueOnce(ok({
      generatedAt: "2026-07-26T10:00:00.000Z",
      scope,
      runs: [run],
    }));
    const result = await loadInvestingRunsV1();
    expect(listRuns).toHaveBeenCalledWith({ limit: 50 });
    expect(result.kind === "ready" && result.runs).toHaveLength(1);
    expect(close).toHaveBeenCalledOnce();
  });

  it("rejects malformed route identifiers before creating a runtime", async () => {
    await expect(loadInvestingRunV1("../bad?tenantId=other")).resolves.toMatchObject({
      kind: "invalid",
    });
    expect(createRuntime).not.toHaveBeenCalled();
  });

  it("maps missing and cross-scope detail to the same public result", async () => {
    getRun.mockResolvedValue(notFound);
    const missing = await loadInvestingRunV1("missing");
    const crossScope = await loadInvestingRunV1("cross-scope");
    expect(missing).toEqual(crossScope);
    expect(missing).toEqual({
      kind: "not_found",
      title: "Run não disponível",
      description: "O run não existe ou não está acessível.",
    });
    expect(close).toHaveBeenCalledTimes(2);
  });

  it("minimizes a real detail and closes after success", async () => {
    getRun.mockResolvedValueOnce(ok({
      generatedAt: "2026-07-26T10:00:00.000Z",
      scope,
      run: { ...run, canonicalPayload: "secret" },
    }));
    const result = await loadInvestingRunV1("run-a");
    expect(result.kind === "ready" && JSON.stringify(result)).not.toContain("canonicalPayload");
    expect(result.kind === "ready" && JSON.stringify(result)).not.toContain("owner-a");
    expect(close).toHaveBeenCalledOnce();
  });
});
