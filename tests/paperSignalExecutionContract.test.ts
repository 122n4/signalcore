import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(),
  readLatestTradingScannerSnapshots: vi.fn(),
  loadBrokerConnection: vi.fn(),
  resolveResearchPaperPromotionApproval: vi.fn(),
  readResearchLabRemoteSnapshot: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}));

vi.mock("@/lib/trading/scannerSnapshotStore", () => ({
  readLatestTradingScannerSnapshots: mocks.readLatestTradingScannerSnapshots,
}));

vi.mock("@/lib/broker/store", () => ({
  loadBrokerConnection: mocks.loadBrokerConnection,
}));

vi.mock("@/lib/trading/research/paperPromotion", async () => {
  const actual = await vi.importActual<typeof import("@/lib/trading/research/paperPromotion")>(
    "@/lib/trading/research/paperPromotion",
  );
  return {
    ...actual,
    resolveResearchPaperPromotionApproval: mocks.resolveResearchPaperPromotionApproval,
  };
});

vi.mock("@/lib/trading/research/supabaseSync", async () => {
  const actual = await vi.importActual<typeof import("@/lib/trading/research/supabaseSync")>(
    "@/lib/trading/research/supabaseSync",
  );
  return {
    ...actual,
    readResearchLabRemoteSnapshot: mocks.readResearchLabRemoteSnapshot,
  };
});

import { runPaperBotCycleForUser } from "@/lib/trading/bot/paperRunner";
import {
  composeTradingWatchlistEntry,
  resolveTradingActionGuidance,
} from "@/lib/trading/state";

const LIVE_BASELINE = {
  baseline_id: "baseline-live-current-xau-btc-breakout-risk-shaped",
  engine_hash: "engine-hash-abc123",
  strategy_id: "baseline-live-current-xau-btc-breakout-risk-shaped",
  validation_profile: "default_live_safe",
  dataset_profile: "core_20y",
  source: "research_live_baseline" as const,
  valid: true,
  loaded_at: "2026-07-04T08:00:00.000Z",
  invalid_reason: null,
};

const SIGNAL = {
  signal_id: "sig_contract_btcusd_execute_now",
  source: "trading_scanner" as const,
  origin: "current_live_baseline" as const,
  timestamp: "2026-07-04T08:00:00.000Z",
  baseline_id: LIVE_BASELINE.baseline_id,
  engine_hash: LIVE_BASELINE.engine_hash,
  strategy_id: LIVE_BASELINE.strategy_id,
  validation_profile: LIVE_BASELINE.validation_profile,
};

