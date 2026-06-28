import { beforeEach, describe, expect, it, vi } from "vitest";

const readLatestTradingScannerSnapshotsMock = vi.fn();
const buildTradingLightScannerInputsMock = vi.fn();
const inspectTradingLightScannerMock = vi.fn();

vi.mock("@/lib/trading/scannerSnapshotStore", () => ({
  readLatestTradingScannerSnapshots: readLatestTradingScannerSnapshotsMock,
}));

vi.mock("@/lib/trading/lightScanner", async () => {
  const actual = await vi.importActual<typeof import("@/lib/trading/lightScanner")>(
    "@/lib/trading/lightScanner",
  );

  return {
    ...actual,
    buildTradingLightScannerInputs: buildTradingLightScannerInputsMock,
    inspectTradingLightScanner: inspectTradingLightScannerMock,
  };
});

function makeScannerInput(instrument: string) {
  return {
    snapshot: {
      instrument,
      snapshotAt: "2026-06-28T12:00:00.000Z",
      marketType: "crypto",
      sessionProfile: "crypto",
      timeframes: {},
      availableTimeframes: [],
    },
    market: {
      session: {
        session: "asia_flow",
        marketOpen: true,
      },
    },
    scannerSnapshot: {
      source: "cache",
      providerError: null,
      dataSymbol: instrument,
      dataRelation: "direct",
      snapshotAgeMs: 60_000,
      actionableFreshness: true,
      staleReason: null,
    },
    scannerCoverage: {
      status: "coverage_backed",
      label: "Coverage-backed",
    },
  } as any;
}

describe("trading scanner operational status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses persisted snapshots as the canonical source when live fetch is disabled", async () => {
    readLatestTradingScannerSnapshotsMock.mockResolvedValue({
      schemaReady: true,
      inputs: [makeScannerInput("BTCUSD")],
      generatedAt: "2026-06-28T12:00:00.000Z",
      excludedStaleOpenCount: 0,
      error: null,
    });
    buildTradingLightScannerInputsMock.mockResolvedValue([makeScannerInput("BTCUSD")]);

    const { loadTradingScannerOperationalDiagnostics } = await import("@/lib/ops/tradingScannerStatus");
    const diagnostics = await loadTradingScannerOperationalDiagnostics({
      asOf: "2026-06-28T12:05:00.000Z",
      liveFetch: false,
    });

    expect(diagnostics).toHaveLength(1);
    expect(readLatestTradingScannerSnapshotsMock).toHaveBeenCalledTimes(1);
    expect(buildTradingLightScannerInputsMock).toHaveBeenCalledTimes(1);
    expect(inspectTradingLightScannerMock).not.toHaveBeenCalled();
  });
});
