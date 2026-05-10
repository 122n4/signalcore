import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDailyDecisionPayload } from "@/lib/decision/DailyDecisionService";
import { buildDailyDecisionView } from "@/app/app/tabs/dailyDecisionViewModel";
import { buildAdvisorDecisionView } from "@/app/app/tabs/advisorDecisionViewModel";
import { buildAutonomyDecisionView } from "@/app/app/tabs/autonomyDecisionViewModel";

type TableName = "journal_entries" | "daily_snapshots";
type DbRow = Record<string, any>;

const authState = { userId: "user_loop" as string | null };
const dbState: Record<TableName, DbRow[]> = {
  journal_entries: [],
  daily_snapshots: [],
};
const engineEvents: Array<Record<string, unknown>> = [];

let nextRowId = 0;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function resetDb() {
  dbState.journal_entries.length = 0;
  dbState.daily_snapshots.length = 0;
  engineEvents.length = 0;
  nextRowId = 0;
}

function createId(prefix: string) {
  nextRowId += 1;
  return `${prefix}_${nextRowId}`;
}

class QueryBuilder {
  private filters: Array<(row: DbRow) => boolean> = [];
  private sortKey: string | null = null;
  private ascending = true;
  private limitCount: number | null = null;
  private single = false;

  constructor(
    private readonly state: Record<TableName, DbRow[]>,
    private readonly table: TableName,
    private readonly op: "select" | "delete",
  ) {}

  eq(key: string, value: unknown) {
    this.filters.push((row) => row?.[key] === value);
    return this;
  }

  gte(key: string, value: unknown) {
    const lowerBound = new Date(String(value ?? "")).getTime();
    this.filters.push((row) => {
      const rowValue = new Date(String(row?.[key] ?? "")).getTime();
      return Number.isFinite(rowValue) && rowValue >= lowerBound;
    });
    return this;
  }

  order(key: string, options?: { ascending?: boolean | null }) {
    this.sortKey = key;
    this.ascending = options?.ascending !== false;
    return this;
  }

  limit(count: number) {
    this.limitCount = Math.max(0, Number(count || 0));
    return this;
  }

  maybeSingle() {
    this.single = true;
    return this;
  }

  private resolveRows() {
    let rows = [...this.state[this.table]].filter((row) => this.filters.every((filter) => filter(row)));
    if (this.sortKey) {
      const key = this.sortKey;
      rows = rows.sort((a, b) => {
        const left = a?.[key];
        const right = b?.[key];
        if (left === right) return 0;
        if (left == null) return this.ascending ? -1 : 1;
        if (right == null) return this.ascending ? 1 : -1;
        return this.ascending ? String(left).localeCompare(String(right)) : String(right).localeCompare(String(left));
      });
    }
    if (this.limitCount != null) {
      rows = rows.slice(0, this.limitCount);
    }
    return rows;
  }

  private async execute() {
    if (this.op === "delete") {
      const retained = this.state[this.table].filter((row) => !this.filters.every((filter) => filter(row)));
      this.state[this.table].splice(0, this.state[this.table].length, ...retained);
      return { data: null, error: null };
    }

    const rows = this.resolveRows();
    return {
      data: this.single ? rows[0] ?? null : rows,
      error: null,
    };
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }
}

class InsertBuilder {
  private selected = false;
  private single = false;
  private readonly rows: DbRow[];

  constructor(
    private readonly state: Record<TableName, DbRow[]>,
    private readonly table: TableName,
    value: DbRow | DbRow[],
  ) {
    const rawRows = Array.isArray(value) ? value : [value];
    this.rows = rawRows.map((row) => ({
      id: row?.id ?? createId(this.table === "journal_entries" ? "je" : "ds"),
      ...clone(row),
    }));
  }

  select() {
    this.selected = true;
    return this;
  }

  maybeSingle() {
    this.single = true;
    return this;
  }

  private async execute() {
    this.state[this.table].push(...this.rows.map((row) => clone(row)));
    return {
      data: this.selected || this.single ? (this.single ? this.rows[0] ?? null : this.rows) : null,
      error: null,
    };
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }
}

class UpsertBuilder {
  private readonly rows: DbRow[];

  constructor(
    private readonly state: Record<TableName, DbRow[]>,
    private readonly table: TableName,
    value: DbRow | DbRow[],
    private readonly conflictKeys: string[],
  ) {
    const rawRows = Array.isArray(value) ? value : [value];
    this.rows = rawRows.map((row) => ({
      id: row?.id ?? createId(this.table === "journal_entries" ? "je" : "ds"),
      ...clone(row),
    }));
  }