function scannerCandidate(overrides: Record<string, any> = {}) {
  const base = {
    snapshot: {
      instrument: "BTCUSD",
      snapshotAt: "2026-07-04T08:00:00.000Z",
      availableTimeframes: ["15m"],
      timeframes: {
        "15m": [
          {
            timestamp: "2026-07-04T08:00:00.000Z",
            open: 69900,
            high: 70100,
            low: 69850,
            close: 70000,
            volume: 100,
          },
        ],
      },
    },
    market: {
      instrument: "BTCUSD",
      snapshotAt: "2026-07-04T08:00:00.000Z",
      timeframes: ["15m"],
      structure: { state: "uptrend", direction: "long", score: 70, confidence: 70 },
      regime: { state: "trending", score: 70, confidence: 70 },
      volatility: { state: "normal", score: 65, confidence: 65 },
      session: { marketOpen: true, session: "ny_open", confidence: 80 },
      momentum: { state: "rising", direction: "long", score: 70, confidence: 70 },
      liquidity: { state: "healthy_participation", score: 70, confidence: 70 },
    },
    setupCore: {
      setup: {
        type: "liquidity_sweep_reversal",
        direction: "long",
        triggerLevel: 70000,
        invalidationLevel: 69800,
        confidence: 78,
      },
      maturity: { state: "ready", score: 78, confidence: 78 },
      opportunityWindow: { state: "active", score: 80, confidence: 80 },
      quality: { score: 82, grade: "A", confidence: 82 },
    },
    decisionCore: {
      clarity: { level: "high", score: 80, conflictScore: 10, alignment: 85 },
      bias: { direction: "bullish", score: 75, confidence: 75 },
      environment: { state: "favorable", score: 77, confidence: 77 },
      weighting: { contextProfile: "default", weightedScores: {}, confidence: 78 },
      decision: {
        currentState: "TRADE_VALID",
        primaryMessage: "Execute now.",
        confidence: 79,
        reasons: ["execute now"],
      },
    },
    executionPlan: {
      entryZone: {
        triggerType: "touch",
        triggerLevel: 70000,
        entryZoneLow: 69950,
        entryZoneHigh: 70050,
      },
      invalidation: {
        invalidationLevel: 69800,
        invalidationType: "hard",
        confidence: 70,
      },
      tradePath: {
        targetZone: "70400",
        primaryPath: "up",
        secondaryPath: null,
        riskRewardEstimate: 2.4,
      },
      riskFraming: {
        riskPct: 0.25,
        sizeAdjustment: 1,
        riskMode: "normal",
      },
      executionStatus: {
        executionStatus: "allowed",
        reasons: [],
        nextDisciplineStep: null,
      },
    },
    scannerSnapshot: {
      source: "provider",
      providerError: null,
      dataSymbol: "BTCUSD",
      dataRelation: "direct",
      snapshotAgeMs: 1000,
      actionableFreshness: true,
      staleReason: null,
    },
    liveBaseline: LIVE_BASELINE,
    signal: SIGNAL,
  };

  return {
    ...base,
    ...overrides,
    decisionCore: {
      ...base.decisionCore,
      ...(overrides.decisionCore || {}),
      decision: {
        ...base.decisionCore.decision,
        ...(overrides.decisionCore?.decision || {}),
      },
    },
    executionPlan: {
      ...base.executionPlan,
      ...(overrides.executionPlan || {}),
      executionStatus: {
        ...base.executionPlan.executionStatus,
        ...(overrides.executionPlan?.executionStatus || {}),
      },
    },
  };
}

function createSupabaseHarness() {
  const paperUpserts: any[] = [];
  const journalInserts: any[] = [];
  const paperRows: any[] = [];

  const makeSelectChain = (rows: any[]) => {
    const chain: any = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      gte: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(async () => ({ data: rows, error: null })),
    };
    return chain;
  };

  const from = vi.fn((table: string) => {
    if (table === "paper_trades") {
      return {
        ...makeSelectChain(paperRows),
        upsert: vi.fn(async (payload: any) => {
          const rows = Array.isArray(payload) ? payload : [payload];
          for (const row of rows) {
            paperUpserts.push(row);
            paperRows.unshift({
              id: `paper-${paperRows.length + 1}`,
              ...row,
            });
          }
          return { error: null };
        }),
      };
    }

    if (table === "journal_entries") {
      return {
        ...makeSelectChain([]),
        insert: vi.fn((payload: any) => {
          journalInserts.push(payload);
          const inserted = {
            id: `journal-${journalInserts.length}`,
            title: payload.title,
            details: payload.details,
            created_at: payload.created_at,
          };
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: inserted, error: null })),
            })),
          };
        }),
      };
    }

    throw new Error(`Unexpected Supabase table ${table}`);
  });

  return {
    client: { from },
    paperUpserts,
    journalInserts,
    paperRows,
  };
}

