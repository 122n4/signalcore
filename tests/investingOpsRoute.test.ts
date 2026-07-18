import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = { userId: "owner_1" as string | null };

const tableData = {
  investing_mandate_snapshots: [
    {
      user_id: "owner_1",
      mode: "investing",
      day_key: "2026-07-17",
      as_of: "2026-07-17T08:00:00.000Z",
      mandate_fingerprint: "mandate_a",
      objective: "growth",
      inputs: { benchmarkId: "growth_60_40" },
      created_at: "2026-07-17T08:00:01.000Z",
    },
  ],
  investing_rebalance_ledger: [
    {
      user_id: "owner_1",
      mode: "investing",
      day_key: "2026-07-17",
      as_of: "2026-07-17T08:00:00.000Z",
      mandate_fingerprint: "mandate_a",
      status: "proposed",
      valuation_context: { gross_turnover_pct: 12 },
      reason_codes: ["turnover within band"],
      created_at: "2026-07-17T08:00:01.000Z",
    },
  ],
  investing_research_snapshots: [
    {
      user_id: "owner_1",
      mode: "investing",
      day_key: "2026-07-17",
      as_of: "2026-07-17T08:00:00.000Z",
      mandate_fingerprint: "mandate_a",
      benchmark_id: "growth_60_40",
      status: "review",
      summary: {
        overlapWeightPct: 70,
        activeSharePct: 18,
        concentrationDriftPct: 12,
        turnoverPct: 12,
      },
      research_payload: {
        benchmarkValidation: { activeBets: [{ symbol: "SPY" }] },
        instrumentScorecards: [{ symbol: "SPY", warnings: [] }],
      },
      created_at: "2026-07-17T08:00:01.000Z",
    },
  ],
  investing_execution_queue: [
    {
      user_id: "owner_1",
      mode: "investing",
      day_key: "2026-07-17",
      as_of: "2026-07-17T08:00:00.000Z",
      decision_fingerprint: "decision_a",
      approval_status: "pending",
      execution_decision: "manual_execute",
      approval_required: true,
      kill_switch_active: false,
      deployable_capital_eur: 2500,
      blocking_reasons: ["turnover_near_policy_cap"],
      notes: ["manual approval required"],
      created_at: "2026-07-17T08:00:01.000Z",
    },
  ],
  investing_execution_approvals: [
    {
      user_id: "owner_1",
      mode: "investing",
      decision_fingerprint: "decision_a",
      queue_day_key: "2026-07-17",
      decided_at: "2026-07-17T08:30:00.000Z",
      decided_by: "owner_1",
      approval_status: "approved",
      override_applied: false,
      note: "validated",
      meta: {},
      created_at: "2026-07-17T08:30:01.000Z",
    },
  ],
};

class SelectBuilder {
  private filters: Record<string, unknown> = {};

  constructor(private readonly table: keyof typeof tableData) {}

  eq(key: string, value: unknown) {
    this.filters[key] = value;
    return this;
  }

  gte() {
    return this;
  }

  order() {
    return this;
  }

  limit() {
    return this;
  }

  private async execute() {
    const data = tableData[this.table].filter((row) =>
      Object.entries(this.filters).every(([key, value]) => row?.[key as keyof typeof row] === value),
    );
    return { data, error: null };
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }
}

vi.mock("@/lib/auth/requestUser", () => ({
  getRequestUserId: vi.fn(async () => authState.userId),
}));

vi.mock("@/lib/auth/localQaAuth", () => ({
  isLocalQaUserId: vi.fn(() => false),
}));

vi.mock("@/lib/signalcore/owner", () => ({
  isOwnerUserId: vi.fn((userId: string | null | undefined) => userId === "owner_1"),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from(table: keyof typeof tableData) {
      return {
        select() {
          return new SelectBuilder(table);
        },
      };
    },
  })),
}));

const { GET } = await import("@/app/api/ops/investing/route");

beforeEach(() => {
  authState.userId = "owner_1";
});

describe("ops investing route", () => {
  it("returns canonical historical audit for owners", async () => {
    const response = await GET(new Request("http://localhost/api/ops/investing?days=90&mode=investing"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.mode).toBe("investing");
    expect(payload.audit.coverage.researchSnapshots).toBe(1);
    expect(payload.audit.latest.benchmarkId).toBe("growth_60_40");
    expect(payload.audit.summary.validationStatuses.review).toBe(1);
    expect(payload.execution.approvalStatusCounts.pending).toBe(1);
    expect(payload.execution.decisionCounts.manual_execute).toBe(1);
    expect(payload.execution.approvalHistoryCoverage).toBe(1);
    expect(payload.execution.recentApprovals).toHaveLength(1);
    expect(payload.days).toBe(90);
  });

  it("rejects non-owners", async () => {
    authState.userId = "random_user";
    const response = await GET(new Request("http://localhost/api/ops/investing"));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.ok).toBe(false);
    expect(payload.error).toBe("forbidden");
  });
});
