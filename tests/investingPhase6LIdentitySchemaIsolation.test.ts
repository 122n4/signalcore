import fs from "node:fs";import path from "node:path";
import {describe,expect,it,vi} from "vitest";vi.mock("server-only",()=>({}));
import {createInvestingIdentityScopeResolverV1} from "@/lib/investing/identity/server";
const operations=[["create_research_scientific_memory_event","investing:create"],
 ["get_research_scientific_memory_event","investing:read"],
 ["list_research_scientific_memory_events","investing:read"],
 ["check_research_scientific_memory_repetition","investing:read"]] as const;
const resolver=(permissions:readonly ("investing:create"|"investing:read")[])=>
 createInvestingIdentityScopeResolverV1({session:{resolve:async()=>({
  authenticatedUserId:"user",requestId:"request"})},directory:{findMemberships:async()=>[{
  membershipId:"member",authenticatedUserId:"user",ownerId:"owner",tenantId:"tenant",
  role:"researcher",permissions,status:"active"}],findPortfolios:async()=>[{
  portfolioId:"portfolio",accountId:"account",ownerId:"owner",tenantId:"tenant",
  status:"active",investingEnabled:true}]}});
describe("Phase 6L identity schema isolation",()=>{
 it.each(operations)("maps %s to %s",async(operation,permission)=>{
  await expect(resolver([permission]).resolve(operation)).resolves.toMatchObject({
   tenantId:"tenant",portfolioId:"portfolio"});});
 it.each(operations)("rejects %s without %s",async(operation,permission)=>{
  const other=permission==="investing:create"?"investing:read":"investing:create";
  await expect(resolver([other]).resolve(operation)).rejects.toThrow(
   "identity_scope_not_authorized");});
 it("uses the public identity entrypoint only",()=>{
  const source=fs.readFileSync(path.join(process.cwd(),
   "lib/investing/research/scientific-memory/composition.server.ts"),"utf8");
  expect([...source.matchAll(/from\s+["']([^"']*investing\/identity[^"']*)["']/gu)]
   .map(m=>m[1])).toEqual(["@/lib/investing/identity/server"]);});
 it("materializes one immutable scoped blueprint table",()=>{
  const migration=fs.readFileSync(path.join(process.cwd(),
   "supabase/migrations/20260803100000_investing_research_scientific_memory_phase6l.sql"),
   "utf8");
  expect((migration.match(/create table public\./gu)??[])).toHaveLength(1);
  expect(migration).toContain("investing_research_audit_events");
  expect(migration).toContain("force row level security");
  expect(migration).toContain("phase6l_event_chain_mismatch");
  expect(migration).toContain("aggregate_id,attempt_ordinal");
  const repository=fs.readFileSync(path.join(process.cwd(),
   "lib/investing/research/scientific-memory/postgresRepository.server.ts"),"utf8");
  expect(repository).toContain("pg_advisory_xact_lock");
  expect(repository).toContain("checked(row.canonical_payload)");
  expect(migration).not.toMatch(/grant\s+(update|delete)/iu);});
 it("has no Trading, promotion, client, financial or worker dependency",()=>{
  const root=path.join(process.cwd(),"lib/investing/research/scientific-memory");
  const source=fs.readdirSync(root).map(n=>fs.readFileSync(path.join(root,n),"utf8")).join("\n");
  expect(source).not.toMatch(/from\s+["'][^"']*\/(trading|promotion|brokers?)\//iu);
  expect(source).not.toMatch(/["']use client["']|from\s+["']react["']/iu);
  expect(source).not.toMatch(/\b(orders|positions|accounting|live|cron|pm2)\b/iu);});
});
