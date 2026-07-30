import "server-only";
import type {InvestingResearchScientificScope} from "../contracts";
import {scientificMemoryFamilyId} from "./family";
import type {ScientificMemoryRepository} from "./repository.server";
import {SCIENTIFIC_MEMORY_REPETITION_REQUEST_VERSION,SCIENTIFIC_MEMORY_REQUEST_VERSION,
  type ScientificMemoryProfile} from "./types";
type Access=Readonly<{authenticatedUserId:string;membershipId:string;
 scope:InvestingResearchScientificScope}>;
export interface ScientificMemoryAuthorizationPort{authorize(
 operation:"create"|"get"|"list"|"check"):
 Promise<Readonly<{ok:true;value:Access}>|Readonly<{ok:false;reason:string}>>}
export interface ScientificMemoryProfilePort{load(input:Readonly<{
 scope:InvestingResearchScientificScope;familyKey:string}>):Promise<ScientificMemoryProfile|null>}
const plain=(v:unknown):v is Record<string,unknown>=>{if(typeof v!=="object"||v===null
 ||Array.isArray(v)||Object.getPrototypeOf(v)!==Object.prototype)return false;
 const d=Object.getOwnPropertyDescriptors(v);return Reflect.ownKeys(v).every(k=>
 typeof k==="string"&&d[k]?.enumerable&&!d[k]?.get&&!d[k]?.set)};
const id=(v:unknown):v is string=>typeof v==="string"
 &&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u.test(v);
const time=(v:unknown):v is string=>typeof v==="string"
 &&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;

export class ScientificMemoryService{
 constructor(private readonly repository:ScientificMemoryRepository,
  private readonly authorization:ScientificMemoryAuthorizationPort,
  private readonly profiles:ScientificMemoryProfilePort,
  private readonly emit:(event:Readonly<Record<string,unknown>>)=>Promise<void>){}
 async record(input:unknown){
  const access=await this.authorization.authorize("create");if(!access.ok)return access;
  if(!plain(input)||Reflect.ownKeys(input).length!==4
   ||!["contractVersion","decisionId","recordedAt","recordedBy"].every(k=>Object.hasOwn(input,k))
   ||input.contractVersion!==SCIENTIFIC_MEMORY_REQUEST_VERSION||!id(input.decisionId)
   ||!time(input.recordedAt)||!plain(input.recordedBy)
   ||Reflect.ownKeys(input.recordedBy).length!==2||!Object.hasOwn(input.recordedBy,"id")
   ||!Object.hasOwn(input.recordedBy,"version")||!id(input.recordedBy.id)
   ||!id(input.recordedBy.version))
   return {ok:false as const,reason:"scientific_memory_request_invalid"};
  try{
   const existing=await this.repository.getByDecision(access.value.scope,input.decisionId);
   if(existing)return {ok:true as const,value:{event:existing,reused:true}};
   const decision=await this.repository.getDecision(access.value.scope,input.decisionId);
   if(!decision)return {ok:false as const,reason:"scientific_memory_decision_not_found"};
   if(decision.scope.authenticatedUserId!==access.value.authenticatedUserId
    ||decision.scope.membershipId!==access.value.membershipId
    ||decision.scientificScope.tenantId!==access.value.scope.tenantId
    ||decision.scientificScope.ownerId!==access.value.scope.ownerId
    ||decision.scientificScope.portfolioId!==access.value.scope.portfolioId
    ||decision.scientificScope.accountId!==access.value.scope.accountId)
    return {ok:false as const,reason:"scientific_memory_scope_mismatch"};
   const familyKey=scientificMemoryFamilyId(
    decision.hypothesisId,decision.hypothesisVersion);
   const profile=await this.profiles.load({scope:access.value.scope,familyKey});
   if(!profile)return {ok:false as const,reason:"scientific_memory_profile_unavailable"};
   const stored=await this.repository.recordAtomic(access.value.scope,{
    decision,profile,recordedAt:input.recordedAt,recordedBy:{
     id:input.recordedBy.id,version:input.recordedBy.version}});
   await this.emit({type:stored.reused?"scientific_memory_event_reused":
    "scientific_memory_event_recorded",eventId:stored.event.eventId,
    decisionId:stored.event.decisionId,familyState:stored.event.familyState,
    occurredAt:stored.event.recordedAt});
   return {ok:true as const,value:stored};
  }catch{return {ok:false as const,reason:"scientific_memory_persistence_failed"};}
 }
 async checkRepetition(input:unknown){
  const access=await this.authorization.authorize("check");if(!access.ok)return access;
  if(!plain(input)||Reflect.ownKeys(input).length!==6
   ||!["contractVersion","hypothesisId","hypothesisVersion","candidateId",
    "candidateVersion","experimentId"].every(k=>Object.hasOwn(input,k))
   ||input.contractVersion!==SCIENTIFIC_MEMORY_REPETITION_REQUEST_VERSION
   ||!id(input.hypothesisId)||!id(input.hypothesisVersion)||!id(input.candidateId)
   ||!id(input.candidateVersion)||!id(input.experimentId))
   return {ok:false as const,reason:"scientific_memory_repetition_request_invalid"};
  try{
   const familyId=scientificMemoryFamilyId(input.hypothesisId,input.hypothesisVersion);
   const history=await this.repository.listFamily(access.value.scope,familyId);
   const priorDecisionIds=history.map(event=>event.decisionId);
   if(history.some(event=>event.candidateId===input.candidateId
    &&event.candidateVersion===input.candidateVersion
    &&event.experimentId===input.experimentId))
    return {ok:true as const,value:{allowed:false as const,reason:"exact_repeat" as const,
     familyId,priorDecisionIds}};
   if(history.some(event=>event.familyState==="saturated"))
    return {ok:true as const,value:{allowed:false as const,
     reason:"family_saturated" as const,familyId,priorDecisionIds}};
   return {ok:true as const,value:{allowed:true as const,reason:"allowed" as const,
    familyId,priorDecisionIds}};
  }catch{return {ok:false as const,reason:"scientific_memory_integrity_failed"};}
 }
 async get(value:unknown){const a=await this.authorization.authorize("get");if(!a.ok)return a;
  if(!id(value))return {ok:false as const,reason:"scientific_memory_not_found"};
  try{const event=await this.repository.get(a.value.scope,value);
   return event?{ok:true as const,value:event}:
    {ok:false as const,reason:"scientific_memory_not_found"};}
  catch{return {ok:false as const,reason:"scientific_memory_integrity_failed"};}
 }
 async list(){const a=await this.authorization.authorize("list");if(!a.ok)return a;
  try{return {ok:true as const,value:await this.repository.list(a.value.scope)};}
  catch{return {ok:false as const,reason:"scientific_memory_integrity_failed"};}
 }
}
