import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createInvestingIdentityScopeResolverV1 } from "@/lib/investing/identity/server";
import type { InvestingIdentityOperationV1 } from "@/lib/investing/identity/contracts";

const operations = [
  ["create_research_hypothesis","investing:create"],
  ["transition_research_hypothesis","investing:create"],
  ["get_research_hypothesis","investing:read"],
  ["list_research_hypotheses","investing:read"],
  ["create_strategy_candidate","investing:create"],
  ["transition_strategy_candidate","investing:create"],
  ["get_strategy_candidate","investing:read"],
  ["list_strategy_candidates","investing:read"],
] as const;
const resolver = (permissions: readonly ("investing:create" | "investing:read")[]) =>
  createInvestingIdentityScopeResolverV1({
    session: { resolve: async () => ({ authenticatedUserId: "user-a",requestId: "request-a" }) },
    directory: {
      findMemberships: async () => [{ membershipId: "member-a",authenticatedUserId: "user-a",
        ownerId: "owner-a",tenantId: "tenant-a",role: "researcher",permissions,status: "active" }],
      findPortfolios: async () => [{ portfolioId: "portfolio-a",accountId: "account-a",
        ownerId: "owner-a",tenantId: "tenant-a",status: "active",investingEnabled: true }],
    },
  });

describe("Phase 6H identity extension and isolation", () => {
  it.each(operations)("maps %s to least privilege %s", async (operation,permission) => {
    await expect(resolver([permission]).resolve(operation)).resolves.toMatchObject({
      tenantId: "tenant-a",accountId: "account-a",
    });
    const other = permission === "investing:read" ? "investing:create" : "investing:read";
    await expect(resolver([other]).resolve(operation)).rejects.toThrow(
      "identity_scope_not_authorized");
  });
  it("rejects unknown and wildcard-like operations", async () => {
    await expect(resolver(["investing:create"]).resolve(
      "manage_research" as InvestingIdentityOperationV1)).rejects.toThrow(
      "identity_scope_not_authorized");
  });
  it("allows only the literal public identity entrypoint in the 6H consumer", () => {
    const root = path.join(process.cwd(),"lib/investing/research/hypotheses");
    for (const name of fs.readdirSync(root)) {
      const source = fs.readFileSync(path.join(root,name),"utf8");
      const imports = [...source.matchAll(/from\s+["']([^"']*investing\/identity[^"']*)["']/gu)]
        .map((match) => match[1]);
      if (name === "composition.server.ts") {
        expect(imports).toEqual(["@/lib/investing/identity/server"]);
      } else expect(imports).toEqual([]);
    }
  });
  it("introduces no Trading, UI, backtest, promotion or future science tables", () => {
    const migration = fs.readFileSync(path.join(process.cwd(),
      "supabase/migrations/20260730100000_investing_research_hypotheses_candidates_phase6h.sql"),"utf8");
    expect(migration.match(/create table public\.investing_research_/gu)).toHaveLength(2);
    expect(migration).not.toMatch(/create table public\.investing_research_(experiments|experiment_runs|research_jobs)/iu);
    expect(migration).not.toMatch(/references public\.(orders|positions|fills|brokers|trading)/iu);
  });
});
