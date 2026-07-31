import {generateKeyPairSync,sign} from "node:crypto";import {describe,expect,it,vi} from "vitest";
import {canonicalizeResearchContract} from "@/lib/investing/research/contracts";
import {BETA_READINESS_GATE_IDS,type BetaReadinessGateId} from "@/lib/investing/research/readiness";
import {BETA_READINESS_ATTESTATION_VERSION,betaReadinessAttestationMaterial,
 TrustedBetaReadinessRuntime} from "@/lib/investing/research/readiness/trustedRuntime.server";
const checkpoint="2e43103cd660901fc112e1acbf20165bca185fce";
const input={checkpoint,evaluatedAt:"2026-08-07T12:00:00.000Z",profile:{id:"beta",version:"v1"}};
const keys=generateKeyPairSync("ed25519");
const issuers=BETA_READINESS_GATE_IDS.map(gateId=>({gateId,issuerId:`official:${gateId}`,
 publicKey:keys.publicKey.export({type:"spki",format:"pem"}).toString()}));
const attestation=(gateId:BetaReadinessGateId,overrides:Record<string,unknown>={})=>{const evidence={
 gateId,state:"passed" as const,checkpoint,observedAt:"2026-08-07T11:00:00.000Z",
 validUntil:"2026-08-08T11:00:00.000Z",reference:`official:${gateId}`};
 const issuerId=`official:${gateId}`;const canonical=canonicalizeResearchContract(
  betaReadinessAttestationMaterial(issuerId,evidence));if(!canonical.ok)throw 0;
 return {contractVersion:BETA_READINESS_ATTESTATION_VERSION,issuerId,evidence,
  signature:sign(null,Buffer.from(canonical.value),keys.privateKey).toString("base64url"),...overrides}};
describe("Phase 7D trusted collection runtime",()=>{
 it("accepts only signed evidence from the issuer bound to each gate",async()=>{const load=vi.fn(async({gateId})=>attestation(gateId));
  const result=await new TrustedBetaReadinessRuntime({load},issuers,100).evaluate(input);
  expect(result.result.ok&&result.result.value.state).toBe("beta_ready");expect(load).toHaveBeenCalledTimes(9)});
 it.each(["signature","issuer","checkpoint"] as const)("rejects invalid %s without a report",async kind=>{
  const load=async({gateId}:{gateId:BetaReadinessGateId})=>{const value=attestation(gateId);
   if(gateId!=="source_integrity")return value;if(kind==="signature")return {...value,signature:"a".repeat(64)};
   if(kind==="issuer")return {...value,issuerId:"official:other"};
   return {...value,evidence:{...value.evidence,checkpoint:"a".repeat(40)}}};
  const result=await new TrustedBetaReadinessRuntime({load},issuers,100).evaluate(input);
  expect(result.manifest).toBeNull();expect(result.result.ok).toBe(false)});
 it("turns source timeout and unavailability into explicit blocking evidence",async()=>{const load=async({gateId}:{gateId:BetaReadinessGateId})=>{
  if(gateId==="production_build")return new Promise(()=>{});if(gateId==="ci_verification")throw new Error("offline");
  return attestation(gateId)};const result=await new TrustedBetaReadinessRuntime({load},issuers,5).evaluate(input);
  expect(result.result.ok&&result.result.value.state).toBe("blocked");expect(result.manifest?.evidence)
   .toContainEqual(expect.objectContaining({gateId:"production_build",state:"unavailable",
    reference:"trusted-runtime:timeout:production_build"}));expect(result.manifest?.evidence)
   .toContainEqual(expect.objectContaining({gateId:"ci_verification",state:"unavailable"}))});
 it("single-flights equal evaluation and rejects a contradictory concurrent one",async()=>{let release!:()=>void;
  const wait=new Promise<void>(resolve=>{release=resolve});const load=vi.fn(async({gateId})=>{await wait;return attestation(gateId)});
  const runtime=new TrustedBetaReadinessRuntime({load},issuers,500);const first=runtime.evaluate(input);
  const equal=runtime.evaluate(input);expect(equal).toBe(first);const conflict=await runtime.evaluate({...input,
   evaluatedAt:"2026-08-07T12:00:01.000Z"});expect(conflict.result).toEqual({ok:false,
    reason:"beta_readiness_concurrent_evaluation_conflict"});release();await expect(first).resolves.toMatchObject({result:{ok:true}})});
});
