import "server-only";
import type {InvestingResearchScientificScope} from "../contracts";
import type {ResearchOpsRepository} from "./repository.server";
import {RESEARCH_OPS_SNAPSHOT_VERSION,type ResearchOpsSnapshot} from "./types";
type Access=Readonly<{authenticatedUserId:string;scope:InvestingResearchScientificScope}>;
export interface ResearchOpsAuthorizationPort{authorize():Promise<
 Readonly<{ok:true;value:Access}>|Readonly<{ok:false;reason:string}>>}
export class ResearchOpsService{
 constructor(private readonly repository:ResearchOpsRepository,
  private readonly authorization:ResearchOpsAuthorizationPort,
  private readonly now:()=>string){}
 async load():Promise<Readonly<{ok:true;value:ResearchOpsSnapshot}>|
  Readonly<{ok:false;reason:string}>>{
  const access=await this.authorization.authorize();if("reason"in access)
   return {ok:false,reason:access.reason};
  try{const result=await this.repository.read(access.value.scope,
   access.value.authenticatedUserId);
   return {ok:true as const,value:{contractVersion:RESEARCH_OPS_SNAPSHOT_VERSION,
    scope:{...access.value.scope},generatedAt:this.now(),counts:result.counts.map(v=>({...v})),
    recent:result.recent.map(v=>({...v})),notices:["read_only",
     "no_scientific_decision_writes","no_ui_promotion"] as const}};
  }catch{return {ok:false as const,reason:"research_ops_read_failed"}}
 }
}
