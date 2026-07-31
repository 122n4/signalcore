import "server-only";
import {evaluateBetaReadiness} from "./evaluator.server";
import {BETA_READINESS_GATE_IDS,BETA_READINESS_MANIFEST_VERSION,
 type BetaReadinessEvidence,type BetaReadinessGateId,type BetaReadinessManifest,
 type BetaReadinessResult} from "./types";
export interface BetaReadinessEvidencePort{readonly gateId:BetaReadinessGateId;
 collect(input:Readonly<{checkpoint:string;evaluatedAt:string;releaseCandidateId?:string}>):Promise<BetaReadinessEvidence>}
export type BetaReadinessCollectionInput=Readonly<{checkpoint:string;evaluatedAt:string;
 profile:Readonly<{id:string;version:string}>;releaseCandidateId?:string}>;
export async function collectBetaReadiness(input:BetaReadinessCollectionInput,
 ports:readonly BetaReadinessEvidencePort[]):Promise<Readonly<{manifest:BetaReadinessManifest;
 result:BetaReadinessResult}>|Readonly<{manifest:null;result:{ok:false;
 reason:"beta_readiness_collection_invalid"}}>>{
 try{const ids=ports.map(p=>p.gateId);if(ports.length!==BETA_READINESS_GATE_IDS.length
  ||new Set(ids).size!==BETA_READINESS_GATE_IDS.length
  ||BETA_READINESS_GATE_IDS.some(id=>!ids.includes(id)))return {manifest:null,result:{ok:false,
   reason:"beta_readiness_collection_invalid"}};
  const evidence=await Promise.all(BETA_READINESS_GATE_IDS.map(id=>ports.find(p=>p.gateId===id)!
   .collect({checkpoint:input.checkpoint,evaluatedAt:input.evaluatedAt,releaseCandidateId:input.releaseCandidateId})));
  const manifest={contractVersion:BETA_READINESS_MANIFEST_VERSION,checkpoint:input.checkpoint,
   evaluatedAt:input.evaluatedAt,profile:structuredClone(input.profile),evidence} as const;
  return {manifest,result:evaluateBetaReadiness(manifest)};
 }catch{return {manifest:null,result:{ok:false,reason:"beta_readiness_collection_invalid"}}}
}
