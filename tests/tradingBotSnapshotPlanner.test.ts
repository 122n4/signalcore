import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readLatestTradingScannerSnapshots: vi.fn(),
  loadBrokerConnection: vi.fn(),
  resolveResearchPaperPromotionApproval: vi.fn(),
  readResearchLabRemoteSnapshot: vi.fn(),
}));

vi.mock("@/lib/trading/scannerSnapshotStore", () => ({
  readLatestTradingScannerSnapshots: mocks.readLatestTradingScannerSnapshots,
}));

vi.mock("@/lib/broker/store", () => ({
  loadBrokerConnection: mocks.loadBrokerConnection,
}));

vi.mock("@/lib/trading/research/paperPromotion", async () => {
  const actual = await vi.importActual<typeof import("@/lib/trading/research/paperPromotion")>("@/lib/trading/research/paperPromotion");
  return {
    ...actual,
    resolveResearchPaperPromotionApproval: mocks.resolveResearchPaperPromotionApproval,
  };
});

vi.mock("@/lib/trading/research/supabaseSync", async () => {
  const actual = await vi.importActual<typeof import("@/lib/trading/research/supabaseSync")>("@/lib/trading/research/supabaseSync");
  return {
    ...actual,
    readResearchLabRemoteSnapshot: mocks.readResearchLabRemoteSnapshot,
  };
});

import { buildBotSnapshotPlan } from "@/lib/trading/bot/snapshotPlanner";

