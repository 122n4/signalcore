import fs from "node:fs";import path from "node:path";
import {describe,expect,it,vi} from "vitest";vi.mock("server-only",()=>({}));
import {createInvestingIdentityScopeResolverV1} from "@/lib/investing/identity/server";
const operations=[["evaluate_research_promotion_eligibility","investing:create"],
 ["prepare_research_promotion_request","investing:create"],
 ["revoke_research_promotion","investing:create"],
 ["get_research_promotion_request","investing:read"],
 ["list_research_promotion_requests","investing:read"]] as const;
const resolver=(permissions:readonly ("investing:create"|"investing:read")[])=>
 createInvestingIdentityScopeResolverV1({session:{resolve:async()=>({
  authenticatedUserId:"user",requestId:"request"})},directory:{findMemberships:async()=>[{
  membershipId:"member",authenticatedUserId:"user",ownerId:"owner",tenantId:"tenant",
  role:"researcher",permissions,status:"active"}],findPortfolios:async()=>[{
  portfolioId:"portfolio",accountId:"account",ownerId:"owner",tenantId:"tenant",
  status:"active",investingEnabled:true}]}});
describe("Phase 6M identity schema isolation",()=>{
 it.each(operations)("maps %s to %s",async(operation,permission)=>{
  await expect(resolver([permission]).resolve(operation)).resolves.toMatchObject({
   tenantId:"tenant",portfolioId:"portfolio"});});
 it.each(operations)("rejects %s without %s",async(operation,permission)=>{
  await expect(resolver([permission==="investing:create"?"investing:read":
   "investing:create"]).resolve(operation)).rejects.toThrow(
   "identity_scope_not_authorized");});
 it("uses only the public identity entrypoint",()=>{
  const source=fs.readFileSync(path.join(process.cwd(),
   "lib/investing/research/controlled-promotion/composition.server.ts"),"utf8");
  expect([...source.matchAll(/from\s+["']([^"']*investing\/identity[^"']*)["']/gu)]
   .map(m=>m[1])).toEqual(["@/lib/investing/identity/server"]);});
 it("materializes eligibility plus additive requests/revocations fail-closed",()=>{
  const sql=fs.readFileSync(path.join(process.cwd(),
   "supabase/migrations/20260804100000_investing_research_controlled_promotion_phase6m.sql"),
   "utf8");expect((sql.match(/create table public\./gu)??[])).toHaveLength(3);
  expect(sql).toContain("phase6m_risk_chain_mismatch");
  expect(sql).toContain("phase6m_memory_chain_mismatch");
  expect(sql).toContain("phase6m_request_chain_mismatch");
  expect(sql).toContain("force row level security");
  expect(sql).not.toMatch(/grant\s+(update|delete)/iu);
  expect(sql).not.toMatch(/(["'])live\1/iu);});
 it("contains no Engine, Trading, broker, order or client dependency",()=>{
  const root=path.join(process.cwd(),"lib/investing/research/controlled-promotion");
  const source=fs.readdirSync(root).map(n=>fs.readFileSync(path.join(root,n),"utf8")).join("\n");
  expect(source).not.toMatch(/from\s+["'][^"']*\/(engine|trading|brokers?)\//iu);
  expect(source).not.toMatch(/["']use client["']|from\s+["']react["']/iu);
  expect(source).not.toMatch(/\b(orders|positions|fills|accounting|cron|pm2)\b/iu);});
});
