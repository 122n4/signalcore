import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PostgresInvestingScopeDirectoryAdapterV1 } from
  "@/lib/investing/identity/infrastructure/postgresDirectory.server";

describe("FASE 5D-R shared operation budget in identity", () => {
  it("applies the remaining budget as a transaction-local statement timeout", async () => {
    const queries: Array<readonly [string, readonly unknown[] | undefined]> = [];
    const client = {
      query: vi.fn(async (sql: string, values?: readonly unknown[]) => {
        queries.push([sql, values]);
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const directory = new PostgresInvestingScopeDirectoryAdapterV1(
      { connect: async () => client } as never,
      { remainingMs: () => 3_250 },
    );
    await directory.findMemberships("user-a");
    expect(queries).toContainEqual([
      "select set_config('statement_timeout', $1, true)",
      ["3250ms"],
    ]);
    expect(queries.some(([sql]) => sql === "begin read only")).toBe(true);
    expect(queries.some(([sql]) => sql === "set local role authenticated")).toBe(true);
    expect(queries.some(([sql]) => sql === "commit")).toBe(true);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rolls back and releases when the shared budget is already exhausted", async () => {
    const client = {
      query: vi.fn(async () => ({ rows: [] })),
      release: vi.fn(),
    };
    const directory = new PostgresInvestingScopeDirectoryAdapterV1(
      { connect: async () => client } as never,
      { remainingMs: () => 0 },
    );
    await expect(directory.findMemberships("user-a")).rejects.toThrow(
      "investing_ops_budget_expired",
    );
    expect(client.query).toHaveBeenCalledWith("rollback");
    expect(client.release).toHaveBeenCalledOnce();
  });
});
