import fs from "node:fs";import path from "node:path";import {describe,expect,it} from "vitest";const root=process.cwd(),read=(file:string)=>
 fs.readFileSync(path.join(root,"lib/investing/research/readiness",file),"utf8");
describe("Phase 7H integrated gate isolation",()=>{it("keeps the release writer server-only and separate from activation",()=>{for(const file of [
 "releaseGate.server.ts","releaseGatePostgresRepository.server.ts","releaseGateComposition.server.ts","operatorAuthorization.server.ts"]){const source=read(file);
 expect(source.startsWith('import "server-only";')).toBe(true);if(file.startsWith("releaseGate"))expect(source).not.toMatch(/activation|activateBeta|broker|trading/iu)}});
 it("uses official trusted composition, identity and PostgreSQL only in production composition",()=>{const source=read("releaseGateComposition.server.ts");
 expect(source).toContain("createProductionTrustedBetaReadinessRuntime");expect(source).toContain('resolver.resolve("operate_research_beta")');
 expect(source).toContain("isAuthorizedBetaOperator");expect(source).toContain("PostgresReleaseGateRepository")});
 it("does not expose beta operator configuration to Client Components",()=>{const files=(directory:string):string[]=>fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
  const target=path.join(directory,entry.name);return entry.isDirectory()?files(target):[target]});for(const file of ["app","components","lib"].flatMap(v=>files(path.join(root,v)))
  .filter(v=>/\.[cm]?[jt]sx?$/u.test(v)).filter(v=>/^\s*["']use client["']/u.test(fs.readFileSync(v,"utf8"))))expect(fs.readFileSync(file,"utf8"))
  .not.toMatch(/INVESTING_BETA_OPERATOR_USER_IDS|operate_research_beta|releaseGateComposition/iu)},30000)});
