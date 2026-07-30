import "server-only";
import {canonicalizeResearchContract} from "../contracts";
import {hashCanonicalResearchMaterial} from "../reproducibility/hashing.server";
import {ARTIFACT_IDENTITY_DOMAIN} from "../reproducibility/versions";
import {SCIENTIFIC_MEMORY_EVENT_VERSION,type ScientificMemoryEvent,
  type ScientificMemoryResult} from "./types";
import {scientificMemoryFamilyId} from "./family";

const plain=(v:unknown):v is Record<string,unknown>=>{
  if(typeof v!=="object"||v===null||Array.isArray(v)
    ||Object.getPrototypeOf(v)!==Object.prototype)return false;
  const d=Object.getOwnPropertyDescriptors(v);
  return Reflect.ownKeys(v).every(k=>typeof k==="string"&&d[k]?.enumerable
    &&!d[k]?.get&&!d[k]?.set);
};
const exact=(v:Record<string,unknown>,keys:readonly string[])=>
  Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const id=(v:unknown):v is string=>typeof v==="string"
  &&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u.test(v);
const hash=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{64}$/u.test(v);
const time=(v:unknown):v is string=>typeof v==="string"
  &&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const ref=(v:unknown)=>plain(v)&&exact(v,["id","version"])&&id(v.id)&&id(v.version);
const scope=(v:unknown,scientific=false)=>plain(v)
  &&exact(v,scientific?["tenantId","ownerId","portfolioId","accountId"]:
    ["contractVersion","authenticatedUserId","membershipId","tenantId","ownerId",
      "portfolioId","accountId"])
  &&(!scientific&&v.contractVersion!=="investing-research-scope/v1"?false:true)
  &&Object.entries(v).every(([key,value])=>key==="contractVersion"||id(value));
const ids=(v:unknown)=>Array.isArray(v)&&v.every(id)&&new Set(v).size===v.length;

export function validateScientificMemoryEvent(value:unknown):
ScientificMemoryResult<ScientificMemoryEvent>{
 try{
  const keys=["contractVersion","eventId","eventHash","eventType","aggregateType",
    "aggregateId","scope","scientificScope","decisionId","reportId","hypothesisId",
    "hypothesisVersion","candidateId","candidateVersion","experimentId","runId",
    "outcome","knowledge","attemptOrdinal","familyState","repetitionPolicy",
    "priorDecisionIds","evidenceIds","reasonCodes","profile","recordedAt","recordedBy"];
  if(!plain(value)||!exact(value,keys)
    ||value.contractVersion!==SCIENTIFIC_MEMORY_EVENT_VERSION
    ||!hash(value.eventHash)||value.eventId!==`irmem_v1_${value.eventHash}`
    ||value.eventType!=="scientific_result_recorded"
    ||value.aggregateType!=="hypothesis_family"||typeof value.aggregateId!=="string"
    ||!scope(value.scope)||!scope(value.scientificScope,true)
    ||!["decisionId","reportId","hypothesisId","hypothesisVersion","candidateId",
      "candidateVersion","experimentId","runId"].every(k=>id(value[k]))
    ||value.aggregateId!==scientificMemoryFamilyId(
      String(value.hypothesisId),String(value.hypothesisVersion))
    ||!["validated","rejected","inconclusive","blocked","invalid"].includes(String(value.outcome))
    ||!["positive","negative","inconclusive","blocked","invalid"].includes(String(value.knowledge))
    ||(value.outcome==="validated"&&value.knowledge!=="positive")
    ||(value.outcome==="rejected"&&value.knowledge!=="negative")
    ||(!["validated","rejected"].includes(String(value.outcome))
      &&value.knowledge!==value.outcome)
    ||!Number.isInteger(value.attemptOrdinal)||Number(value.attemptOrdinal)<1
    ||!["active","saturated"].includes(String(value.familyState))
    ||value.repetitionPolicy!=="avoid_exact_repeat"
    ||!ids(value.priorDecisionIds)||!ids(value.evidenceIds)||!ids(value.reasonCodes)
    ||(value.priorDecisionIds as unknown[]).includes(value.decisionId)
    ||value.attemptOrdinal!==(value.priorDecisionIds as unknown[]).length+1
    ||!ref(value.profile)||!time(value.recordedAt)||!ref(value.recordedBy))
    return {ok:false,reason:"scientific_memory_integrity_failed"};
  const rebuilt=JSON.parse(JSON.stringify(value)) as ScientificMemoryEvent;
  const material={...rebuilt} as Record<string,unknown>;
  delete material.contractVersion;delete material.eventId;delete material.eventHash;
  const calculated=hashCanonicalResearchMaterial(ARTIFACT_IDENTITY_DOMAIN,material);
  const canonical=canonicalizeResearchContract(rebuilt);
  if(!calculated.ok||calculated.value.digest!==rebuilt.eventHash||!canonical.ok)
    return {ok:false,reason:"scientific_memory_integrity_failed"};
  return {ok:true,value:rebuilt};
 }catch{return {ok:false,reason:"scientific_memory_integrity_failed"};}
}
