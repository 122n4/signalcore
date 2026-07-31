import "server-only";import {compareShadowParity} from "./comparator.server";import type {ShadowParityRepository} from "./repository.server";
import type {ShadowParitySnapshot,ShadowParityProgress,ShadowParityScope} from "./types";
export type ShadowParitySource={load(scope:ShadowParityScope,observedAt:string):Promise<Readonly<{legacy:ShadowParitySnapshot;canonical:ShadowParitySnapshot}>>};
type ShadowParityIdentity=Readonly<{tenantId:string;ownerId:string;portfolioId:string;accountId:string;authenticatedUserId:string}>;
export type ShadowParityAuthorization={authorize():Promise<Readonly<{ok:true;identity:ShadowParityIdentity}|{ok:false;reason:"shadow_parity_not_authorized"}>>};
const scope=(v:ShadowParityIdentity):ShadowParityScope=>({tenantId:v.tenantId,ownerId:v.ownerId,portfolioId:v.portfolioId,
 accountId:v.accountId,authenticatedUserId:v.authenticatedUserId});
export class ShadowParityService{constructor(private readonly authorization:ShadowParityAuthorization,private readonly source:ShadowParitySource,
 private readonly repository:ShadowParityRepository){}async run(input:Readonly<{dayKey:string;observedAt:string}>){const auth=await this.authorization.authorize();if(!auth.ok)return {ok:false as const,reason:"shadow_parity_not_authorized" as const};
  try{const scoped=scope(auth.identity),snapshots=await this.source.load(scoped,input.observedAt),compared=compareShadowParity({...input,...snapshots});
   if(!compared.ok)return {ok:false as const,reason:"shadow_parity_input_invalid" as const};const persisted=await this.repository.record(compared.value),progress=await this.repository.progress(scoped);
   return {ok:true as const,value:{...persisted,progress}}
  }catch{return {ok:false as const,reason:"shadow_parity_execution_failed" as const}}}
 async progress():Promise<Readonly<{ok:true;value:ShadowParityProgress}|{ok:false;reason:string}>>{const auth=await this.authorization.authorize();if(!auth.ok)return {ok:false,reason:"shadow_parity_not_authorized"};
  try{return {ok:true,value:await this.repository.progress(scope(auth.identity))}}catch{return {ok:false,reason:"shadow_parity_progress_failed"}}}}
