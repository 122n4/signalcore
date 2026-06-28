import { beforeEach, describe, expect, it, vi } from "vitest";

const getSupabaseAdminMock = vi.fn();
const readLatestTradingScannerSnapshotsMock = vi.fn();
const buildTradingLightScannerInputsMock = vi.fn();
const inspectTradingLightScannerMock = vi.fn();
const getTwelveDataApiKeysMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: getSupabaseAdminMock,
}));

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

vi.mock("@/lib/market/providers/twelvedataKeyPool", () => ({
  getTwelveDataApiKeys: getTwelveDataApiKeysMock,
}));

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
        marketOpen: true,
      },
    },
    scannerSnapshot: {
      source: "cache",
      providerError: null,
      dataSymbol: `${instrument.slice(0, 3)}/USD`,
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

describe("health route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSupabaseAdminMock.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    });
    getTwelveDataApiKeysMock.mockReturnValue(["td-test-key"]);
    readLatestTradingScannerSnapshotsMock.mockResolvedValue({
      schemaReady: true,
      inputs: [makeScannerInput("BTCUSD"), makeScannerInput("ETHUSD")],
      generatedAt: "2026-06-28T12:00:00.000Z",
      excludedStaleOpenCount: 0,
      error: null,
    });
    buildTradingLightScannerInputsMock.mockResolvedValue([
      makeScannerInput("BTCUSD"),
      makeScannerInput("ETHUSD"),
    ]);
    inspectTradingLightScannerMock.mockResolvedValue([]);
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test";
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "clerk_pub";
    process.env.CLERK_SECRET_KEY = "clerk_sec";
  });

  it("uses persisted scanner snapshots as the canonical health source when live fetch is off", async () => {
    const { GET } = await import("@/app/api/health/route");

    const response = await GET(new Request("https://syntrake.test/api/health"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.warningReasons).toEqual([]);
    expect(readLatestTradingScannerSnapshotsMock).toHaveBeenCalledTimes(1);
    expect(buildTradingLightScannerInputsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        forceRefresh: true,
        allowLiveFetch: false,
        includeInactiveMarkets: true,
        storedInputs: expect.arrayContaining([
          expect.objectContaining({
            snapshot: expect.objectContaining({ instrument: "BTCUSD" }),
          }),
          expect.objectContaining({
            snapshot: expect.objectContaining({ instrument: "ETHUSD" }),
          }),
        ]),
      }),
    );
    expect(inspectTradingLightScannerMock).not.toHaveBeenCalled();
  });
});
