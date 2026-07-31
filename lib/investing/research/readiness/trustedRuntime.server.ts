import "server-only";
import {verify} from "node:crypto";
import {canonicalizeResearchContract} from "../contracts";
import {collectBetaReadiness,type BetaReadinessCollectionInput,
 type BetaReadinessEvidencePort} from "./collector.server";
import {BETA_READINESS_GATE_IDS,type BetaReadinessEvidence,
 type BetaReadinessGateId} from "./types";
export const BETA_READINESS_ATTESTATION_VERSION="investing-beta-readiness-attestation/v1" as const;
export type BetaReadinessAttestation=Readonly<{contractVersion:typeof BETA_READINESS_ATTESTATION_VERSION;
 issuerId:string;evidence:BetaReadinessEvidence;signature:string}>;
export interface TrustedAttestationSource{load(input:Readonly<{gateId:BetaReadinessGateId;
 checkpoint:string;evaluatedAt:string}>):Promise<unknown>}
export type TrustedIssuer=Readonly<{gateId:BetaReadinessGateId;issuerId:string;publicKey:string}>;
const id=(v:unknown)=>typeof v==="string"&&/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(v);
const signature=(v:unknown)=>typeof v==="string"&&/^[A-Za-z0-9_-]{32,1024}$/u.test(v);
const plain=(v:unknown):v is Record<string,unknown>=>typeof v==="object"&&v!==null
 &&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).every(k=>
  typeof k==="string"&&Object.getOwnPropertyDescriptor(v,k)?.enumerable===true
  &&!Object.getOwnPropertyDescriptor(v,k)?.get&&!Object.getOwnPropertyDescriptor(v,k)?.set);
const exact=(v:Record<string,unknown>,keys:readonly string[])=>Reflect.ownKeys(v).length===keys.length
 &&keys.every(k=>Object.hasOwn(v,k));
export function betaReadinessAttestationMaterial(issuerId:string,evidence:BetaReadinessEvidence){return {
 contractVersion:BETA_READINESS_ATTESTATION_VERSION,issuerId,evidence} as const}
export function verifyBetaReadinessAttestation(value:unknown,issuer:TrustedIssuer,
 expected:Readonly<{checkpoint:string;gateId:BetaReadinessGateId}>):BetaReadinessEvidence|null{
 try{if(!plain(value)||!exact(value,["contractVersion","issuerId","evidence","signature"])
  ||value.contractVersion!==BETA_READINESS_ATTESTATION_VERSION||value.issuerId!==issuer.issuerId
  ||issuer.gateId!==expected.gateId||!id(value.issuerId)||!signature(value.signature)
  ||!plain(value.evidence)||value.evidence.gateId!==expected.gateId
  ||value.evidence.checkpoint!==expected.checkpoint)return null;
  const material=betaReadinessAttestationMaterial(value.issuerId,value.evidence as BetaReadinessEvidence);
  const canonical=canonicalizeResearchContract(material);if(!canonical.ok)return null;
  if(!verify(null,Buffer.from(canonical.value,"utf8"),issuer.publicKey,
   Buffer.from(String(value.signature),"base64url")))return null;
  return structuredClone(value.evidence) as BetaReadinessEvidence
 }catch{return null}
}
const unavailable=(gateId:BetaReadinessGateId,input:Readonly<{checkpoint:string;evaluatedAt:string}>,
 reason:"timeout"|"source_unavailable"):BetaReadinessEvidence=>({gateId,state:"unavailable",
 checkpoint:input.checkpoint,observedAt:input.evaluatedAt,validUntil:input.evaluatedAt,
 reference:`trusted-runtime:${reason}:${gateId}`});
export class TrustedBetaReadinessRuntime{
 private readonly active=new Map<string,Readonly<{fingerprint:string;promise:ReturnType<typeof collectBetaReadiness>}>>();
 constructor(private readonly source:TrustedAttestationSource,
  private readonly issuers:readonly TrustedIssuer[],private readonly timeoutMs:number){
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1)throw new Error("beta_readiness_timeout_invalid")}
 private ports():readonly BetaReadinessEvidencePort[]{return BETA_READINESS_GATE_IDS.map(gateId=>({gateId,
  collect:async input=>{const issuer=this.issuers.find(v=>v.gateId===gateId);if(!issuer)
   throw new Error("beta_readiness_trusted_issuer_missing");let timer:ReturnType<typeof setTimeout>|undefined;
   try{const loaded=await Promise.race([this.source.load({...input,gateId}),new Promise<never>((_,reject)=>{
    timer=setTimeout(()=>reject(new Error("timeout")),this.timeoutMs)})]);
    const evidence=verifyBetaReadinessAttestation(loaded,issuer,{gateId,checkpoint:input.checkpoint});
    if(!evidence)throw new Error("beta_readiness_attestation_invalid");return evidence
   }catch(error){if(error instanceof Error&&error.message==="beta_readiness_attestation_invalid")throw error;
    return unavailable(gateId,input,error instanceof Error&&error.message==="timeout"?"timeout":"source_unavailable")
   }finally{if(timer)clearTimeout(timer)}}}))}
 evaluate(input:BetaReadinessCollectionInput){const key=input.checkpoint;
  const fingerprint=JSON.stringify(input);const existing=this.active.get(key);
  if(existing){if(existing.fingerprint!==fingerprint)return Promise.resolve({manifest:null,result:{ok:false as const,
   reason:"beta_readiness_concurrent_evaluation_conflict" as const}});return existing.promise}
  const promise=collectBetaReadiness(input,this.ports());this.active.set(key,{fingerprint,promise});
  void promise.finally(()=>{if(this.active.get(key)?.promise===promise)this.active.delete(key)});return promise}
}
