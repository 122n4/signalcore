import fs from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import {
  readInvestingUiPreferences,
  validateInvestingUiPreferencesInput,
  writeInvestingUiPreferences,
} from "@/lib/investing/server/preferences";

type Row = Record<string, unknown>;

const rows: Row[] = [];
const calls: Array<{ op: string; table: string; select?: string; filters?: Array<[string, unknown]>; row?: Row }> = [];
let failDatabase = false;
let rpcCalls = 0;

class QueryBuilder {
  private selected = "";
  private filters: Array<[string, unknown]> = [];
  private rowLimit: number | null = null;
  private pendingUpsert: Row | null = null;

  constructor(private readonly table: string) {}

  select(columns: string) {
    this.selected = columns;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }

  limit(value: number) {
    this.rowLimit = value;
    return this;
  }

  upsert(row: Row) {
    this.pendingUpsert = row;
    return this;
  }

  private execute() {
    if (failDatabase) return { data: null, error: { code: "db_unavailable" } };
    if (this.pendingUpsert) {
      calls.push({ op: "upsert", table: this.table, select: this.selected, row: this.pendingUpsert });
      const existing = rows.find((row) => row.user_id === this.pendingUpsert?.user_id);
      if (existing) Object.assign(existing, this.pendingUpsert);
      else rows.push({ created_at: "2026-08-01T00:00:00.000Z", plan_active: false, ...this.pendingUpsert });
    } else {
      calls.push({ op: "select", table: this.table, select: this.selected, filters: [...this.filters] });
    }
    let result = rows.filter((row) => this.filters.every(([column, value]) => row[column] === value));
    if (this.pendingUpsert) result = rows.filter((row) => row.user_id === this.pendingUpsert?.user_id);
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
  } as any;
}

beforeEach(() => {
  rows.length = 0;
  calls.length = 0;
  failDatabase = false;
  rpcCalls = 0;
});

describe("canonical Investing preferences service", () => {
  it("reads existing own preferences with an explicit projection", async () => {
    rows.push({
      user_id: "user_a",
      investing_ui_state: { schemaVersion: 1, defaultScreen: "portfolio" },
      updated_at: "2026-08-02T00:00:00.000Z",
      goal_target_value: 50000,
    });

    const result = await readInvestingUiPreferences({ userId: "user_a", database: database() });

    expect(result).toEqual({
      preferences: { schemaVersion: 1, defaultScreen: "portfolio" },
      updatedAt: "2026-08-02T00:00:00.000Z",
    });
    expect(calls[0]).toMatchObject({
      op: "select",
      table: "user_settings",
      select: "user_id,investing_ui_state,updated_at",
      filters: [["user_id", "user_a"]],
    });
  });

  it("returns a safe default for a missing row without writing", async () => {
    const result = await readInvestingUiPreferences({ userId: "user_a", database: database() });

    expect(result).toEqual({ preferences: { schemaVersion: 1, defaultScreen: null }, updatedAt: null });
    expect(calls.map((call) => call.op)).toEqual(["select"]);
  });

  it("does not read another user's preferences when client identity differs", async () => {
    rows.push({ user_id: "user_b", investing_ui_state: { schemaVersion: 1, defaultScreen: "plan" } });

    const result = await readInvestingUiPreferences({ userId: "user_a", database: database() });

    expect(result.preferences.defaultScreen).toBeNull();
  });

  it("validates and persists only the UI state namespace", async () => {
    rows.push({
      user_id: "user_a",
      investing_ui_state: { schemaVersion: 1, defaultScreen: "overview" },
      risk_profile: "Balanced",
      goal_target_value: 50000,
    });

    const result = await writeInvestingUiPreferences({
      userId: "user_a",
      preferences: { schemaVersion: 1, defaultScreen: "insights" },
      database: database(),
      now: "2026-08-03T00:00:00.000Z",
    });

    expect(result.preferences).toEqual({ schemaVersion: 1, defaultScreen: "insights" });
    expect(calls[0]).toMatchObject({
      op: "upsert",
      table: "user_settings",
      row: {
        user_id: "user_a",
        investing_ui_state: { schemaVersion: 1, defaultScreen: "insights" },
        updated_at: "2026-08-03T00:00:00.000Z",
      },
    });
    expect(rows[0].risk_profile).toBe("Balanced");
    expect(rows[0].goal_target_value).toBe(50000);
  });

  it("accepts null defaultScreen as a valid reset", () => {
    expect(validateInvestingUiPreferencesInput({ schemaVersion: 1, defaultScreen: null })).toEqual({
      schemaVersion: 1,
      defaultScreen: null,
    });
  });

  it("rejects malformed screens, wrong versions, unknown keys, and financial authority keys", () => {
    for (const body of [
      { schemaVersion: 1, defaultScreen: "settings" },
      { schemaVersion: 2, defaultScreen: "overview" },
      { schemaVersion: 1, defaultScreen: "overview", compact: true },
      { schemaVersion: 1, defaultScreen: "overview", tenantId: "tenant_b" },
      { schemaVersion: 1, defaultScreen: "overview", account_id: "account_b" },
      { schemaVersion: 1, defaultScreen: "overview", riskProfile: "Aggressive" },
      { schemaVersion: 1, defaultScreen: "overview", hideUnavailable: true },
    ]) {
      expect(() => validateInvestingUiPreferencesInput(body)).toThrow("investing_preferences_invalid");
    }
  });

  it("reports database failures without memory fallback", async () => {
    failDatabase = true;

    await expect(readInvestingUiPreferences({ userId: "user_a", database: database() })).rejects.toMatchObject({
      code: "investing_preferences_unavailable",
      status: 503,
    });
  });

  it("does not reference dirty preference RPC contracts", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "lib/investing/server/preferences.ts"), "utf8");
    const routeSource = fs.readFileSync(path.join(process.cwd(), "app/api/investing/preferences/route.ts"), "utf8");

    for (const text of ["read_investing_dashboard_preferences_v1", "save_investing_dashboard_preferences_v1", "mvpStore"]) {
      expect(source).not.toContain(text);
      expect(routeSource).not.toContain(text);
    }
    expect(rpcCalls).toBe(0);
  });
});