  private async execute() {
    for (const row of this.rows) {
      const idx = this.state[this.table].findIndex((candidate) =>
        this.conflictKeys.every((key) => candidate?.[key] === row?.[key]),
      );
      if (idx >= 0) {
        this.state[this.table][idx] = clone(row);
      } else {
        this.state[this.table].push(clone(row));
      }
    }
    return { data: null, error: null };
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }
}

function createSupabaseMock() {
  return {
    from(table: TableName) {
      return {
        select() {
          return new QueryBuilder(dbState, table, "select");
        },
        delete() {
          return new QueryBuilder(dbState, table, "delete");
        },
        insert(value: DbRow | DbRow[]) {
          return new InsertBuilder(dbState, table, value);
        },
        upsert(value: DbRow | DbRow[], options?: { onConflict?: string | null }) {
          const conflictKeys = String(options?.onConflict || "")
            .split(",")
            .map((key) => key.trim())
            .filter(Boolean);
          return new UpsertBuilder(dbState, table, value, conflictKeys);
        },
      };
    },
  };
}

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: authState.userId })),
  clerkClient: {
    users: {
      getUser: vi.fn(async (userId: string) => ({
        id: userId,
        publicMetadata: {},
      })),
    },
  },
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => createSupabaseMock()),
}));

vi.mock("@/lib/engine/events", () => ({
  createExecutionId: vi.fn((prefix: string) => createId(prefix)),
  writeEngineEvent: vi.fn(async (payload: Record<string, unknown>) => {
    engineEvents.push(payload);
    return { ok: true };
  }),
}));

vi.mock("@/lib/signalcore/manualExecutionState", () => ({
  readManualExecutionState: vi.fn(async () => ({
    snapshot: {
      pending: null,
      lastProof: null,
    },
  })),
  hasBlockingManualExecutionPendingForToday: vi.fn(() => false),
}));

vi.mock("@/lib/signalcore/modeAccess", () => ({
  resolveModeAccess: vi.fn(async ({ requestedMode }: { requestedMode?: string | null }) => ({
    ok: true,
    status: 200,
    mode: requestedMode || "investing",
  })),
}));

vi.mock("@/lib/signalcore/decisionImpact", () => ({
  deriveDecisionSnapshotGroundwork: vi.fn(() => ({
    decisionStateReason: "none",
    decisionAction: "BUY",
    stabilitySource: "live",
  })),
}));

vi.mock("@/lib/signalcore/owner", () => ({
  isOwnerUserId: vi.fn((userId: string) => userId === "owner_1"),
}));

const { POST: closeDayPost } = await import("@/app/api/daily/close/route");
const { POST: conversionEventPost } = await import("@/app/api/conversion/event/route");
const { GET: globalFunnelGet } = await import("@/app/api/conversion/funnel/global/route");

