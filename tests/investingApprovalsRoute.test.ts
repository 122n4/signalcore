import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = { userId: "owner_1" as string | null };

const queueRows: Array<Record<string, any>> = [];
const approvalHistoryRows: Array<Record<string, any>> = [];

class SelectBuilder {
  constructor(private readonly table: string) {}

  private filters: Record<string, unknown> = {};

  eq(key: string, value: unknown) {
    this.filters[key] = value;
    return this;
  }

  order() {
    return this;
  }

  limit() {
    return this;
  }

  private async execute() {
    const source = this.table === "investing_execution_queue" ? queueRows : approvalHistoryRows;
    const data = source.filter((row) =>
      Object.entries(this.filters).every(([key, value]) => row?.[key] === value),
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

class UpsertBuilder {
  constructor(
    private readonly table: string,
    private readonly value: Record<string, any>,
  ) {}

  private async execute() {
    const target = this.table === "investing_execution_queue" ? queueRows : approvalHistoryRows;
    const index =
      this.table === "investing_execution_queue"
        ? target.findIndex(
            (row) =>
              row.user_id === this.value.user_id &&
              row.mode === this.value.mode &&
              row.day_key === this.value.day_key &&
              row.decision_fingerprint === this.value.decision_fingerprint,
          )
        : -1;

    if (index >= 0) {
      target[index] = JSON.parse(JSON.stringify(this.value));
    } else {
      target.push(JSON.parse(JSON.stringify(this.value)));
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
    from(table: string) {
      if (table !== "investing_execution_queue" && table !== "investing_execution_approvals") {
        throw new Error(`unexpected table:${table}`);
      }
      return {
        select() {
          return new SelectBuilder(table);
        },
        upsert(value: Record<string, any>) {
          return new UpsertBuilder(table, value);
        },
      };
    },
  })),
}));

const { GET, POST } = await import("@/app/api/ops/investing/approvals/route");

beforeEach(() => {
  authState.userId = "owner_1";
  approvalHistoryRows.splice(0, approvalHistoryRows.length);
  queueRows.splice(0, queueRows.length, {
    user_id: "owner_1",
    mode: "investing",
    day_key: "2026-07-17",
    as_of: "2026-07-17T08:00:00.000Z",
    decision_fingerprint: "decision_a",
    approval_status: "pending",
    approval_required: true,
    execution_decision: "manual_execute",
    kill_switch_active: false,
    override_allowed: true,
    deployable_capital_eur: 2500,
    blocking_reasons: ["turnover_near_policy_cap"],
    notes: ["manual approval required"],
    meta: {},
    created_at: "2026-07-17T08:00:01.000Z",
  });
});

describe("investing approvals route", () => {
  it("lists pending approvals for owners", async () => {
    const response = await GET(new Request("http://localhost/api/ops/investing/approvals?mode=investing"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.approvals).toHaveLength(1);
    expect(payload.history).toEqual([]);
    expect(payload.approvals[0]?.decision_fingerprint).toBe("decision_a");
  });

  it("updates approval status canonically", async () => {
    const response = await POST(
      new Request("http://localhost/api/ops/investing/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "investing",
          decisionFingerprint: "decision_a",
          approvalStatus: "approved",
          overrideApplied: true,
          note: "validated",
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(queueRows[0]?.approval_status).toBe("approved");
    expect(queueRows[0]?.notes).toContain("owner:approved:override:validated");
    expect(queueRows[0]?.meta?.lastApproval?.by).toBe("owner_1");
    expect(queueRows[0]?.meta?.lastApproval?.overrideApplied).toBe(true);
    expect(approvalHistoryRows).toHaveLength(1);
    expect(approvalHistoryRows[0]?.override_applied).toBe(true);
  });
});
