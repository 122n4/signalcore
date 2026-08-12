import fs from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { readCanonicalInvestingPlanForUser } from "@/lib/investing/server/plan";

type Row = Record<string, unknown>;

const rows: Row[] = [];
const calls: Array<{ table: string; select: string; filters: Array<[string, unknown]>; limit: number | null }> = [];
let failDatabase = false;
let rpcCalls = 0;
let writes = 0;

class QueryBuilder {
  private selected = "";
  private filters: Array<[string, unknown]> = [];
  private rowLimit: number | null = null;
  private orderKey: string | null = null;
  private ascending = true;

  constructor(private readonly table: string) {}

  select(columns: string) {
    this.selected = columns;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderKey = column;
    this.ascending = options?.ascending ?? true;
    return this;
  }

  limit(value: number) {
    this.rowLimit = value;
    return this;
  }

  private execute() {
    calls.push({ table: this.table, select: this.selected, filters: [...this.filters], limit: this.rowLimit });
    if (failDatabase) return { data: null, error: { code: "db_unavailable" } };
    let result = rows.filter((row) => this.filters.every(([column, value]) => row[column] === value));
    if (this.orderKey) {
      const key = this.orderKey;
      result = [...result].sort((left, right) => {
        const order = String(left[key] ?? "").localeCompare(String(right[key] ?? ""));
        return this.ascending ? order : -order;
      });
    }
    if (this.rowLimit != null) result = result.slice(0, this.rowLimit);
    return { data: result, error: null };
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[] | null; error: { code: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }
}

function database() {
  return {
    from(table: string) {
      return new QueryBuilder(table);
    },
    rpc() {
      rpcCalls += 1;
      throw new Error("rpc_must_not_be_called");
    },
    insert() {
      writes += 1;
      throw new Error("write_must_not_be_called");
    },
    upsert() {
      writes += 1;
      throw new Error("write_must_not_be_called");
    },
  } as any;
}

function plan(overrides: Row = {}) {
  return {
    id: "plan-active",
    user_id: "user_a",
    mode: "investing",
    status: "active",
    is_active: true,
    version: 1,
    label: "Core plan",
    intent: "Build long-term wealth",
    goal: "Long-term investing plan",
    payload: {},
    activated_at: "2026-08-01T00:00:00.000Z",
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-02T00:00:00.000Z",
    archived_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  rows.length = 0;
  calls.length = 0;
  failDatabase = false;
  rpcCalls = 0;
  writes = 0;
});

describe("canonical Investing plan service", () => {
  it("returns a read-only missing-plan state when there are zero active Investing plans", async () => {
    const result = await readCanonicalInvestingPlanForUser({ userId: "user_a", database: database() });

    expect(result.status).toBe(200);
    expect(result.state).toEqual({ availability: "UNAVAILABLE", reason: "plan_missing", value: null });
    expect(writes).toBe(0);
    expect(rpcCalls).toBe(0);
  });

  it("selects exactly one active Investing plan scoped to the server user", async () => {
    rows.push(plan());

    const result = await readCanonicalInvestingPlanForUser({ userId: "user_a", database: database() });

    expect(result.state.availability).toBe("AVAILABLE");
    expect(result.state.value).toMatchObject({
      id: "plan-active",
      mode: "investing",
      status: "active",
      version: 1,
      summary: "Long-term investing plan",
    });
    expect(calls[0]).toMatchObject({
      table: "plans",
      select: "id,user_id,mode,status,is_active,version,label,intent,goal,payload,activated_at,updated_at,created_at,archived_at",
      filters: [
        ["user_id", "user_a"],
        ["mode", "investing"],
        ["status", "active"],
        ["is_active", true],
      ],
      limit: 2,
    });
  });

  it("does not let a newer draft supersede the active canonical plan", async () => {
    rows.push(
      plan({ id: "older-active", created_at: "2026-08-01T00:00:00.000Z" }),
      plan({ id: "newer-draft", status: "draft", is_active: false, created_at: "2026-08-10T00:00:00.000Z" }),
    );

    const result = await readCanonicalInvestingPlanForUser({ userId: "user_a", database: database() });

    expect(result.state.value?.id).toBe("older-active");
  });

  it("fails closed when active plans are ambiguous", async () => {
    rows.push(plan({ id: "plan-a" }), plan({ id: "plan-b" }));

    const result = await readCanonicalInvestingPlanForUser({ userId: "user_a", database: database() });

    expect(result.status).toBe(409);
    expect(result.error).toBe("investing_plan_ambiguous");
    expect(result.state.value).toBeNull();
    expect(JSON.stringify(result)).not.toContain("plan-a");
    expect(JSON.stringify(result)).not.toContain("plan-b");
  });

  it("excludes wrong mode, wrong user, and inactive active-looking rows", async () => {
    rows.push(
      plan({ id: "trading-plan", mode: "trading" }),
      plan({ id: "other-user-plan", user_id: "user_b" }),
      plan({ id: "inactive-flag", is_active: false }),
    );

    const result = await readCanonicalInvestingPlanForUser({ userId: "user_a", database: database() });

    expect(result.state).toEqual({ availability: "UNAVAILABLE", reason: "plan_missing", value: null });
  });

  it("fails closed for invalid material plan fields", async () => {
    rows.push(plan({ version: 0 }));

    const result = await readCanonicalInvestingPlanForUser({ userId: "user_a", database: database() });

    expect(result.status).toBe(503);
    expect(result.error).toBe("investing_plan_invalid");
    expect(result.state.value).toBeNull();
  });

  it("keeps an empty payload as structured unavailable without fake target or risk", async () => {
    rows.push(plan({ payload: {} }));

    const result = await readCanonicalInvestingPlanForUser({ userId: "user_a", database: database() });

    expect(result.state.value?.structured).toEqual({
      availability: "UNAVAILABLE",
      schemaVersion: null,
      reason: "structured_plan_missing",
    });
    expect(JSON.stringify(result)).not.toContain("50000");
    expect(JSON.stringify(result)).not.toContain("Balanced");
    expect(JSON.stringify(result)).not.toContain("\"horizon\"");
  });

  it("accepts the closed structured payload v1 fields", async () => {
    rows.push(plan({
      payload: {
        schemaVersion: 1,
        objective: {
          type: "retirement",
          targetAmount: { amount: 100000, currency: "EUR" },
          timeframeMonths: 120,
          monthlyContribution: { amount: 250, currency: "EUR" },
        },
        risk: { profile: "Balanced" },
        guardrails: { maxSinglePositionPct: 20, maxTop5Pct: 60 },
      },
    }));

    const result = await readCanonicalInvestingPlanForUser({ userId: "user_a", database: database() });

    expect(result.state.value?.structured).toMatchObject({
      availability: "AVAILABLE",
      schemaVersion: 1,
      objective: {
        targetAmount: { amount: 100000, currency: "EUR" },
        timeframeMonths: 120,
      },
      risk: { profile: "Balanced" },
      guardrails: { maxSinglePositionPct: 20, maxTop5Pct: 60 },
    });
  });

  it("marks malformed structured payload v1 as unavailable", async () => {
    rows.push(plan({ payload: { schemaVersion: 1, objective: { targetAmount: { amount: -1, currency: "EUR" } } } }));

    const result = await readCanonicalInvestingPlanForUser({ userId: "user_a", database: database() });

    expect(result.state.value?.structured).toEqual({
      availability: "UNAVAILABLE",
      schemaVersion: 1,
      reason: "structured_plan_invalid",
    });
  });

  it("rejects modelling output fields and does not expose raw payload or ownership", async () => {
    rows.push(plan({
      payload: {
        schemaVersion: 1,
        objective: { targetAmount: { amount: 100000, currency: "EUR" } },
        goalProbability: 0.8,
      },
    }));

    const result = await readCanonicalInvestingPlanForUser({ userId: "user_a", database: database() });
    const json = JSON.stringify(result);

    expect(result.state.value?.structured.reason).toBe("forbidden_modelling_field");
    expect(json).not.toContain("user_id");
    expect(json).not.toContain("payload");
    expect(json).not.toContain("goalProbability");
  });

  it("reports database failure as sanitized unavailable", async () => {
    failDatabase = true;

    const result = await readCanonicalInvestingPlanForUser({ userId: "user_a", database: database() });

    expect(result.status).toBe(503);
    expect(result.error).toBe("investing_plan_read_failed");
  });

  it("does not reference legacy default builders or dirty plan RPCs", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "lib/investing/server/plan.ts"), "utf8");
    const routeSource = fs.readFileSync(path.join(process.cwd(), "app/api/investing/plan/route.ts"), "utf8");

    for (const text of [
      "planFromSettings",
      "upsertDefaultPlanIfMissing",
      "read_investing_canonical_plan_v1",
      "read_investing_canonical_plan_version_v1",
      "list_investing_canonical_plan_history_v1",
      "replace_investing_canonical_plan_version_v2",
    ]) {
      expect(source).not.toContain(text);
      expect(routeSource).not.toContain(text);
    }
  });
});
