import fs from "node:fs";import path from "node:path";
import {describe,expect,it} from "vitest";
const migration=fs.readFileSync(path.join(process.cwd(),"supabase/migrations/20260805100000_investing_research_beta_readiness_phase7b.sql"),"utf8");
const rollback=fs.readFileSync(path.join(process.cwd(),"supabase/rollbacks/20260805100000_investing_research_beta_readiness_phase7b.down.sql"),"utf8");
describe("Phase 7B schema and isolation",()=>{
 it("is append-only, forced-RLS and service-only",()=>{expect(migration).toContain("force row level security");
  expect(migration).toContain("before update or delete");expect(migration).toContain("to service_role");
  expect(migration).not.toMatch(/grant[^;]+authenticated/iu);expect(migration).not.toMatch(/\b(live|broker|orders|fills)\b/iu)});
 it("refuses rollback when evidence exists",()=>{expect(rollback).toContain("rollback_refused_readiness_evidence_exists");
  expect(rollback).not.toContain("cascade")});
 it("keeps the collector and repository outside operational domains",()=>{const root=path.join(process.cwd(),"lib/investing/research/readiness");
  const source=fs.readdirSync(root).filter(x=>x.endsWith(".ts")).map(x=>fs.readFileSync(path.join(root,x),"utf8")).join("\n");
  expect(source).not.toMatch(/from\s+["'][^"']*(?:broker|trading|controlled-promotion)/u);
  expect(source).not.toMatch(/\b(?:fetch|window|document|localStorage)\b/u)});
});
