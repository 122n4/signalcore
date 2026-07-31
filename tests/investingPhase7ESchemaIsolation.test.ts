import fs from "node:fs";import path from "node:path";import {describe,expect,it} from "vitest";
const migration=fs.readFileSync(path.join(process.cwd(),"supabase/migrations/20260806100000_investing_release_effective_readiness_phase7e.sql"),"utf8");
const rollback=fs.readFileSync(path.join(process.cwd(),"supabase/rollbacks/20260806100000_investing_release_effective_readiness_phase7e.down.sql"),"utf8");
describe("Phase 7E schema and isolation",()=>{it("is append-only, forced-RLS and service-only",()=>{
 expect((migration.match(/force row level security/gu)??[])).toHaveLength(3);expect((migration.match(/before update or delete/gu)??[])).toHaveLength(3);
 expect(migration).not.toMatch(/grant[^;]+authenticated/iu);expect(migration).not.toMatch(/\b(live|broker|orders|fills)\b/iu)});
 it("preserves candidate/report FKs and rejects destructive rollback",()=>{expect(migration).toContain("references public.investing_research_beta_readiness_reports");
  expect(migration).toContain("supersedes_assessment_id");expect(rollback).toContain("rollback_refused_release_evidence_exists");expect(rollback).not.toContain("cascade")});
 it("keeps release identity server-only and outside activation",()=>{const source=fs.readFileSync(path.join(process.cwd(),
  "lib/investing/research/readiness/releaseIdentity.server.ts"),"utf8");expect(source).toMatch(/^import "server-only";/u);
  expect(source).not.toMatch(/from\s+["'][^"']*(?:broker|trading|activation|controlled-promotion)/u)});});
