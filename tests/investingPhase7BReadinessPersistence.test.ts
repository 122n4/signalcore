import {describe,expect,it,vi} from "vitest";
import {collectBetaReadiness} from "@/lib/investing/research/readiness/collector.server";
import {PostgresBetaReadinessRepository} from
 "@/lib/investing/research/readiness/postgresRepository.server";
import {BETA_READINESS_GATE_IDS} from "@/lib/investing/research/readiness";
const checkpoint="80799ee0e9421360c7df5234b130b4f1ebab7a8f";
const input={checkpoint,evaluatedAt:"2026-08-05T12:00:00.000Z",
 profile:{id:"beta",version:"v1"}};
const ports=()=>BETA_READINESS_GATE_IDS.map(gateId=>({gateId,collect:vi.fn(async()=>({
 gateId,state:"passed" as const,checkpoint,observedAt:"2026-08-05T11:00:00.000Z",
 validUntil:"2026-08-06T11:00:00.000Z",reference:`ci:${gateId}`}))}));
describe("Phase 7B readiness collection and persistence",()=>{
 it("collects every gate once in canonical order and evaluates",async()=>{const p=ports();
  const result=await collectBetaReadiness(input,p);expect(result.manifest).not.toBeNull();
  expect(result.result.ok&&result.result.value.state).toBe("beta_ready");
  expect(p.every(port=>port.collect.mock.calls.length===1)).toBe(true);
  expect(result.manifest?.evidence.map(e=>e.gateId)).toEqual(BETA_READINESS_GATE_IDS)});
 it("rejects incomplete and duplicate collectors before IO",async()=>{const incomplete=ports().slice(1);
  expect((await collectBetaReadiness(input,incomplete)).result).toEqual({ok:false,
   reason:"beta_readiness_collection_invalid"});expect(incomplete[0].collect).not.toHaveBeenCalled();
  const duplicate=ports();duplicate[1]={...duplicate[0],collect:vi.fn()};
  expect((await collectBetaReadiness(input,duplicate)).result.ok).toBe(false)});
 it("fails closed when a collector throws",async()=>{const p=ports();
  p[3]={...p[3],collect:vi.fn(async()=>{throw new Error("offline")})};
  expect((await collectBetaReadiness(input,p)).result).toEqual({ok:false,
   reason:"beta_readiness_collection_invalid"})});
 it("persists once and reuses identical content",async()=>{const collected=await collectBetaReadiness(input,ports());
  if(!collected.manifest||!collected.result.ok)throw new Error("fixture");
  const bundle={manifest:collected.manifest,report:collected.result.value};
  const query=vi.fn().mockResolvedValueOnce({rows:[{canonical_payload:bundle}]});
  const repository=new PostgresBetaReadinessRepository({connect:async()=>({query,release:vi.fn()})} as never);
  await expect(repository.persist(bundle)).resolves.toEqual({value:bundle,reused:false});
  expect(String(query.mock.calls[0][0])).toContain("on conflict(report_hash) do nothing")});
 it("rejects a tampered report before database IO",async()=>{const collected=await collectBetaReadiness(input,ports());
  if(!collected.manifest||!collected.result.ok)throw new Error("fixture");const query=vi.fn();
  const repository=new PostgresBetaReadinessRepository({connect:async()=>({query,release:vi.fn()})} as never);
  await expect(repository.persist({manifest:collected.manifest,report:{...collected.result.value,
   state:"blocked"}})).rejects.toThrow("beta_readiness_integrity_failed");
  expect(query).not.toHaveBeenCalled()});
});
