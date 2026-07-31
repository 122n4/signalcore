import fs from "node:fs";import path from "node:path";import {describe,expect,it} from "vitest";
describe("Phase 7D isolation",()=>{it("keeps keys and network behind server-only modules",()=>{const root=path.join(process.cwd(),
 "lib/investing/research/readiness");for(const name of ["trustedRuntime.server.ts","trustedHttpSource.server.ts",
 "trustedComposition.server.ts"]){const source=fs.readFileSync(path.join(root,name),"utf8");expect(source).toMatch(/^import "server-only";/u)}
 const publicIndex=fs.readFileSync(path.join(root,"index.ts"),"utf8");expect(publicIndex).not.toMatch(/trusted|http|composition/iu)});
 it("does not import operational or promotion domains",()=>{const root=path.join(process.cwd(),"lib/investing/research/readiness");
  const source=["trustedRuntime.server.ts","trustedHttpSource.server.ts","trustedComposition.server.ts"]
   .map(n=>fs.readFileSync(path.join(root,n),"utf8")).join("\n");expect(source).not.toMatch(
    /from\s+["'][^"']*(?:broker|trading|execution|controlled-promotion)/u)})});