function makeBundleResponse() {
  return {
    ok: true,
    mode: "investing" as const,
    asOf: "2026-03-07T09:00:00.000Z",
    daily: {
      engineV4: {
        ok: true,
        engineVersion: "v4-ultra",
        mode: "investing",
        asOf: "2026-03-07T09:00:00.000Z",
        inputHash: "hash-smoke",
        loopStage: "DAY1_NBA",
        decision: {
          nextBestAction: {
            kind: "DEPLOY_CASH",
            title: "Deploy measured capital",
            desc: "Measured add remains valid.",
            cta: {
              label: "Open Daily execution",
              action: "open_daily_execution",
              href: "/app?tab=daily&mode=investing",
            },
          },
          whyNow: "Measured deployment remains aligned.",
          whatToDo: [],
          guardrails: [],
          opportunities: [],
          riskLeaks: [],
          priorityClass: "GROWTH",
          aggression: "NORMAL",
          confidence: 0.64,
        },
        scores: {
          autopilotScore: 79,
          proofQualityScore: 82,
          dataQualityScore: 93,
          reliabilityScore: 88,
          confidenceScore: 64,
        },
        proof: {
          lastProofQuality: 78,
          proofRequiredToday: false,
          proofStatus: "good",
          requirements: [],
          confirmedMoneyEur: 250,
        },
        reliability: {
          executionRate7d: 0.86,
          closeDayRate7d: 0.71,
          dataCoveragePct: 96,
        },
        portfolio: {
          holdingsCount: 1,
          cashEur: 2000,
          totalValueEur: 10000,
          coveragePct: 96,
        },
        plan: {
          hasPlan: true,
          status: "active",
          goal: "growth",
          targetEur: 50000,
          monthlyContributionEur: 500,
          horizonMonths: 60,
        },
        trace: [],
        fallbackUsed: false,
      },
      nextBestAction: {
        type: "ADD",
        instruction: "Deploy measured capital",
        summary: "Deploy a measured tranche inside the active plan.",
        reason: "Measured deployment fits the active plan.",
        cta: {
          label: "Open Daily execution",
          action: "open_daily_execution",
          href: "/app?tab=daily&mode=investing",
        },
        source: "engine_v4",
        engineVersion: "v4-ultra",
        rawAction: "open_daily_execution",
      },
      whyNow: {
        driverKey: "concentration_med",
        driverTitle: "Concentration requires measured deployment",
        severity: "med",
        rationale: "The current setup allows measured deployment while keeping concentration under control.",
        evidence: ["Top leak: Concentration (MED)"],
        expectedOutcome: "Measured deployment improves alignment without forcing risk.",
        counterfactual: "An oversized entry would increase concentration drift.",
      },
      operationalAction: {
        category: "DEPLOY",
        brokerInstruction: "Deploy a small tranche through the broker workflow.",
        capitalImpact: "Increase exposure gradually.",
        riskImpact: "Raises risk modestly but remains within the current gate.",
        expectedOutcomeWindow: "1-3 sessions",
      },
      decisionGovernance: {
        enabled: true,
        top_opportunities: [],
        opportunities: [],
        portfolio_risk: {
          risk_level: "moderate",
          concentration_warning: false,
          diversification_score: 72,
          concentration_top1_pct: 18,
          concentration_top3_pct: 44,
          volatility_exposure_pct: 32,
          exposure_by_asset_class: {},
          exposure_by_sector: {},
          correlation_clusters: [],
        },
        daily_decision: {
          asset: "AAPL",
          decision: "BUY",
          legacy_action_type: "ADD",
          confidence: 0.67,
          confidence_pct: 67,
          expected_move: 3.4,
          expected_value: 1.6,
          recommended_position_pct: 9,
          score: 81,
          regime: "trend",
          risk_level: "moderate",
          reason_codes: ["expected_value_positive"],
        },
        decision_confidence: 0.67,
        capital_protection: {
          protection_mode: false,
          recommended_action_bias: "neutral",
          size_multiplier: 1,
          position_size_multiplier: 1,
          restrict_aggressive_entries: false,
          reasons: [],
        },
        metadata: {
          precedence: [],
          override: null,
          volatility_regime: "medium",
          probabilistic_layer_enabled: true,
        },
      },
      actionGate: {
        status: "ready",
        allowExecution: true,
        reasons: [],
        nextStep: "Continue with measured execution.",
        topLeakKey: "concentration_med",
        topLeakSeverity: "med",
      },
      capitalStatus: {
        posture: "STABLE",
        planAlignment: "HIGH",
        riskPressure: 31,
        nextEvaluationAt: "2026-03-07T13:00:00.000Z",
      },
      scores: {
        autopilotScore: 81,
        decisionConfidence: 74,
        riskPressure: 31,
        planCoherence: 88,
      },
    },
    derived: {
      hasPlan: true,
      hasHoldings: true,
      doneToday: false,
      streak: 3,
      receiptsCount: 2,
      diagnostics: {
        hasPlan: true,
        hasHoldings: true,
        holdingsCount: 1,
        totalEur: 10000,
        cashEur: 2000,
        cashDragPct: 20,
        concentrationTop1Pct: 18,
        concentrationTop3Pct: 44,
        pricing: {
          coveragePct: 96,
          missingSymbols: [],
          priceAgeSeconds: 120,
        },
        changed: {
          totalEurDelta: 0,
          cashEurDelta: 0,
          holdingsCountDelta: 0,
          coveragePctDelta: 0,
        },
        riskLeaks: [
          {
            key: "concentration_med",
            severity: "med",
            title: "Concentration elevated",
            detail: "Top position remains above preferred concentration.",
          },
        ],
      },
    },
  };
}

function makeCloseSnapshot(bundleResponse: ReturnType<typeof makeBundleResponse>) {
  return {
    portfolio: {
      cashEur: 2000,
      cash: 2000,
      items: [
        {
          symbol: "AAPL",
          qty: 10,
          valueEur: 8000,
        },
      ],
    },
    daily: clone(bundleResponse.daily),
    derived: clone(bundleResponse.derived),
  };
}

beforeEach(() => {
  resetDb();
  authState.userId = "user_loop";
});