function scannerCandidate() {
  return {
    snapshot: {
      instrument: "BTCUSD",
      snapshotAt: "2026-06-29T18:00:00.000Z",
    },
    market: {
      instrument: "BTCUSD",
      snapshotAt: "2026-06-29T18:00:00.000Z",
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
        primaryMessage: "Ready.",
        confidence: 79,
        reasons: ["ready"],
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
  };
}

describe("bot snapshot planner research context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readLatestTradingScannerSnapshots.mockResolvedValue({
      inputs: [scannerCandidate()],
      generatedAt: "2026-06-29T18:00:00.000Z",
      excludedStaleOpenCount: 0,
      schemaReady: true,
      error: null,
    });
    mocks.loadBrokerConnection.mockRejectedValue(new Error("no broker"));
    mocks.readResearchLabRemoteSnapshot.mockResolvedValue({
      schemaReady: true,
      error: null,
      state: null,
      runs: [],
      decisions: [],
    });
  });

  it("keeps paper execution aligned with the current live baseline when research approval rejects the candidate", async () => {
    mocks.resolveResearchPaperPromotionApproval.mockResolvedValue({
      approved: false,
      source: "local_artifact",
      reason: "No Research promotion package is ready for paper execution yet.",
      snapshot: null,
      matched_scope: null,
      candidate_summary: {
        instrument: "BTCUSD",
        session: "ny_open",
        setup_type: "liquidity_sweep_reversal",
        risk_mode: "normal",
        execution_status: "allowed",
        quality_grade: "A",
        clarity_level: "high",
        environment_state: "favorable",
      },
    });

    const plan = await buildBotSnapshotPlan({
      userId: "owner_1",
      option: "paper_only",
      armedAt: null,
      asOf: "2026-06-29T18:05:00.000Z",
    });

    expect(plan.researchApproval?.approved).toBe(false);
    expect(plan.plan?.action).toBe("ready");
    expect(plan.plan?.intent?.instrument).toBe("BTCUSD");
  });

  it("keeps the normal paper plan when research approval passes", async () => {
    mocks.resolveResearchPaperPromotionApproval.mockResolvedValue({
      approved: true,
      source: "local_artifact",
      reason: "matched",
      snapshot: {
        generated_at: "2026-06-29T18:00:00.000Z",
        live_baseline_id: "baseline-1",
        ready_package_count: 1,
        executable_task_scope_count: 1,
        bundle_only_ready_package_count: 0,
        scopes: [],
      },
      matched_scope: null,
      candidate_summary: {
        instrument: "BTCUSD",
        session: "ny_open",
        setup_type: "liquidity_sweep_reversal",
        risk_mode: "normal",
        execution_status: "allowed",
        quality_grade: "A",
        clarity_level: "high",
        environment_state: "favorable",
      },
    });

    const plan = await buildBotSnapshotPlan({
      userId: "owner_1",
      option: "paper_only",
      armedAt: null,
      asOf: "2026-06-29T18:05:00.000Z",
    });

    expect(plan.researchApproval?.approved).toBe(true);
    expect(plan.plan?.action).toBe("ready");
    expect(plan.plan?.intent?.instrument).toBe("BTCUSD");
  });

  it("falls back to the mirrored remote paper-promotion snapshot when local artifacts are unavailable", async () => {
    mocks.resolveResearchPaperPromotionApproval.mockResolvedValue({
      approved: false,
      source: "missing",
      reason: "Research promotion snapshot is unavailable.",
      snapshot: null,
      matched_scope: null,
      candidate_summary: {
        instrument: "BTCUSD",
        session: "ny_open",
        setup_type: "liquidity_sweep_reversal",
        risk_mode: "normal",
        execution_status: "allowed",
        quality_grade: "A",
        clarity_level: "high",
        environment_state: "favorable",
      },
    });
    mocks.readResearchLabRemoteSnapshot.mockResolvedValue({
      schemaReady: true,
      error: null,
      state: {
        payload: {
          paperPromotion: {
            generated_at: "2026-06-29T18:00:00.000Z",
            live_baseline_id: "baseline-1",
            ready_package_count: 1,
            executable_task_scope_count: 1,
            bundle_only_ready_package_count: 0,
            scopes: [
              {
                package_id: "pkg-btc",
                entry_id: "entry-btc",
                task_id: "task-btc",
                source: "task",
                baseline_id: "baseline-1",
                instrument: "BTCUSD",
                sessions: ["ny_open"],
                setup_types: ["liquidity_sweep_reversal"],
                risk_modes: ["normal"],
                execution_statuses: ["allowed"],
                quality_grades: ["A"],
                clarity_levels: ["high"],
                environment_states: ["favorable"],
                package_ready_for_live_review: true,
              },
            ],
          },
        },
      },
      runs: [],
      decisions: [],
    });

    const plan = await buildBotSnapshotPlan({
      userId: "owner_1",
      option: "paper_only",
      armedAt: null,
      asOf: "2026-06-29T18:05:00.000Z",
    });

    expect(plan.researchApproval?.source).toBe("remote_state");
    expect(plan.researchApproval?.approved).toBe(true);
    expect(plan.researchApproval?.matched_scope?.package_id).toBe("pkg-btc");
    expect(plan.plan?.action).toBe("ready");
  });

  it("keeps paper execution ready when research approval reports an ambiguous promote-to-paper match", async () => {
    mocks.resolveResearchPaperPromotionApproval.mockResolvedValue({
      approved: false,
      source: "local_artifact",
      reason: "Multiple ready-for-live-review Research promotion scopes match this paper candidate. Canonical Promote -> Paper handoff is ambiguous.",
      snapshot: {
        generated_at: "2026-06-29T18:00:00.000Z",
        live_baseline_id: "baseline-1",
        ready_package_count: 2,
        executable_task_scope_count: 2,
        bundle_only_ready_package_count: 0,
        scopes: [],
      },
      matched_scope: null,
      candidate_summary: {
        instrument: "BTCUSD",
        session: "ny_open",
        setup_type: "liquidity_sweep_reversal",
        risk_mode: "normal",
        execution_status: "allowed",
        quality_grade: "A",
        clarity_level: "high",
        environment_state: "favorable",
      },
    });

    const plan = await buildBotSnapshotPlan({
      userId: "owner_1",
      option: "paper_only",
      armedAt: null,
      asOf: "2026-06-29T18:05:00.000Z",
    });

    expect(plan.researchApproval?.approved).toBe(false);
    expect(plan.plan?.action).toBe("ready");
    expect(plan.plan?.intent?.instrument).toBe("BTCUSD");
  });

  it("still fails closed for real-money mode when research approval is unavailable", async () => {
    mocks.resolveResearchPaperPromotionApproval.mockResolvedValue({
      approved: false,
      source: "missing",
      reason: "Research promotion snapshot is unavailable.",
      snapshot: null,
      matched_scope: null,
      candidate_summary: {
        instrument: "BTCUSD",
        session: "ny_open",
        setup_type: "liquidity_sweep_reversal",
        risk_mode: "normal",
        execution_status: "allowed",
        quality_grade: "A",
        clarity_level: "high",
        environment_state: "favorable",
      },
    });

    const plan = await buildBotSnapshotPlan({
      userId: "owner_1",
      option: "real_money_when_armed",
      armedAt: "2026-06-29T18:04:00.000Z",
      asOf: "2026-06-29T18:05:00.000Z",
    });

    expect(plan.researchApproval?.approved).toBe(false);
    expect(plan.plan?.action).toBe("blocked");
    expect(plan.plan?.reasons[0]).toContain("Research promotion snapshot is unavailable");
  });
});
