import { beforeEach, describe, expect, it, vi } from "vitest";

const getSupabaseAdminMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: getSupabaseAdminMock,
}));

function makeScannerInput(overrides: Record<string, any> = {}) {
  return {
    snapshot: {
      instrument: "BTC",
      snapshotAt: "2026-05-09T08:00:00.000Z",
      ...(overrides.snapshot ?? {}),
    },
    market: {
      session: {
        marketOpen: true,
        ...(overrides.market?.session ?? {}),
      },
      ...(overrides.market ?? {}),
    },
    scannerSnapshot: {
      source: "provider",
      providerError: null,
      dataSymbol: "BTC-USD",
      dataRelation: "proxy",
      snapshotAgeMs: 30_000,
      actionableFreshness: true,
      staleReason: null,
      ...(overrides.scannerSnapshot ?? {}),
    },
    ...overrides,
  } as any;
}

describe("trading scanner snapshot store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("persists scanner inputs as one upsert per instrument", async () => {
    const upsertMock = vi.fn().mockResolvedValue({ error: null });
    const fromMock = vi.fn().mockReturnValue({ upsert: upsertMock });
    getSupabaseAdminMock.mockReturnValue({ from: fromMock });

    const { TRADING_SCANNER_SNAPSHOT_TABLE, writeTradingScannerSnapshots } = await import(
      "@/lib/trading/scannerSnapshotStore"
    );

    const result = await writeTradingScannerSnapshots({
      generatedAt: "2026-05-09T08:01:00.000Z",
      inputs: [
        makeScannerInput({
          snapshot: { instrument: " btc ", snapshotAt: "2026-05-09T08:00:00.000Z" },
        }),
      ],
    });

    expect(result).toEqual({
      schemaReady: true,
      persisted: true,
      count: 1,
      skippedStaleOpenCount: 0,
      error: null,
    });
    expect(fromMock).toHaveBeenCalledWith(TRADING_SCANNER_SNAPSHOT_TABLE);
    expect(upsertMock).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          instrument: "BTC",
          generated_at: "2026-05-09T08:01:00.000Z",
          snapshot_at: "2026-05-09T08:00:00.000Z",
          source: "provider",
          market_open: true,
          actionable_freshness: true,
          provider_error: null,
          payload: expect.objectContaining({
            snapshot: expect.objectContaining({ instrument: " btc " }),
          }),
        }),
      ],
      { onConflict: "instrument" },
    );
  }, 10_000);

  it("reads only valid persisted scanner payloads and reports the latest generation time", async () => {
    const orderMock = vi.fn().mockResolvedValue({
      data: [
        {
          generated_at: "2026-05-09T08:01:00.000Z",
          payload: makeScannerInput({
            snapshot: { instrument: "BTC", snapshotAt: "2026-05-09T08:00:00.000Z" },
          }),
        },
        {
          generated_at: "2026-05-09T08:02:00.000Z",
          payload: makeScannerInput({
            snapshot: { instrument: "ETH", snapshotAt: "2026-05-09T08:00:00.000Z" },
          }),
        },
        {
          generated_at: "2026-05-09T08:03:00.000Z",
          payload: { snapshot: { instrument: "" } },
        },
      ],
      error: null,
    });
    const gteMock = vi.fn().mockReturnValue({ order: orderMock });
    const selectMock = vi.fn().mockReturnValue({ gte: gteMock });
    getSupabaseAdminMock.mockReturnValue({
      from: vi.fn().mockReturnValue({ select: selectMock }),
    });

    const { readFreshTradingScannerSnapshots } = await import("@/lib/trading/scannerSnapshotStore");
    const result = await readFreshTradingScannerSnapshots({
      asOf: "2026-05-09T08:04:00.000Z",
      maxAgeMs: 5 * 60 * 1000,
    });

    expect(result.schemaReady).toBe(true);
    expect(result.error).toBeNull();
    expect(result.generatedAt).toBe("2026-05-09T08:02:00.000Z");
    expect(result.excludedStaleOpenCount).toBe(0);
    expect(result.inputs.map((input) => input.snapshot.instrument)).toEqual(["BTC", "ETH"]);
    expect(gteMock).toHaveBeenCalledWith("generated_at", "2026-05-09T07:59:00.000Z");
  });

  it("does not persist stale snapshots while the market is open", async () => {
    const upsertMock = vi.fn().mockResolvedValue({ error: null });
    const fromMock = vi.fn().mockReturnValue({ upsert: upsertMock });
    getSupabaseAdminMock.mockReturnValue({ from: fromMock });

    const { writeTradingScannerSnapshots } = await import("@/lib/trading/scannerSnapshotStore");
    const result = await writeTradingScannerSnapshots({
      generatedAt: "2026-05-09T08:10:00.000Z",
      inputs: [
        makeScannerInput({
          snapshot: { instrument: "BTC", snapshotAt: "2026-05-09T08:00:00.000Z" },
          scannerSnapshot: {
            actionableFreshness: false,
            staleReason: "Live snapshot is stale.",
          },
        }),
      ],
    });

    expect(result).toEqual({
      schemaReady: true,
      persisted: true,
      count: 0,
      skippedStaleOpenCount: 1,
      error: null,
    });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("ignores stale open-market rows even when generated_at is fresh", async () => {
    const orderMock = vi.fn().mockResolvedValue({
      data: [
        {
          generated_at: "2026-05-09T08:10:00.000Z",
          payload: makeScannerInput({
            snapshot: { instrument: "BTC", snapshotAt: "2026-05-09T08:00:00.000Z" },
            scannerSnapshot: {
              actionableFreshness: false,
              staleReason: "Live snapshot is stale.",
            },
          }),
        },
        {
          generated_at: "2026-05-09T08:10:00.000Z",
          payload: makeScannerInput({
            snapshot: { instrument: "US500", snapshotAt: "2026-05-08T20:00:00.000Z" },
            market: { session: { marketOpen: false } },
            scannerSnapshot: {
              actionableFreshness: false,
              staleReason: "Market closed.",
            },
          }),
        },
      ],
      error: null,
    });
    const gteMock = vi.fn().mockReturnValue({ order: orderMock });
    const selectMock = vi.fn().mockReturnValue({ gte: gteMock });
    getSupabaseAdminMock.mockReturnValue({
      from: vi.fn().mockReturnValue({ select: selectMock }),
    });

    const { readFreshTradingScannerSnapshots } = await import("@/lib/trading/scannerSnapshotStore");
    const result = await readFreshTradingScannerSnapshots({
      asOf: "2026-05-09T08:10:00.000Z",
      maxAgeMs: 5 * 60 * 1000,
    });

    expect(result.inputs.map((input) => input.snapshot.instrument)).toEqual(["US500"]);
    expect(result.excludedStaleOpenCount).toBe(1);
  });

  it("can read latest stored rows for non-execution chart fallback", async () => {
    const orderMock = vi.fn().mockResolvedValue({
      data: [
        {
          generated_at: "2026-05-09T08:10:00.000Z",
          payload: makeScannerInput({
            snapshot: { instrument: "BTC", snapshotAt: "2026-05-09T08:00:00.000Z" },
            scannerSnapshot: {
              actionableFreshness: false,
              staleReason: "Live snapshot is stale.",
            },
          }),
        },
        {
          generated_at: "2026-05-09T08:09:00.000Z",
          payload: makeScannerInput({
            snapshot: { instrument: "BTC", snapshotAt: "2026-05-09T07:59:00.000Z" },
          }),
        },
      ],
      error: null,
    });
    const gteMock = vi.fn().mockReturnValue({ order: orderMock });
    const selectMock = vi.fn().mockReturnValue({ gte: gteMock });
    getSupabaseAdminMock.mockReturnValue({
      from: vi.fn().mockReturnValue({ select: selectMock }),
    });

    const { readLatestTradingScannerSnapshots } = await import("@/lib/trading/scannerSnapshotStore");
    const result = await readLatestTradingScannerSnapshots({
      asOf: "2026-05-09T08:30:00.000Z",
      maxAgeMs: 60 * 60 * 1000,
    });

    expect(result.inputs.map((input) => input.snapshot.instrument)).toEqual(["BTC"]);
    expect(result.inputs[0]?.scannerSnapshot?.actionableFreshness).toBe(false);
    expect(result.generatedAt).toBe("2026-05-09T08:10:00.000Z");
  });

  it("returns schemaReady false instead of throwing when the table is missing", async () => {
    getSupabaseAdminMock.mockReturnValue({
      from: vi.fn().mockReturnValue({
        upsert: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "relation trading_scanner_snapshots does not exist" },
        }),
      }),
    });

    const { writeTradingScannerSnapshots } = await import("@/lib/trading/scannerSnapshotStore");
    const result = await writeTradingScannerSnapshots({
      inputs: [makeScannerInput()],
      generatedAt: "2026-05-09T08:01:00.000Z",
    });

    expect(result.schemaReady).toBe(false);
    expect(result.persisted).toBe(false);
    expect(result.skippedStaleOpenCount).toBe(0);
    expect(result.error).toContain("does not exist");
  });
});
