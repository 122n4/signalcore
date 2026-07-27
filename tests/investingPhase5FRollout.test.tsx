import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));

const {
  close,
  createRuntime,
  getRequestUserId,
  getRun,
  listRuns,
  snapshot,
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
    getRequestUserId: vi.fn(async () => "user_allowed"),
    createRuntime: vi.fn(() => ({
      service: { snapshot, listRuns, getRun },
      close,
    })),
  };
});

vi.mock("@/lib/auth/requestUser", () => ({ getRequestUserId }));
vi.mock("@/lib/investing/ops/infrastructure/factory.server", () => ({
  createProductionInvestingOpsRuntimeV1: createRuntime,
}));

import {
  evaluateInvestingRolloutGateV1,
} from "@/lib/investing/rollout/gate.server";
import {
  decideInvestingRolloutV1,
  parseInvestingRolloutConfigV1,
} from "@/lib/investing/rollout/policy.server";
import {
  createInvestingUiServerLoadersV1,
  loadInvestingDashboardV1,
  type InvestingUiLoaderOptionsV1,
} from "@/lib/investing/ui/server/loader.server";
import { InvestingFailurePanel } from
  "@/components/investing/InvestingRuntimeUi";

const run = {
  runId: "run-a",
  asOf: "2026-07-27T10:00:00.000Z",
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
const ok = <T,>(value: T) => ({ ok: true as const, value });
const environment = (
  mode: unknown,
  allowedUserIds: unknown = "",
): InvestingUiLoaderOptionsV1["rollout"] => ({
  readEnvironment: () => ({ mode, allowedUserIds }),
});

describe("FASE 5F rollout parser and policy", () => {
  it.each([
    [undefined, undefined],
    ["invalid", ""],
    [" on", ""],
    ["ON", ""],
    ["allowlist", "user_ok,*"],
    ["allowlist", "user_ok,not-a-clerk-id"],
  ])("fails closed for malformed configuration %#", (mode, allowedUserIds) => {
    expect(parseInvestingRolloutConfigV1({ mode, allowedUserIds }).mode).toBe("off");
  });

  it("normalizes whitespace, empty entries and duplicates without weakening exact matching", () => {
    const config = parseInvestingRolloutConfigV1({
      mode: "allowlist",
      allowedUserIds: " user_A ,,user_A, user_B ",
    });
    expect([...config.allowedUserIds]).toEqual(["user_A", "user_B"]);
    expect(decideInvestingRolloutV1(config, "user_A")).toBe(true);
    expect(decideInvestingRolloutV1(config, "user_a")).toBe(false);
    expect(decideInvestingRolloutV1(config, "user_A_extra")).toBe(false);
  });

  it("implements off, empty allowlist, allowlist and on without anonymous access", () => {
    const off = parseInvestingRolloutConfigV1({ mode: "off", allowedUserIds: "" });
    const empty = parseInvestingRolloutConfigV1({
      mode: "allowlist",
      allowedUserIds: "",
    });
    const listed = parseInvestingRolloutConfigV1({
      mode: "allowlist",
      allowedUserIds: "user_A",
    });
    const on = parseInvestingRolloutConfigV1({ mode: "on", allowedUserIds: "" });
    expect(decideInvestingRolloutV1(off, "user_A")).toBe(false);
    expect(decideInvestingRolloutV1(empty, "user_A")).toBe(false);
    expect(decideInvestingRolloutV1(listed, "user_A")).toBe(true);
    expect(decideInvestingRolloutV1(listed, "user_B")).toBe(false);
    expect(decideInvestingRolloutV1(on, "user_A")).toBe(true);
    expect(decideInvestingRolloutV1(on, null)).toBe(false);
  });

  it("fails closed when configuration or session reading throws", async () => {
    await expect(evaluateInvestingRolloutGateV1({
      readEnvironment: () => {
        throw new Error("configuration secret");
      },
    })).resolves.toEqual({ allowed: false });
    await expect(evaluateInvestingRolloutGateV1({
      readEnvironment: () => ({ mode: "on", allowedUserIds: "" }),
      readUser: async () => {
        throw new Error("session secret");
      },
    })).resolves.toEqual({ allowed: false });
  });

  it("keeps concurrent decisions independent", async () => {
    const [allowed, denied, off] = await Promise.all([
      evaluateInvestingRolloutGateV1({
        readEnvironment: () => ({
          mode: "allowlist",
          allowedUserIds: "user_A",
        }),
        readUser: async () => "user_A",
      }),
      evaluateInvestingRolloutGateV1({
        readEnvironment: () => ({
          mode: "allowlist",
          allowedUserIds: "user_B",
        }),
        readUser: async () => "user_A",
      }),
      evaluateInvestingRolloutGateV1({
        readEnvironment: () => ({ mode: "off", allowedUserIds: "user_A" }),
        readUser: async () => "user_A",
      }),
    ]);
    expect([allowed.allowed, denied.allowed, off.allowed]).toEqual([true, false, false]);
  });
});

describe("FASE 5F gate before the official runtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRequestUserId.mockResolvedValue("user_allowed");
    snapshot.mockResolvedValue(ok({
      generatedAt: "2026-07-27T10:00:00.000Z",
      scope,
      state: "healthy",
      reasonCode: "ops_healthy",
      metrics: {
        totalRuns: { available: true, value: 1 },
        runsInPeriod: { available: true, value: 1 },
        latestRunAgeMs: { available: true, value: 1 },
        generationDurationMs: { available: true, value: 1 },
      },
      latestRun: run,
      latestActivityAt: run.asOf,
      latestFailureReason: null,
      integrity: "pass",
      verifier: "pass",
      replay: "pass",
    }));
    listRuns.mockResolvedValue(ok({
      generatedAt: "2026-07-27T10:00:00.000Z",
      scope,
      runs: [run],
    }));
    getRun.mockResolvedValue(ok({
      generatedAt: "2026-07-27T10:00:00.000Z",
      scope,
      run,
    }));
  });

  afterEach(() => {
    delete process.env.INVESTING_ROLLOUT_MODE;
    delete process.env.INVESTING_ROLLOUT_ALLOWED_USER_IDS;
  });

  it.each([
    ["off", "user_allowed", ""],
    ["allowlist", "user_denied", "user_allowed"],
    ["allowlist", "user_allowed", ""],
    ["invalid", "user_allowed", "user_allowed"],
    ["on", null, ""],
  ])("blocks %s/%s before runtime and DB", async (mode, user, allowedUserIds) => {
    const options = {
      connectionString: "postgresql://unavailable.invalid/never-contacted",
      readUser: async () => user,
      rollout: environment(mode, allowedUserIds),
      headers: { "x-investing-rollout": "on" },
      cookies: { rollout: "on" },
      query: { userId: "user_allowed" },
      body: { mode: "on" },
      formData: { allowed: true },
      localStorage: { rollout: "on" },
    } as unknown as InvestingUiLoaderOptionsV1;
    const loaders = createInvestingUiServerLoadersV1(options);
    const [dashboard, runs, detail] = await Promise.all([
      loaders.loadDashboard(),
      loaders.loadRuns(),
      loaders.loadRun("run-a?userId=user_allowed"),
    ]);
    expect(dashboard).toEqual(runs);
    expect(runs).toEqual(detail);
    expect(dashboard).toEqual({
      kind: "unauthorized",
      title: "Acesso indisponível",
      description: "Não foi possível apresentar informação Investing para esta sessão.",
    });
    expect(createRuntime).not.toHaveBeenCalled();
  });

  it("renders the same generic public HTML without configuration or identity leaks", async () => {
    const blocked = await createInvestingUiServerLoadersV1({
      rollout: environment("off", "user_PHASE5F_CLIENT_SENTINEL_9Z"),
      readUser: async () => "user_PHASE5F_CLIENT_SENTINEL_9Z",
    }).loadDashboard();
    expect(blocked.kind).toBe("unauthorized");
    if (blocked.kind === "ready") return;
    const html = renderToStaticMarkup(<InvestingFailurePanel failure={blocked} />);
    expect(html).not.toMatch(
      /PHASE5F_CLIENT_SENTINEL|INVESTING_ROLLOUT|off|allowlist|rollout|user_/iu,
    );
    expect(html).toContain("Acesso indisponível");
  });

  it.each([
    ["dashboard", (options: InvestingUiLoaderOptionsV1) =>
      createInvestingUiServerLoadersV1(options).loadDashboard()],
    ["runs", (options: InvestingUiLoaderOptionsV1) =>
      createInvestingUiServerLoadersV1(options).loadRuns()],
    ["detail", (options: InvestingUiLoaderOptionsV1) =>
      createInvestingUiServerLoadersV1(options).loadRun("run-a")],
  ])("allows %s through one factory and closes its runtime", async (_name, load) => {
    const result = await load({
      rollout: environment("allowlist", "user_allowed"),
      readUser: async () => "user_allowed",
    });
    expect(result.kind).toBe("ready");
    expect(createRuntime).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it("still closes the allowed runtime when OPS throws", async () => {
    snapshot.mockRejectedValueOnce(new Error("database secret"));
    await expect(createInvestingUiServerLoadersV1({
      rollout: environment("on"),
      readUser: async () => "user_allowed",
    }).loadDashboard()).resolves.toMatchObject({ kind: "unavailable" });
    expect(createRuntime).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it("uses process configuration per request and cuts access after removal", async () => {
    process.env.INVESTING_ROLLOUT_MODE = "allowlist";
    process.env.INVESTING_ROLLOUT_ALLOWED_USER_IDS = "user_allowed";
    await expect(loadInvestingDashboardV1()).resolves.toMatchObject({ kind: "ready" });
    process.env.INVESTING_ROLLOUT_ALLOWED_USER_IDS = "user_other";
    await expect(loadInvestingDashboardV1()).resolves.toMatchObject({ kind: "unauthorized" });
    expect(createRuntime).toHaveBeenCalledOnce();
  });
});
