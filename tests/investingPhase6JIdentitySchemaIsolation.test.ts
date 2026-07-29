import fs from "node:fs";
import path from "node:path";
import {describe,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
import {createInvestingIdentityScopeResolverV1} from "@/lib/investing/identity/server";

const operations=[
  ["create_research_validation_report","investing:create"],
  ["create_research_scientific_decision","investing:create"],
  ["get_research_validation_report","investing:read"],
  ["list_research_validation_reports","investing:read"],
  ["get_research_scientific_decision","investing:read"],
  ["list_research_scientific_decisions","investing:read"],
] as const;
const resolver=(permissions:readonly ("investing:create"|"investing:read")[])=>
  createInvestingIdentityScopeResolverV1({
    session:{resolve:async()=>({authenticatedUserId:"user",requestId:"request"})},
    directory:{findMemberships:async()=>[{membershipId:"membership",
      authenticatedUserId:"user",ownerId:"owner",tenantId:"tenant",role:"researcher",
      permissions,status:"active"}],
    findPortfolios:async()=>[{portfolioId:"portfolio",accountId:"account",
      ownerId:"owner",tenantId:"tenant",status:"active",investingEnabled:true}]},
  });

describe("Phase 6J identity, schema and isolation",()=>{
  it.each(operations)("maps %s to %s",async(operation,permission)=>{
    await expect(resolver([permission]).resolve(operation)).resolves.toMatchObject({
      membershipId:"membership",tenantId:"tenant",accountId:"account"});
  });
  it.each(operations)("rejects %s without %s",async(operation,permission)=>{
    const other=permission==="investing:create"?"investing:read":"investing:create";
    await expect(resolver([other]).resolve(operation)).rejects.toThrow(
      "identity_scope_not_authorized");
  });
  it("uses only the public identity entrypoint",()=>{
    const source=fs.readFileSync(path.join(process.cwd(),
      "lib/investing/research/scientific-validation/composition.server.ts"),"utf8");
    const imports=[...source.matchAll(/from\s+["']([^"']*investing\/identity[^"']*)["']/gu)]
      .map(match=>match[1]);
    expect(imports).toEqual(["@/lib/investing/identity/server"]);
  });
  it("materializes only reports and decisions with scoped RLS and fail-closed rollback",()=>{
    const migration=fs.readFileSync(path.join(process.cwd(),
      "supabase/migrations/20260801100000_investing_research_scientific_validation_phase6j.sql"),"utf8");
    const rollback=fs.readFileSync(path.join(process.cwd(),
      "supabase/rollbacks/20260801100000_investing_research_scientific_validation_phase6j.down.sql"),"utf8");
    expect((migration.match(/create table public\./gu)??[])).toHaveLength(2);
    expect(migration).toContain("investing_research_validation_reports");
    expect(migration).toContain("investing_research_scientific_decisions");
    expect(migration).toContain("force row level security");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("p_report_hash");
    expect(migration).not.toMatch(/grant\s+(update|delete)/iu);
    expect(rollback).toContain("phase6j_rollback_refused_scientific_evidence_exists");
  });
  it("contains no Trading, promotion, financial or client dependency",()=>{
    const root=path.join(process.cwd(),"lib/investing/research/scientific-validation");
    const source=fs.readdirSync(root).map(name=>
      fs.readFileSync(path.join(root,name),"utf8")).join("\n");
    expect(source).not.toMatch(/from\s+["'][^"']*\/(trading|promotion|brokers?)\//iu);
    expect(source).not.toMatch(/["']use client["']|from\s+["']react["']/iu);
    expect(source).not.toMatch(/\b(orders|positions|accounting|live)\b/iu);
  });
});
