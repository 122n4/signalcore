import {validateScientificDecision} from "../contracts";
import {SCIENTIFIC_MEMORY_INPUT_VERSION,SCIENTIFIC_MEMORY_PROFILE_VERSION,
  type ScientificMemoryInput,type ScientificMemoryPrior,type ScientificMemoryResult} from "./types";
const plain=(v:unknown):v is Record<string,unknown>=>{if(typeof v!=="object"||v===null
  ||Array.isArray(v)||Object.getPrototypeOf(v)!==Object.prototype)return false;
  const d=Object.getOwnPropertyDescriptors(v);return Reflect.ownKeys(v).every(k=>
    typeof k==="string"&&d[k]?.enumerable&&!d[k]?.get&&!d[k]?.set)};
const exact=(v:Record<string,unknown>,keys:readonly string[])=>Reflect.ownKeys(v).length===keys.length
  &&keys.every(k=>Object.hasOwn(v,k));
const id=(v:unknown):v is string=>typeof v==="string"&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u.test(v);
const time=(v:unknown):v is string=>typeof v==="string"&&Number.isFinite(Date.parse(v))
  &&new Date(v).toISOString()===v;
const integer=(v:unknown):v is number=>typeof v==="number"&&Number.isInteger(v)&&v>0;
export function validateScientificMemoryInput(value:unknown):ScientificMemoryResult<ScientificMemoryInput>{
 try{
  if(!plain(value)||!exact(value,["contractVersion","decision","profile","prior","recordedAt",
    "recordedBy"])||value.contractVersion!==SCIENTIFIC_MEMORY_INPUT_VERSION
    ||!plain(value.profile)||!exact(value.profile,["contractVersion","profileId",
      "profileVersion","maximumAttemptsPerFamily","maximumRejectedPerFamily",
      "maximumInconclusivePerFamily"])
    ||value.profile.contractVersion!==SCIENTIFIC_MEMORY_PROFILE_VERSION
    ||!id(value.profile.profileId)||!id(value.profile.profileVersion)
    ||!integer(value.profile.maximumAttemptsPerFamily)
    ||!integer(value.profile.maximumRejectedPerFamily)
    ||!integer(value.profile.maximumInconclusivePerFamily)
    ||!Array.isArray(value.prior)||!time(value.recordedAt)||!plain(value.recordedBy)
    ||!exact(value.recordedBy,["id","version"])||!id(value.recordedBy.id)
    ||!id(value.recordedBy.version))return {ok:false,reason:"scientific_memory_input_invalid"};
  const decision=validateScientificDecision(value.decision);
  if(!decision.ok)return {ok:false,reason:"scientific_memory_decision_invalid"};
  const prior=value.prior.map(item=>plain(item)&&exact(item,["decisionId","outcome","recordedAt"])
    &&id(item.decisionId)&&["validated","rejected","inconclusive","blocked","invalid"]
      .includes(String(item.outcome))&&time(item.recordedAt)?{decisionId:item.decisionId,
        outcome:item.outcome as ScientificMemoryPrior["outcome"],recordedAt:item.recordedAt}:null);
  if(prior.some(v=>v===null)||new Set(prior.map(v=>v?.decisionId)).size!==prior.length
    ||prior.some(v=>v?.decisionId===decision.value.decisionId))
    return {ok:false,reason:"scientific_memory_prior_invalid"};
  return {ok:true,value:{contractVersion:SCIENTIFIC_MEMORY_INPUT_VERSION,
    decision:decision.value,profile:{contractVersion:SCIENTIFIC_MEMORY_PROFILE_VERSION,
      profileId:value.profile.profileId,profileVersion:value.profile.profileVersion,
      maximumAttemptsPerFamily:value.profile.maximumAttemptsPerFamily,
      maximumRejectedPerFamily:value.profile.maximumRejectedPerFamily,
      maximumInconclusivePerFamily:value.profile.maximumInconclusivePerFamily},
    prior:prior as ScientificMemoryPrior[],recordedAt:value.recordedAt,
    recordedBy:{id:value.recordedBy.id,version:value.recordedBy.version}}};
 }catch{return {ok:false,reason:"scientific_memory_input_invalid"}}
}
