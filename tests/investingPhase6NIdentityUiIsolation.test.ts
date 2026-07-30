import fs from "node:fs";import path from "node:path";
import {describe,expect,it,vi} from "vitest";vi.mock("server-only",()=>({}));
import {createInvestingIdentityScopeResolverV1} from "@/lib/investing/identity/server";
const resolver=(permissions:readonly ("investing:read"|"investing:create")[])=>
 createInvestingIdentityScopeResolverV1({session:{resolve:async()=>({
  authenticatedUserId:"user",requestId:"request"})},directory:{findMemberships:async()=>[{
  membershipId:"member",authenticatedUserId:"user",ownerId:"owner",tenantId:"tenant",
  role:"researcher",permissions,status:"active"}],findPortfolios:async()=>[{
  portfolioId:"portfolio",accountId:"account",ownerId:"owner",tenantId:"tenant",
  status:"active",investingEnabled:true}]}});
describe("Phase 6N identity and UI isolation",()=>{
 it("maps the literal operation only to investing read",async()=>{
  await expect(resolver(["investing:read"]).resolve("view_research_lab_ops"))
   .resolves.toMatchObject({tenantId:"tenant",ownerId:"owner",portfolioId:"portfolio",
    accountId:"account",membershipId:"member"});
  await expect(resolver(["investing:create"]).resolve("view_research_lab_ops"))
   .rejects.toThrow("identity_scope_not_authorized");
 });
 it("imports identity exclusively through its public server entrypoint",()=>{
  const source=fs.readFileSync(path.join(process.cwd(),
   "lib/investing/research/ops/composition.server.ts"),"utf8");
  expect([...source.matchAll(/from\s+["']([^"']*investing\/identity[^"']*)["']/gu)]
   .map(m=>m[1])).toEqual(["@/lib/investing/identity/server"]);
 });
 it("keeps the UI server-only and without mutations or promotion controls",()=>{
  const source=fs.readFileSync(path.join(process.cwd(),
   "app/investing/research/page.tsx"),"utf8");
  expect(source).not.toMatch(/["']use client["']|<form|<button|action=|server action/iu);
  expect(source).not.toMatch(/prepare_research_promotion|create_research_scientific_decision/iu);
 });
 it("contains no Trading, Engine, financial or background-runtime dependency",()=>{
  const root=path.join(process.cwd(),"lib/investing/research/ops");
  const source=fs.readdirSync(root).map(n=>fs.readFileSync(path.join(root,n),"utf8")).join("\n");
  expect(source).not.toMatch(/from\s+["'][^"']*\/(trading|engine|brokers?|paper)\//iu);
  expect(source).not.toMatch(/\b(orders|positions|fills|accounting|cron|pm2|workers?)\b/iu);
  expect(source).not.toMatch(/\b(insert|update|delete)\s+(into|public\.|from)/iu);
 });
});
