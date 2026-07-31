import fs from "node:fs";import path from "node:path";import {describe,expect,it} from "vitest";
describe("Phase 7C isolation",()=>{it("has no mutation or operational dependency",()=>{
 const root=path.join(process.cwd(),"lib/investing/research/readiness");const names=["opsTypes.ts",
  "opsRepository.server.ts","postgresOpsRepository.server.ts","opsService.server.ts",
  "opsComposition.server.ts"];const source=names.map(n=>fs.readFileSync(path.join(root,n),"utf8")).join("\n");
 expect(source).not.toMatch(/from\s+["'][^"']*(?:broker|trading|controlled-promotion)/u);
 expect([...source.matchAll(/from\s+["']([^"']*investing\/identity[^"']*)["']/gu)]
  .map(match=>match[1])).toEqual(["@/lib/investing/identity/server"]);
 expect(source).not.toMatch(/\b(?:insert|update|delete|upsert|submit|promote)\s*\(/iu)});});
