import "server-only";
import type {BetaReadinessGateId} from "./types";
import type {TrustedAttestationSource} from "./trustedRuntime.server";
export class HttpTrustedAttestationSource implements TrustedAttestationSource{
 constructor(private readonly baseUrl:string,private readonly token:string){
  const url=new URL(baseUrl);if(url.protocol!=="https:")throw new Error("trusted_attestation_url_invalid")}
 async load(input:Readonly<{gateId:BetaReadinessGateId;checkpoint:string;evaluatedAt:string;releaseCandidateId?:string}>){
  const url=new URL(input.gateId,this.baseUrl.endsWith("/")?this.baseUrl:`${this.baseUrl}/`);
  url.searchParams.set("checkpoint",input.checkpoint);url.searchParams.set("evaluatedAt",input.evaluatedAt);
  if(input.releaseCandidateId)url.searchParams.set("releaseCandidateId",input.releaseCandidateId);
  const response=await fetch(url,{headers:{authorization:`Bearer ${this.token}`},cache:"no-store"});
  if(!response.ok)throw new Error("trusted_attestation_source_unavailable");return response.json()}
}
