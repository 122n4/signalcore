import fs from "node:fs";
import path from "node:path";
import {describe,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
import {createInvestingIdentityScopeResolverV1} from "@/lib/investing/identity/server";

const operations=[
  ["create_research_experiment","investing:create"],
  ["queue_research_backtest","investing:create"],
  ["cancel_research_backtest","investing:create"],
  ["get_research_experiment","investing:read"],
  ["get_research_experiment_run","investing:read"],
  ["list_research_experiments","investing:read"],
] as const;
const resolver=(permissions:readonly ("investing:create"|"investing:read")[])=>
  createInvestingIdentityScopeResolverV1({
    session:{resolve:async()=>({authenticatedUserId:"user",requestId:"request"})},
    directory:{
      findMemberships:async()=>[{membershipId:"membership",authenticatedUserId:"user",
        ownerId:"owner",tenantId:"tenant",role:"researcher",permissions,status:"active"}],
      findPortfolios:async()=>[{portfolioId:"portfolio",accountId:"account",
        ownerId:"owner",tenantId:"tenant",status:"active",investingEnabled:true}],
    },
  });

describe("Phase 6I identity and isolation",()=>{
  it.each(operations)("maps %s to %s",async(operation,permission)=>{
    await expect(resolver([permission]).resolve(operation)).resolves.toMatchObject({
      membershipId:"membership",tenantId:"tenant",accountId:"account",
    });
  });
  it.each(operations)("rejects %s without %s",async(operation,permission)=>{
    const other=permission==="investing:create"?"investing:read":"investing:create";
    await expect(resolver([other]).resolve(operation)).rejects.toThrow(
      "identity_scope_not_authorized");
  });
  it("allows only the public identity entrypoint in the 6I consumer",()=>{
    const source=fs.readFileSync(path.join(process.cwd(),
      "lib/investing/research/backtesting/composition.server.ts"),"utf8");
    const imports=[...source.matchAll(/from\s+["']([^"']*investing\/identity[^"']*)["']/gu)]
      .map(match=>match[1]);
    expect(imports).toEqual(["@/lib/investing/identity/server"]);
  });
  it("contains no Trading or future scientific dependency",()=>{
    const root=path.join(process.cwd(),"lib/investing/research/backtesting");
    const source=fs.readdirSync(root).map(name=>
      fs.readFileSync(path.join(root,name),"utf8")).join("\n");
    expect(source).not.toMatch(/from\s+["'][^"']*\/(trading|promotion|validation)\//iu);
    expect(source).not.toMatch(/research_ready.*=.*true|promotion_eligible/iu);
  });
  it("persists only the accepted 6B envelope at the completed-run boundary",()=>{
    const migration=fs.readFileSync(path.join(process.cwd(),
      "supabase/migrations/20260731100000_investing_research_backtesting_phase6i.sql"),"utf8");
    expect(migration).toContain(
      "canonical_result->>'contractVersion'='investing-experiment-result-envelope/v1'");
    expect(migration).toContain("canonical_result->>'experimentId'=experiment_id");
    expect(migration).toContain("canonical_result->>'runId'=run_id");
    expect(migration).toContain("canonical_result#>>'{scope,tenantId}'=tenant_id::text");
    expect(migration).toContain("canonical_result#>>'{scope,accountId}'=account_id::text");
    expect(migration).not.toContain("canonical_result->>'resultHash'=result_hash");
  });
  it("keeps execution cancellation, timeout and input size explicitly bounded",()=>{
    const worker=fs.readFileSync(path.join(process.cwd(),
      "lib/investing/research/backtesting/worker.server.ts"),"utf8");
    const parser=fs.readFileSync(path.join(process.cwd(),
      "lib/investing/research/backtesting/runtimeValidation.ts"),"utf8");
    expect(worker).toContain("signal:AbortSignal");
    expect(worker).toContain("executionTimeoutSeconds");
    expect(worker).toContain("backtest_execution_timeout");
    expect(worker).toContain("backtest_execution_aborted");
    expect(parser).toContain("input.bars.length > 250_000");
  });
});
