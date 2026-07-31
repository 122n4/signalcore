import {describe,expect,it,vi} from "vitest";
import {BetaReadinessOpsService} from "@/lib/investing/research/readiness/opsService.server";
import {PostgresBetaReadinessOpsRepository} from
 "@/lib/investing/research/readiness/postgresOpsRepository.server";
const row={reportHash:"a".repeat(64),checkpoint:"b".repeat(40),state:"beta_ready" as const,
 evaluatedAt:"2026-08-06T10:00:00.000Z",profileId:"beta",profileVersion:"v1"};
describe("Phase 7C readiness OPS",()=>{
 it("authorizes before IO and fails closed",async()=>{const read=vi.fn();
  const service=new BetaReadinessOpsService({read},{authorize:async()=>({ok:false as const,
   reason:"beta_readiness_ops_not_authorized"})},()=>"2026-08-06T11:00:00.000Z");
  await expect(service.load()).resolves.toEqual({ok:false,reason:"beta_readiness_ops_not_authorized"});
  expect(read).not.toHaveBeenCalled()});
 it("returns a detached read-only projection",async()=>{const service=new BetaReadinessOpsService(
  {read:async()=>[row]},{authorize:async()=>({ok:true as const})},()=>"2026-08-06T11:00:00.000Z");
  const result=await service.load();expect(result.ok&&result.value.current).toEqual(row);
  if(result.ok){expect(result.value.current).not.toBe(row);expect(result.value.notices).toEqual([
   "read_only","no_canonical_payload","no_beta_activation"])}});
 it("selects only safe columns in bounded order",async()=>{const query=vi.fn().mockResolvedValue({rows:[{
  report_hash:row.reportHash,checkpoint:row.checkpoint,state:row.state,
  evaluated_at:new Date(row.evaluatedAt),profile_id:"beta",profile_version:"v1"}]});
  const release=vi.fn();const repository=new PostgresBetaReadinessOpsRepository({connect:async()=>({query,release})});
  await expect(repository.read()).resolves.toEqual([row]);const sql=String(query.mock.calls[0][0]);
  expect(sql).not.toMatch(/canonical_payload|created_at/iu);expect(sql).toContain("limit 20");
  expect(release).toHaveBeenCalled()});
 it("sanitizes malformed rows and database failures",async()=>{const bad=new PostgresBetaReadinessOpsRepository({
  connect:async()=>({query:async()=>({rows:[{...row,report_hash:"bad"}],rowCount:1})})} as never);
  await expect(bad.read()).rejects.toThrow("beta_readiness_ops_integrity_failed");
  const service=new BetaReadinessOpsService({read:async()=>{throw new Error("secret")}},
   {authorize:async()=>({ok:true as const})},()=>"2026-08-06T11:00:00.000Z");
  await expect(service.load()).resolves.toEqual({ok:false,reason:"beta_readiness_ops_read_failed"})});
});
