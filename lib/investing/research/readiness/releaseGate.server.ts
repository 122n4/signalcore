import "server-only";import type {BetaReadinessCollectionInput} from "./collector.server";import type {ReleaseCandidateMaterial,
 EffectiveReadiness,ReleaseCandidate,ReleaseResult} from "./releaseTypes";import type {TrustedBetaReadinessRuntime} from "./trustedRuntime.server";
import type {BetaReadinessManifest,BetaReadinessReport} from "./types";
import {createReleaseCandidate} from "./releaseIdentity.server";
export type ReleaseGateRequest=Readonly<{collection:BetaReadinessCollectionInput;candidate:ReleaseCandidateMaterial;
 assessmentEvaluatedAt:string}>;export type ReleaseGateValue=Readonly<{candidate:ReleaseCandidate;assessment:EffectiveReadiness;reused:boolean}>;
export interface ReleaseGateRepository{assess(input:Readonly<{request:ReleaseGateRequest;manifest:BetaReadinessManifest;
 report:BetaReadinessReport}>):Promise<ReleaseResult<ReleaseGateValue>>}
export interface ReleaseGateAuthorization{authorize():Promise<ReleaseResult<Readonly<{authenticatedUserId:string;membershipId:string;requestId:string}>>>}
export class ReleaseGateService{constructor(private readonly authorization:ReleaseGateAuthorization,
 private readonly runtime:TrustedBetaReadinessRuntime,private readonly repository:ReleaseGateRepository){}async assess(request:ReleaseGateRequest):Promise<ReleaseResult<ReleaseGateValue>>{
 const authority=await this.authorization.authorize();if("reason" in authority)return authority;const candidate=createReleaseCandidate(request.candidate);
 if(!candidate.ok||request.collection.checkpoint!==request.candidate.commitSha)return {ok:false as const,reason:"release_gate_binding_mismatch"};
 try{const collected=await this.runtime.evaluate({...request.collection,releaseCandidateId:candidate.value.candidateId});
  if(!collected.manifest||!collected.result.ok)return {ok:false as const,reason:"release_gate_collection_failed"};
  const prefix=`release-candidate:${candidate.value.candidateId}:`;if(collected.manifest.evidence.some(v=>v.state!=="unavailable"&&!v.reference.startsWith(prefix)))
   return {ok:false as const,reason:"release_gate_evidence_binding_invalid"};
  return await this.repository.assess({request,manifest:collected.manifest,report:collected.result.value})}catch{return {ok:false as const,
  reason:"release_gate_assessment_failed"}}}}
