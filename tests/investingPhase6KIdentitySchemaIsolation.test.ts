import fs from "node:fs";
import path from "node:path";
import {describe,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
import {createInvestingIdentityScopeResolverV1} from "@/lib/investing/identity/server";

const operations=[["create_research_portfolio_risk_capacity_assessment","investing:create"],
  ["get_research_portfolio_risk_capacity_assessment","investing:read"],
  ["list_research_portfolio_risk_capacity_assessments","investing:read"]] as const;
const resolver=(permissions:readonly ("investing:create"|"investing:read")[])=>
  createInvestingIdentityScopeResolverV1({
    session:{resolve:async()=>({authenticatedUserId:"user",requestId:"request"})},
    directory:{findMemberships:async()=>[{membershipId:"membership",
      authenticatedUserId:"user",ownerId:"owner",tenantId:"tenant",role:"researcher",
      permissions,status:"active"}],findPortfolios:async()=>[{
      portfolioId:"portfolio",accountId:"account",ownerId:"owner",tenantId:"tenant",
      status:"active",investingEnabled:true}]}});

describe("Phase 6K identity, schema and isolation",()=>{
  it.each(operations)("maps %s to %s",async(operation,permission)=>{
    await expect(resolver([permission]).resolve(operation)).resolves.toMatchObject({
      tenantId:"tenant",portfolioId:"portfolio"});
  });
  it.each(operations)("rejects %s without %s",async(operation,permission)=>{
    const other=permission==="investing:create"?"investing:read":"investing:create";
    await expect(resolver([other]).resolve(operation)).rejects.toThrow(
      "identity_scope_not_authorized");
  });
  it("uses only the public identity entrypoint",()=>{
    const source=fs.readFileSync(path.join(process.cwd(),
      "lib/investing/research/portfolio-risk/composition.server.ts"),"utf8");
    expect([...source.matchAll(/from\s+["']([^"']*investing\/identity[^"']*)["']/gu)]
      .map(match=>match[1])).toEqual(["@/lib/investing/identity/server"]);
  });
  it("adds immutable scoped assessment and member tables without eligibility",()=>{
    const migration=fs.readFileSync(path.join(process.cwd(),
      "supabase/migrations/20260802100000_investing_research_portfolio_risk_capacity_phase6k.sql"),"utf8");
    expect((migration.match(/create table public\./gu)??[])).toHaveLength(2);
    expect(migration).toContain("force row level security");
    expect(migration).toContain("investing_research_scientific_decisions");
    expect(migration).toContain("phase6k_member_chain_mismatch");
    expect(migration).not.toContain("investing_research_promotion_eligibility");
    expect(migration).not.toMatch(/grant\s+(update|delete)/iu);
  });
  it("has no Trading, promotion, client, financial or worker dependency",()=>{
    const root=path.join(process.cwd(),"lib/investing/research/portfolio-risk");
    const source=fs.readdirSync(root).map(name=>
      fs.readFileSync(path.join(root,name),"utf8")).join("\\n");
    expect(source).not.toMatch(/from\s+["'][^"']*\/(trading|promotion|brokers?)\//iu);
    expect(source).not.toMatch(/["']use client["']|from\s+["']react["']/iu);
    expect(source).not.toMatch(/\b(orders|positions|accounting|live|cron|pm2)\b/iu);
  });
});