describe("paper signal execution contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadBrokerConnection.mockRejectedValue(new Error("no broker"));
    mocks.resolveResearchPaperPromotionApproval.mockResolvedValue({
      approved: false,
      source: "missing",
      reason: "Research promotion snapshot is unavailable.",
      snapshot: null,
      matched_scope: null,
      candidate_summary: null,
    });
    mocks.readResearchLabRemoteSnapshot.mockResolvedValue({
      schemaReady: true,
      error: null,
      state: null,
      runs: [],
      decisions: [],
    });
  });

  it("executes a persisted EXECUTE NOW signal into paper_trades with the same instrument, side, entry, stop, and target", async () => {
    const candidate = scannerCandidate();
    const supabase = createSupabaseHarness();
    mocks.getSupabaseAdmin.mockReturnValue(supabase.client);
    mocks.readLatestTradingScannerSnapshots.mockResolvedValue({
      schemaReady: true,
      inputs: [candidate],
      generatedAt: "2026-07-04T08:00:00.000Z",
      excludedStaleOpenCount: 0,
      error: null,
    });

    const result = await runPaperBotCycleForUser({
      userId: "owner_1",
      source: "daemon",
      allowDuplicateIntent: true,
      maxTradesPerDay: 3,
    });

    expect(result.status).toBe("paper_queued");
    expect(supabase.journalInserts).toHaveLength(1);
    expect(supabase.paperUpserts).toHaveLength(1);
    expect(supabase.paperUpserts[0]).toMatchObject({
      user_id: "owner_1",
      mode: "trading",
      source: "daemon",
      instrument: "BTCUSD",
      side: "buy",
      broker: "syntrake_paper_broker",
      execution_status: "paper_queued",
      status: "open",
      entry_price: 70000,
      stop_price: 69800,
      target_price: 70400,
    });
    expect(supabase.paperUpserts[0].raw_details.scannerContext.liveBaseline).toMatchObject({
      baseline_id: candidate.liveBaseline.baseline_id,
      engine_hash: candidate.liveBaseline.engine_hash,
      strategy_id: candidate.liveBaseline.strategy_id,
      validation_profile: candidate.liveBaseline.validation_profile,
    });
    expect(supabase.paperUpserts[0].raw_details.scannerContext.signal).toMatchObject({
      signal_id: candidate.signal.signal_id,
      baseline_id: candidate.liveBaseline.baseline_id,
      engine_hash: candidate.liveBaseline.engine_hash,
    });
    expect(supabase.paperUpserts[0].raw_details.intent).toMatchObject({
      signalId: candidate.signal.signal_id,
      idempotencyKey: `owner_1:${candidate.signal.signal_id}`,
    });
    expect(result.history[0]).toMatchObject({
      instrument: "BTCUSD",
      side: "buy",
      status: "paper_queued",
      entry: 70000,
      stopLoss: 69800,
      takeProfit: 70400,
    });
  });

  it.each([
    ["WAIT", "allowed"],
    ["TRADE_VALID", "restricted"],
  ] as const)("does not open or persist a paper trade when the signal is %s / %s", async (state, executionStatus) => {
    const supabase = createSupabaseHarness();
    mocks.getSupabaseAdmin.mockReturnValue(supabase.client);
    mocks.readLatestTradingScannerSnapshots.mockResolvedValue({
      schemaReady: true,
      inputs: [
        scannerCandidate({
          decisionCore: {
            decision: {
              currentState: state,
              primaryMessage: state === "WAIT" ? "Wait." : "Restricted.",
              reasons: [state === "WAIT" ? "wait" : "restricted"],
            },
          },
          executionPlan: {
            executionStatus: {
              executionStatus,
              reasons: executionStatus === "restricted" ? ["restricted"] : [],
            },
          },
        }),
      ],
      generatedAt: "2026-07-04T08:00:00.000Z",
      excludedStaleOpenCount: 0,
      error: null,
    });

    const result = await runPaperBotCycleForUser({
      userId: "owner_1",
      source: "daemon",
      allowDuplicateIntent: true,
      maxTradesPerDay: 3,
    });

    expect(result.status).toBe("blocked");
    expect(supabase.journalInserts).toHaveLength(0);
    expect(supabase.paperUpserts).toHaveLength(0);
    expect(result.history).toEqual([]);
  });

  it("allows Execute now only when the Current Live Baseline identity is valid", async () => {
    const withBaseline = scannerCandidate();
    const validEntry = composeTradingWatchlistEntry(withBaseline);

    expect(resolveTradingActionGuidance(validEntry)).toMatchObject({
      intent: "execute_now",
      label: "Execute now",
    });
    expect(validEntry.liveDecision.liveBaseline).toMatchObject({
      baseline_id: LIVE_BASELINE.baseline_id,
      engine_hash: LIVE_BASELINE.engine_hash,
    });
    expect(validEntry.liveDecision.signal).toMatchObject({
      signal_id: SIGNAL.signal_id,
      baseline_id: LIVE_BASELINE.baseline_id,
      engine_hash: LIVE_BASELINE.engine_hash,
    });

    const withoutBaseline = scannerCandidate({
      liveBaseline: null,
    });
    const noBaselineEntry = composeTradingWatchlistEntry(withoutBaseline);

    expect(resolveTradingActionGuidance(noBaselineEntry).intent).not.toBe("execute_now");
    expect(noBaselineEntry.liveDecision.liveBaseline).toBeNull();

    const withoutSignal = scannerCandidate({
      signal: null,
    });
    const noSignalEntry = composeTradingWatchlistEntry(withoutSignal);

    expect(resolveTradingActionGuidance(noSignalEntry).intent).not.toBe("execute_now");
    expect(noSignalEntry.liveDecision.signal).toBeNull();
  });

  it("blocks paper execution for a TRADE_VALID / allowed snapshot without Current Live Baseline identity", async () => {
    const supabase = createSupabaseHarness();
    mocks.getSupabaseAdmin.mockReturnValue(supabase.client);
    mocks.readLatestTradingScannerSnapshots.mockResolvedValue({
      schemaReady: true,
      inputs: [scannerCandidate({ liveBaseline: null })],
      generatedAt: "2026-07-04T08:00:00.000Z",
      excludedStaleOpenCount: 0,
      error: null,
    });

    const result = await runPaperBotCycleForUser({
      userId: "owner_1",
      source: "daemon",
      allowDuplicateIntent: true,
      maxTradesPerDay: 3,
    });

    expect(result.status).toBe("blocked");
    expect(supabase.journalInserts).toHaveLength(0);
    expect(supabase.paperUpserts).toHaveLength(0);
    expect(result.result.planned?.reasons.join(" ")).toContain("Execution status is restricted");
  });

  it("does not advertise Execute now or open paper when signal pedigree or executable levels are incomplete", async () => {
    const mismatchedSignal = scannerCandidate({
      signal: {
        ...SIGNAL,
        baseline_id: "baseline-other",
      },
    });
    const missingTarget = scannerCandidate({
      executionPlan: {
        tradePath: {
          targetZone: null,
          primaryPath: "up",
          secondaryPath: null,
          riskRewardEstimate: 2.4,
        },
      },
    });

    expect(resolveTradingActionGuidance(composeTradingWatchlistEntry(mismatchedSignal)).intent).not.toBe(
      "execute_now",
    );
    expect(resolveTradingActionGuidance(composeTradingWatchlistEntry(missingTarget)).intent).not.toBe(
      "execute_now",
    );

    for (const candidate of [mismatchedSignal, missingTarget]) {
      const supabase = createSupabaseHarness();
      mocks.getSupabaseAdmin.mockReturnValue(supabase.client);
      mocks.readLatestTradingScannerSnapshots.mockResolvedValue({
        schemaReady: true,
        inputs: [candidate],
        generatedAt: "2026-07-04T08:00:00.000Z",
        excludedStaleOpenCount: 0,
        error: null,
      });

      const result = await runPaperBotCycleForUser({
        userId: "owner_1",
        source: "daemon",
        allowDuplicateIntent: true,
        maxTradesPerDay: 3,
      });

      expect(result.status).toBe("blocked");
      expect(supabase.journalInserts).toHaveLength(0);
      expect(supabase.paperUpserts).toHaveLength(0);
    }
  });
});
