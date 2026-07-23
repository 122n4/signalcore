import { beforeEach, describe, expect, it, vi } from "vitest";

type TableName =
  | "daily_snapshots"
  | "journal_entries"
  | "investing_mandate_snapshots"
  | "investing_rebalance_ledger"
  | "investing_research_snapshots"
  | "investing_execution_queue";

type DbRow = Record<string, any>;

const authState = { userId: "user_investing" as string | null };
const dbState: Record<TableName, DbRow[]> = {
  daily_snapshots: [],
  journal_entries: [],
  investing_mandate_snapshots: [],
  investing_rebalance_ledger: [],
  investing_research_snapshots: [],
  investing_execution_queue: [],
};
const engineEvents: Array<Record<string, unknown>> = [];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function resetDb() {
  for (const table of Object.keys(dbState) as TableName[]) {
    dbState[table].length = 0;
  }
  engineEvents.length = 0;
}

class InsertBuilder {
  constructor(private readonly table: TableName, private readonly value: DbRow | DbRow[]) {}

  private async execute() {
    const rows = (Array.isArray(this.value) ? this.value : [this.value]).map((row) => clone(row));
    dbState[this.table].push(...rows);
    return { data: null, error: null };
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }
}

class UpsertBuilder {
  constructor(
    private readonly table: TableName,
    private readonly value: DbRow | DbRow[],
    private readonly onConflict: string,
  ) {}

  private async execute() {
    const keys = this.onConflict.split(",").map((entry) => entry.trim()).filter(Boolean);
    for (const row of Array.isArray(this.value) ? this.value : [this.value]) {
      const candidate = clone(row);
      const existingIndex = dbState[this.table].findIndex((existing) => keys.every((key) => existing?.[key] === candidate?.[key]));
      if (existingIndex >= 0) {
        dbState[this.table][existingIndex] = candidate;
      } else {
        dbState[this.table].push(candidate);
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
    async rpc(name: string, args: Record<string, any>) {
      if (name !== "investing_record_daily_cycle") return { data: null, error: { message: "unknown_rpc" } };
      dbState.daily_snapshots.push(clone(args.p_daily_snapshot));
      dbState.investing_mandate_snapshots.push(clone({ ...args.p_mandate, correlation_id: args.p_correlation_id }));
      dbState.investing_rebalance_ledger.push(clone({ ...args.p_rebalance, correlation_id: args.p_correlation_id }));
      dbState.investing_research_snapshots.push(clone({ ...args.p_research, correlation_id: args.p_correlation_id }));
      dbState.investing_execution_queue.push(clone(args.p_execution));
      dbState.journal_entries.push(clone(args.p_journal_entry));
      return { data: { ok: true, correlation_id: args.p_correlation_id }, error: null };
    },
    from(table: TableName) {
      return {
        insert(value: DbRow | DbRow[]) {
          return new InsertBuilder(table, value);
        },
        upsert(value: DbRow | DbRow[], options?: { onConflict?: string | null }) {
          return new UpsertBuilder(table, value, String(options?.onConflict || ""));
        },
      };
    },
  };
}

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: authState.userId })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => createSupabaseMock()),
}));

vi.mock("@/lib/engine/events", () => ({
  createExecutionId: vi.fn(() => "receipt_test"),
  writeEngineEvent: vi.fn(async (payload: Record<string, unknown>) => {
    engineEvents.push(payload);
    return { ok: true };
  }),
}));

vi.mock("@/lib/signalcore/modeAccess", () => ({
  resolveModeAccess: vi.fn(async ({ requestedMode }: { requestedMode?: string | null }) => ({
    ok: true,
    status: 200,
    mode: requestedMode || "investing",
  })),
}));

const { POST } = await import("@/app/api/daily-snapshot/route");

function makeSnapshot() {
  return {
    portfolio: {
      cashEur: 2000,
      holdings: [
        {
          symbol: "SPY",
          valueEur: 8000,
        },
      ],
    },
    daily: {
      investingEngine: {
        objective: "growth",
        benchmark: {
          benchmarkId: "growth_60_40",
          benchmarkName: "Growth 60/40",
          notes: ["benchmark aligned"],
        },
        benchmarkValidation: {
          benchmarkId: "growth_60_40",
          benchmarkName: "Growth 60/40",
          status: "review",
          overlapWeightPct: 72,
          activeSharePct: 18,
          concentrationDriftPct: 9,
          turnoverPct: 12,
          activeBets: [{ symbol: "SPY", activeWeightPct: 5 }],
          notes: ["benchmark validation ready"],
        },
        executionPolicy: {
          executionMode: "rebalance_now",
          turnoverBucket: "medium",
          estimatedRoundTripCostEur: 12.1,
          notes: ["liquid execution window"],
        },
        instrumentScorecards: [
          {
            symbol: "SPY",
            mandateFit: "high",
            strengths: ["benchmark_eligible"],
            warnings: [],
          },
        ],
        construction: {
          mandate: {
            objective: "growth",
            riskProfile: "Balanced",
            horizon: "Long",
            baseCurrency: "EUR",
          },
          targetAllocations: [{ symbol: "SPY", targetWeightPct: 60, targetValueEur: 6000, rationale: "core" }],
          notes: ["construction ready"],
        },
        rebalance: {
          withinPolicy: true,
          grossTurnoverPct: 12,
          actions: [{ symbol: "SPY", action: "buy", deltaValueEur: 500, rationale: "top up" }],
          notes: ["turnover within band"],
        },
        notes: ["mandate accepted"],
      },
    },
    derived: {
      pricing: {
        coveragePct: 100,
      },
    },
  };
}

beforeEach(() => {
  resetDb();
  authState.userId = "user_investing";
});

describe("daily snapshot investing containment", () => {
  it("rejects Investing financial snapshots supplied by the browser", async () => {
    const response = await POST(
      new Request("http://localhost/api/daily-snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "investing",
          snapshot: makeSnapshot(),
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(410);
    expect(payload.error).toBe("investing_daily_snapshot_endpoint_retired");
    expect(Object.values(dbState).every((rows) => rows.length === 0)).toBe(true);
  });

  it("keeps non-investing payloads out of investing audit tables", async () => {
    const response = await POST(
      new Request("http://localhost/api/daily-snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "trading",
          snapshot: {
            portfolio: {
              cashEur: 100,
              holdings: [],
            },
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(dbState.daily_snapshots).toHaveLength(1);
    expect(dbState.investing_mandate_snapshots).toHaveLength(0);
    expect(dbState.investing_rebalance_ledger).toHaveLength(0);
    expect(dbState.investing_research_snapshots).toHaveLength(0);
    expect(dbState.investing_execution_queue).toHaveLength(0);
  });
});
