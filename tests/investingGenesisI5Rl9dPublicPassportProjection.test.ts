import {describe,expect,it} from "vitest";
import {projectBlindTruthPublicEventRowsV1} from "../lib/investing/research/blindTruthPassportProjection";

const H=(x:string)=>x.repeat(64);
const registration=H("A"),seal=H("B"),evaluation=H("C"),started=H("D"),terminal=H("E");
const base={
  registration_hash_hex:registration,vault_seal_hash_hex:null as string|null,
  evaluation_hash_hex:null as string|null,event_state:null as string|null,
  event_hash_hex:null as string|null,
  predecessor_event_hash_hex:null as string|null,
  reason:null as string|null,
};
const initial=(updates:Partial<typeof base>={})=>({...base,...updates});
const open=initial({
  vault_seal_hash_hex:seal,evaluation_hash_hex:evaluation,
  event_state:"REVEAL_STARTED",event_hash_hex:started,
});
const failed=initial({
  vault_seal_hash_hex:seal,evaluation_hash_hex:evaluation,
  event_state:"REVEAL_FAILED_CLOSED",event_hash_hex:terminal,
  predecessor_event_hash_hex:started,reason:"ACCESS_AUDIT_UNAVAILABLE",
});
function projected(rows:typeof base[]){
  const result=projectBlindTruthPublicEventRowsV1(rows);
  expect(result.ok).toBe(true);
  if(result.ok===false)throw Error("INVALID_PROJECTION");
  return result.projection;
}
describe("RL-9D public Passport event reconstruction uses persisted immutable scientific evidence",()=>{
  it("empty set is available but makes no invented registration or result",()=>{
    expect(projected([])).toEqual({availability:"PUBLIC_METADATA_ONLY",episodes:[]});
  });
  it("projects registered, sealed and armed with no secret",()=>{
    for(const [row,state] of [
      [base,"REGISTERED"],
      [initial({vault_seal_hash_hex:seal}),"SEALED"],
      [initial({vault_seal_hash_hex:seal,evaluation_hash_hex:evaluation}),"EVALUATION_ARMED"],
    ] as const){
      const p=projected([row]);
      expect(p.episodes).toEqual([{
        registration,vaultSeal:row.vault_seal_hash_hex,evaluation:row.evaluation_hash_hex,
        state,latestEvent:null,reason:null,overallOutcome:null,
      }]);
    }
  });
  it("never mistakes STARTED without terminal result for a scientific FAIL",()=>{
    expect(projected([open]).episodes).toEqual([{
      registration,vaultSeal:seal,evaluation,
      state:"REVEAL_CONSUMED_RESULT_UNAVAILABLE",latestEvent:started,
      reason:null,overallOutcome:null,
    }]);
  });
  it("projects exact linked terminal failure without inventing metrics",()=>{
    const episodes=projected([failed,open]).episodes;
    expect(episodes).toHaveLength(1);
    expect(episodes[0]).toEqual({
      registration,vaultSeal:seal,evaluation,state:"REVEAL_FAILED_CLOSED",
      latestEvent:terminal,reason:"ACCESS_AUDIT_UNAVAILABLE",overallOutcome:null,
    });
  });
  it("rejects duplicate roots/finals and missing roots",()=>{
    for(const records of [
      [open,open],[open,failed,failed],[failed],
      [open,{...open,event_hash_hex:H("F")}],
    ])expect(projectBlindTruthPublicEventRowsV1(records)).toEqual({
      ok:false,code:"PASSPORT_SOURCE_INTEGRITY_FAILURE",
    });
  });
  it("rejects wrong predecessor hash, unexpected reason, missing evaluation and mixed registration",()=>{
    for(const records of [
      [open,{...failed,predecessor_event_hash_hex:H("F")}],
      [{...open,reason:"VAULT_UNAVAILABLE"}],
      [{...open,evaluation_hash_hex:null}],
      [{...open,vault_seal_hash_hex:null}],
      [open,{...failed,reason:"UNAPPROVED_REASON"}],
      [open,{...failed,evaluation_hash_hex:H("F")}],
      [open,{...failed,vault_seal_hash_hex:H("F")}],
    ])expect(projectBlindTruthPublicEventRowsV1(records)).toEqual({
      ok:false,code:"PASSPORT_SOURCE_INTEGRITY_FAILURE",
    });
  });
  it("refuses a claimed completed event until verified evaluator artifacts exist",()=>{
    expect(projectBlindTruthPublicEventRowsV1([open,{
      ...failed,event_state:"REVEAL_COMPLETED",reason:null,
    }])).toEqual({ok:false,code:"PASSPORT_SOURCE_INTEGRITY_FAILURE"});
  });
  it("never reveals a hidden field, derived value, salt, or key",()=>{
    const result=projected([open,failed]);
    const json=JSON.stringify(result);
    for(const field of ["secretSalt","privateObjectLocator","AES_256_GCM",
      "rawHoldout","ciphertext","observedMetricResults","overallOutcome\":\"PASS"])
      expect(json).not.toContain(field);
  });
  it("sorts distinct candidate registrations deterministically",()=>{
    const p=projected([
      {...base,registration_hash_hex:H("F")},
      {...base,registration_hash_hex:H("0")},
      base,
    ]);
    expect(p.episodes.map(x=>x.registration)).toEqual([
      H("0"),registration,H("F"),
    ]);
  });
});