describe("daily loop smoke", () => {
  it("keeps Daily, Advisor and Autonomy aligned on the canonical bundle", () => {
    const payload = buildDailyDecisionPayload({
      response: makeBundleResponse(),
      branch: "success",
      branchReason: null,
    });

    const topLeak = payload.response.derived?.diagnostics?.riskLeaks?.[0] ?? null;
    const decisionView = buildDailyDecisionView({
      mode: payload.response.mode,
      daily: payload.response.daily,
      derived: payload.response.derived ?? {},
      hasPlan: true,
      hasHoldings: true,
      topLeak,
      topLeakSeverity: (topLeak?.severity as "high" | "med" | "low" | undefined) ?? null,
      pressureScore: 31,
      opportunitiesCount: 0,
    });
    const advisorView = buildAdvisorDecisionView({
      lang: "en",
      mode: payload.response.mode,
      decisionView,
      hasPlan: true,
      hasHoldings: true,
      starterWarmupActive: false,
      fallbackActive: false,
      lowDataQualityActive: false,
      hasFixPath: false,
      doneToday: false,
    });
    const autonomyView = buildAutonomyDecisionView({
      decisionView: {
        ...decisionView,
        stabilitySource: "live",
      },
      precedenceOverride: payload.decisionEnvelope.support.precedence.override,
      actionGateStatus: payload.response.daily.actionGate.status,
      nextEvaluationAt: payload.decisionEnvelope.workflowDecision.nextEvaluationAt,
    });

    expect(payload.response.daily.decisionEnvelope).toBeDefined();
    expect(payload.response.daily.decisionEnvelope.support.precedence.override).toBe("none");
    expect(decisionView.action).toBe("BUY");
    expect(decisionView.stateReason).toBe("none");
    expect(decisionView.allowExecution).toBe(true);
    expect(advisorView.kind).toBe("continue_daily");
    expect(advisorView.action).toBe("daily");
    expect(advisorView.detail).toBe(decisionView.rationale);
    expect(autonomyView.action).toBe(decisionView.action);
    expect(autonomyView.stateReason).toBe(decisionView.stateReason);
    expect(autonomyView.allowExecution).toBe(true);
    expect(autonomyView.operationalStateLabel).toBe("Advancing");
  });

  it("closes the day and keeps funnel attribution coherent across anonymous and signed events", async () => {
    const bundleResponse = makeBundleResponse();
    const closeResponse = await closeDayPost(
      new Request("http://localhost/api/daily/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "investing",
          snapshot: makeCloseSnapshot(bundleResponse),
          dailyDone: {
            type: "daily_done",
            title: "Daily completed",
            details: {
              source: "smoke_test",
            },
          },
        }),
      }),
    );
    const closePayload = await closeResponse.json();

    expect(closeResponse.status).toBe(200);
    expect(closePayload.ok).toBe(true);
    expect(closePayload.journal.decisionReceiptId).toBeTruthy();
    expect(closePayload.journal.dailyDoneId).toBeTruthy();
    expect(dbState.daily_snapshots).toHaveLength(1);
    expect(dbState.journal_entries.some((row) => row.type === "decision_receipt")).toBe(true);
    expect(dbState.journal_entries.some((row) => row.type === "daily_done")).toBe(true);
    expect(engineEvents.some((row) => row.event === "day_closed")).toBe(true);

    authState.userId = null;
    const anonPaywallOpen = await conversionEventPost(
      new Request("http://localhost/api/conversion/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "paywall_open",
          source: "pricing",
          visitorId: "visitor_smoke",
          details: {
            variant: "A",
          },
        }),
      }),
    );
    expect(anonPaywallOpen.status).toBe(200);

    authState.userId = "user_loop";
    for (const event of ["paywall_open", "checkout_start", "paid_activated"]) {
      const response = await conversionEventPost(
        new Request("http://localhost/api/conversion/event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event,
            source: "pricing",
            details: {
              variant: "A",
            },
          }),
        }),
      );
      expect(response.status).toBe(200);
    }

    authState.userId = "owner_1";
    const funnelResponse = await globalFunnelGet(
      new Request("http://localhost/api/conversion/funnel/global?days=30"),
    );
    const funnelPayload = await funnelResponse.json();

    expect(funnelResponse.status).toBe(200);
    expect(funnelPayload.ok).toBe(true);
    expect(funnelPayload.uniqueUsers).toBe(1);
    expect(funnelPayload.anonymousVisitors).toBe(1);
    expect(funnelPayload.counts.paywallOpen).toBe(2);
    expect(funnelPayload.counts.checkoutStart).toBe(1);
    expect(funnelPayload.counts.paidActivated).toBe(1);
    expect(funnelPayload.attributedUsers.anonymousPaywallOpenUsers).toBe(1);
    expect(funnelPayload.attributedUsers.paidFromCheckoutUsers).toBe(1);
    expect(funnelPayload.attributedUsers.overallPaidUsers).toBe(1);
    expect(funnelPayload.rates.paidFromCheckoutRate).toBe(100);
    expect(funnelPayload.rates.overallPaidRate).toBe(100);
  });
});
