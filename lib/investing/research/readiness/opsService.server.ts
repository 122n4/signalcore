import "server-only";
import type {BetaReadinessOpsRepository} from "./opsRepository.server";
import {BETA_READINESS_OPS_SNAPSHOT_VERSION,type BetaReadinessOpsSnapshot} from "./opsTypes";
export interface BetaReadinessOpsAuthorizationPort{authorize():Promise<Readonly<{ok:true}>|
 Readonly<{ok:false;reason:string}>>}
export class BetaReadinessOpsService{
 constructor(private readonly repository:BetaReadinessOpsRepository,
  private readonly authorization:BetaReadinessOpsAuthorizationPort,private readonly now:()=>string){}
 async load():Promise<Readonly<{ok:true;value:BetaReadinessOpsSnapshot}>|Readonly<{ok:false;reason:string}>>{
  const access=await this.authorization.authorize();if("reason" in access)return access;
  try{const history=(await this.repository.read()).map(row=>({...row}));return {ok:true,value:{
   contractVersion:BETA_READINESS_OPS_SNAPSHOT_VERSION,generatedAt:this.now(),
   current:history[0]??null,history,notices:["read_only","no_canonical_payload",
    "no_beta_activation"]}}}catch{return {ok:false,reason:"beta_readiness_ops_read_failed"}}
 }
}
