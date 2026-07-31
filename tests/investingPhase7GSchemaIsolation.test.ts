import fs from "node:fs";import path from "node:path";import {describe,expect,it} from "vitest";const root=process.cwd();
const migration=fs.readFileSync(path.join(root,"supabase/migrations/20260807100000_investing_beta_activation_boundary_phase7g.sql"),"utf8");
const rollback=fs.readFileSync(path.join(root,"supabase/rollbacks/20260807100000_investing_beta_activation_boundary_phase7g.down.sql"),"utf8");
describe("Phase 7G schema and isolation",()=>{it("uses immutable RLS decisions and fail-closed rollback",()=>{expect(migration).toContain("force row level security");
 expect(migration).toContain("before update or delete");expect(migration).toContain("on delete restrict");expect(rollback).toContain(
  "rollback_refused_activation_evidence_exists");expect(rollback).not.toContain("cascade")});it("serializes by environment and rechecks authoritative state",()=>{
 const source=fs.readFileSync(path.join(root,"lib/investing/research/readiness/activationPostgresRepository.server.ts"),"utf8");expect(source).toContain(
  "pg_advisory_xact_lock");expect(source).toContain("not exists");expect(source).toContain('client.query("rollback")')});it("keeps activation server-only and separate from UI",()=>{
 for(const file of ["activationBoundary.server.ts","activationPostgresRepository.server.ts","activationComposition.server.ts"]){const source=fs.readFileSync(
  path.join(root,"lib/investing/research/readiness",file),"utf8");expect(source.startsWith('import "server-only";')).toBe(true);expect(source).not.toMatch(
   /from\s+["'][^"']*(?:broker|trading|controlled-promotion|app\/ops)/u)}const composition=fs.readFileSync(path.join(root,
   "lib/investing/research/readiness/activationComposition.server.ts"),"utf8");expect(composition).toContain('resolver.resolve("operate_research_beta")');
   expect(composition).toContain('from\n "@/lib/investing/identity/server"')})});
