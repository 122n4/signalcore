import fs from "node:fs";import path from "node:path";import {describe,expect,it,vi} from "vitest";
import {ReleaseReadinessOpsRepository,ReleaseReadinessOpsService} from
 "@/lib/investing/research/readiness/releaseOps.server";
const row={candidate_id:"irrc_v1_"+"a".repeat(64),commit_sha:"b".repeat(40),target_environment:"staging",
 build_id:"build-1",assessment_id:"ireff_v1_"+"c".repeat(64),state:"effective_beta_ready",reason:null,
 evaluated_at:"2026-08-09T10:00:00.000Z",supersedes_assessment_id:null,revoked_at:null,revocation_reason:null};
describe("Phase 7F release readiness OPS UI",()=>{it("authorizes before reading",async()=>{const read=vi.fn();
 const service=new ReleaseReadinessOpsService(
  {read} as never,
  {authorize:async()=>({ok:false as const,reason:"denied"})},
  ()=>"",
 );
 await expect(service.load()).resolves.toEqual({ok:false,reason:"denied"});expect(read).not.toHaveBeenCalled()});
 it("projects safe columns and effective revocation",async()=>{const query=vi.fn().mockResolvedValue({rows:[{...row,
  revoked_at:"2026-08-09T11:00:00.000Z",revocation_reason:"operator_revoked"}],rowCount:1});const release=vi.fn();
 const repo=new ReleaseReadinessOpsRepository({connect:async()=>({query,release})});const result=await repo.read();
 expect(result[0]).toMatchObject({state:"revoked",revocationReason:"operator_revoked"});const sql=String(query.mock.calls[0][0]);
 expect(sql).not.toMatch(/canonical_payload/iu);expect(sql).toContain("limit 50");expect(release).toHaveBeenCalled()});
 it("keeps the page server-only and without activation controls",()=>{const source=fs.readFileSync(path.join(process.cwd(),
  "app/ops/investing/readiness/page.tsx"),"utf8");expect(source).not.toMatch(/["']use client["']|<form|<button|action=|server action/iu);
  expect(source).not.toMatch(/activateBeta|killSwitch|preparePromotion/iu);expect(source).toContain("no activation controls")});
 it("imports identity only through the public server entrypoint",()=>{const source=fs.readFileSync(path.join(process.cwd(),
  "lib/investing/research/readiness/releaseOpsComposition.server.ts"),"utf8");expect([...source.matchAll(
   /from\s+["']([^"']*investing\/identity[^"']*)["']/gu)].map(m=>m[1])).toEqual(["@/lib/investing/identity/server"])});});
