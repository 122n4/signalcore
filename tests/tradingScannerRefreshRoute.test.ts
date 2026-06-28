import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const isEngineLoopAuthorizedMock = vi.fn();
const buildTradingLightScannerInputsMock = vi.fn();
const readLatestTradingScannerSnapshotsMock = vi.fn();
const writeTradingScannerSnapshotsMock = vi.fn();
const runPaperBotCycleForUserMock = vi.fn();

vi.mock("@/lib/engine/loopAuth", () => ({
  isEngineLoopAuthorized: isEngineLoopAuthorizedMock,
}));

vi.mock("@/lib/trading/lightScanner", async () => {
  const actual = await vi.importActual<typeof import("@/lib/trading/lightScanner")>(
    "@/lib/trading/lightScanner",
  );

  return {
    ...actual,
    buildTradingLightScannerInputs: buildTradingLightScannerInputsMock,
  };
});

vi.mock("@/lib/trading/scannerSnapshotStore", () => ({
  readLatestTradingScannerSnapshots: readLatestTradingScannerSnapshotsMock,
  writeTradingScannerSnapshots: writeTradingScannerSnapshotsMock,
}));

vi.mock("@/lib/signalcore/owner", () => ({
  getOwnerUserIds: () => [],
}));

vi.mock("@/lib/trading/bot/paperRunner", () => ({
  runPaperBotCycleForUser: runPaperBotCycleForUserMock,
}));

function makeStoredInput(args: {
  instrument: string;
  snapshotAt: string;
  actionableFreshness: boolean;
}) {
  return {
    snapshot: {
      instrument: args.instrument,
      snapshotAt: args.snapshotAt,
      marketType: "crypto",
      sessionProfile: "crypto",
      timeframes: {},
      availableTimeframes: [],
    },
    market: {
      session: {
        marketOpen: true,
      },
    },
    scannerSnapshot: {
      source: "provider",
      providerError: null,
      dataSymbol: `${args.instrument.slice(0, 3)}/USD`,
      dataRelation: "direct",
      snapshotAgeMs: null,
      actionableFreshness: args.actionableFreshness,
      staleReason: args.actionableFreshness ? null : "Live snapshot is stale.",
    },
  } as any;
}

function makeFreshInput(instrument: string, snapshotAt: string) {
  return {
    snapshot: {
      instrument,
      snapshotAt,
      marketType: "crypto",
      sessionProfile: "crypto",
      timeframes: {},
      availableTimeframes: [],
    },
    market: {
      session: {
        marketOpen: true,
      },
    },
    scannerSnapshot: {
      source: "provider",
      providerError: null,
      dataSymbol: `${instrument.slice(0, 3)}/USD`,
      dataRelation: "direct",
      snapshotAgeMs: 60_000,
      actionableFreshness: true,
      staleReason: null,
    },
    decisionCore: { decision: { currentState: "WAIT", reasons: [] } },
    executionPlan: { executionStatus: { executionStatus: "ready", reasons: [] } },
  } as any;
}

describe("trading scanner refresh route", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-28T12:00:00.000Z"));
    vi.clearAllMocks();
    process.env.TRADING_SCANNER_REFRESH_BATCH_SIZE = "1";
    process.env.TRADING_SCANNER_REFRESH_BATCH_MINUTES = "2";
    isEngineLoopAuthorizedMock.mockReturnValue(true);
    readLatestTradingScannerSnapshotsMock.mockResolvedValue({
      schemaReady: true,
      inputs: [
        makeStoredInput({
          instrument: "BTCUSD",
          snapshotAt: "2026-06-28T11:40:00.000Z",
          actionableFreshness: false,
        }),
      ],
      generatedAt: "2026-06-28T11:40:00.000Z",
      excludedStaleOpenCount: 0,
      error: null,
    });
    buildTradingLightScannerInputsMock.mockImplementation(async (args: any) =>
      (args.liveFetchInstruments ?? []).map((instrument: string) =>
        makeFreshInput(instrument, "2026-06-28T12:00:00.000Z"),
      ),
    );
    writeTradingScannerSnapshotsMock.mockResolvedValue({
      schemaReady: true,
      persisted: true,
      count: 3,
      skippedStaleOpenCount: 0,
      error: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.TRADING_SCANNER_REFRESH_BATCH_SIZE;
    delete process.env.TRADING_SCANNER_REFRESH_BATCH_MINUTES;
  });

  it("always refreshes open stale markets alongside the rotating batch", async () => {
    const { GET } = await import("@/app/api/trading/scanner-refresh/route");

    const response = await GET(
      new Request("https://syntrake.test/api/trading/scanner-refresh", {
        headers: { authorization: "Bearer test-secret" },
      }),
    );
    const body = await response.json();
    const buildArgs = buildTradingLightScannerInputsMock.mock.calls[0]?.[0];

    expect(response.status).toBe(200);
    expect(buildArgs.liveFetchInstruments).toEqual(
      expect.arrayContaining(["BTCUSD", "ETHUSD"]),
    );
    expect(body.refreshBatch.staleOpenPriority).toEqual(["BTCUSD", "ETHUSD"]);
    expect(body.healthy).toBe(true);
    expect(body.paperBot).toEqual(
      expect.objectContaining({
        enabled: false,
        reason: "scanner_refresh_is_snapshot_only",
      }),
    );
    expect(runPaperBotCycleForUserMock).not.toHaveBeenCalled();
  });
});
