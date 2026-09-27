import { createHash } from "node:crypto";

export type CanonicalTextV1 = string & { readonly __canonicalTextV1: unique symbol };
export type CanonicalOpaqueStringV1 = string & { readonly __canonicalOpaqueStringV1: unique symbol };
export type CanonicalTokenV1 = string & { readonly __canonicalTokenV1: unique symbol };
export type CanonicalUuidV1 = string & { readonly __canonicalUuidV1: unique symbol };
export type CanonicalDecimalV1 = string & { readonly __canonicalDecimalV1: unique symbol };
export type CanonicalIntegerV1 = string & { readonly __canonicalIntegerV1: unique symbol };
export type CanonicalDateV1 = string & { readonly __canonicalDateV1: unique symbol };
export type CanonicalTimestampUtcMicrosV1 = string & { readonly __canonicalTimestampUtcMicrosV1: unique symbol };
export type CanonicalSha256HexV1 = string & { readonly __canonicalSha256HexV1: unique symbol };

export type HashDomainV1 =
  | "SYNTRAKE:RESEARCH_DRAFT:V1"
  | "SYNTRAKE:HYPOTHESIS:V1"
  | "SYNTRAKE:RESEARCH_SPEC:V1"
  | "SYNTRAKE:RESEARCH_IR:V1"
  | "SYNTRAKE:EXPERIMENT:V1"
  | "SYNTRAKE:EXPERIMENT_PARAMETERS:V1"
  | "SYNTRAKE:DATASET_SERIES:V1"
  | "SYNTRAKE:DATASET_SNAPSHOT:V1"
  | "SYNTRAKE:ACCOUNT_RESEARCH_CONTEXT:V1"
  | "SYNTRAKE:RUN_INPUT:V1"
  | "SYNTRAKE:RESULT:V1"
  | "SYNTRAKE:EVIDENCE_OBJECT:V1"
  | "SYNTRAKE:VALIDATION_PROTOCOL:V1"
  | "SYNTRAKE:VALIDATION_RUN_INPUT:V1"
  | "SYNTRAKE:VALIDATION_CHILD_RESULT:V1"
  | "SYNTRAKE:VALIDATION_RESULT:V1"
  | "SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1"
  | "SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1"
  | "SYNTRAKE:RESEARCH_TEMPLATE:V1"
  | "SYNTRAKE:METRIC_REQUEST_SET:V1"
  | "SYNTRAKE:EXECUTION_CONFIG:V1"
  | "SYNTRAKE:CANONICAL_TEST:V1";

export type HashRefV1 = Readonly<{
  hashAlgorithm: "SHA-256";
  hashDomain: HashDomainV1;
  hashVersion: "SYNTRAKE_SHA256_V1";
  hashHex: CanonicalSha256HexV1;
}>;

type DomainAdmissionState =
  | "DECLARED_BUT_HASHING_DISABLED"
  | "OWNER_PAYLOAD_EXACT"
  | "PREIMAGE_ENVELOPE_EXACT"
  | "CONTENT_PREIMAGE_EXACT"
  | "TEST_ONLY";

const hashDomainAdmission = {
  "SYNTRAKE:RESEARCH_DRAFT:V1": "OWNER_PAYLOAD_EXACT",
  "SYNTRAKE:HYPOTHESIS:V1": "OWNER_PAYLOAD_EXACT",
  "SYNTRAKE:RESEARCH_SPEC:V1": "OWNER_PAYLOAD_EXACT",
  "SYNTRAKE:RESEARCH_IR:V1": "OWNER_PAYLOAD_EXACT",
  "SYNTRAKE:EXPERIMENT:V1": "OWNER_PAYLOAD_EXACT",
  "SYNTRAKE:EXPERIMENT_PARAMETERS:V1": "OWNER_PAYLOAD_EXACT",
  "SYNTRAKE:DATASET_SERIES:V1": "OWNER_PAYLOAD_EXACT",
  "SYNTRAKE:DATASET_SNAPSHOT:V1": "OWNER_PAYLOAD_EXACT",
  "SYNTRAKE:ACCOUNT_RESEARCH_CONTEXT:V1": "DECLARED_BUT_HASHING_DISABLED",
  "SYNTRAKE:RUN_INPUT:V1": "PREIMAGE_ENVELOPE_EXACT",
  "SYNTRAKE:RESULT:V1": "OWNER_PAYLOAD_EXACT",
  "SYNTRAKE:EVIDENCE_OBJECT:V1": "CONTENT_PREIMAGE_EXACT",
  "SYNTRAKE:VALIDATION_PROTOCOL:V1": "OWNER_PAYLOAD_EXACT",
  "SYNTRAKE:VALIDATION_RUN_INPUT:V1": "OWNER_PAYLOAD_EXACT",
  "SYNTRAKE:VALIDATION_CHILD_RESULT:V1": "OWNER_PAYLOAD_EXACT",
  "SYNTRAKE:VALIDATION_RESULT:V1": "OWNER_PAYLOAD_EXACT",
  "SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1": "OWNER_PAYLOAD_EXACT",
  "SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1": "OWNER_PAYLOAD_EXACT",
  "SYNTRAKE:RESEARCH_TEMPLATE:V1": "DECLARED_BUT_HASHING_DISABLED",
  "SYNTRAKE:METRIC_REQUEST_SET:V1": "OWNER_PAYLOAD_EXACT",
  "SYNTRAKE:EXECUTION_CONFIG:V1": "OWNER_PAYLOAD_EXACT",
  "SYNTRAKE:CANONICAL_TEST:V1": "TEST_ONLY",
} as const satisfies Record<HashDomainV1, DomainAdmissionState>;

const mutableBehaviorAliases = new Set(["latest", "current", "stable", "production", "default", "active", "rolling"]);
const runTypesV1 = new Set(["HISTORICAL_BACKTEST", "SIMULATION", "SENSITIVITY", "REPRODUCIBILITY_CHECK"]);
const researchEnvironmentsV1 = new Set(["HISTORICAL_BACKTEST", "SIMULATION"]);
const researchSourceContextsV1 = new Set(["PURE_RESEARCH", "TEST_PORTFOLIO", "USER_PORTFOLIO"]);

export type CanonicalJsonValue = null | boolean | string | readonly CanonicalJsonValue[] | { readonly [key: string]: CanonicalJsonValue };
export type RunTypeV1 = "HISTORICAL_BACKTEST" | "SIMULATION" | "SENSITIVITY" | "REPRODUCIBILITY_CHECK";
export type ResearchEnvironmentV1 = "HISTORICAL_BACKTEST" | "SIMULATION";
export type ResearchSourceContextV1 = "PURE_RESEARCH" | "TEST_PORTFOLIO" | "USER_PORTFOLIO";
export type MaterialPolicyRefV1 = Readonly<{ policyId: string; policyVersion: string }>;
export type RunInputHashPayloadV1 = Readonly<{ schemaVersion: "RUN_INPUT_HASH_PAYLOAD_V1"; runType: RunTypeV1; researchEnvironment: ResearchEnvironmentV1; researchSourceContext: ResearchSourceContextV1; researchSpec: HashRefV1; researchIr: HashRefV1; experiment: HashRefV1; datasetSnapshot: HashRefV1; accountResearchContext?: HashRefV1; engineId: string; engineVersion: string; metricRegistryVersion: string; metricRequestSet: HashRefV1; executionConfig: HashRefV1; deterministicSeed?: string; materialPolicies: readonly MaterialPolicyRefV1[] }>;
export type EvidenceContentDescriptorV1 = Readonly<{ schemaVersion: "EVIDENCE_CONTENT_DESCRIPTOR_V1"; kind: string; artifactSchemaVersion: string; format: string; contentByteLength: string }>;

export function canonicalTextV1(value: string, bounds?: { minBytes?: number; maxBytes?: number }): CanonicalTextV1 { assertString(value,"CanonicalTextV1"); assertValidUnicodeScalars(value); const normalized=value.normalize("NFC"); assertValidUnicodeScalars(normalized); assertByteBounds(normalized,bounds,"CanonicalTextV1"); return normalized as CanonicalTextV1; }
export function canonicalOpaqueStringV1(value:string,bounds?:{minBytes?:number;maxBytes?:number}):CanonicalOpaqueStringV1 { assertString(value,"CanonicalOpaqueStringV1"); assertValidUnicodeScalars(value); assertByteBounds(value,bounds,"CanonicalOpaqueStringV1"); return value as CanonicalOpaqueStringV1; }
export function canonicalTokenV1(value:string,allowed:ReadonlySet<string>):CanonicalTokenV1 { assertString(value,"CanonicalTokenV1"); if(!allowed.has(value)) throw new Error("CanonicalTokenV1 outside closed vocabulary"); return value as CanonicalTokenV1; }
export function immutableBehaviorTokenV1(value:string):CanonicalTokenV1 { const token=canonicalRunInputAsciiIdentifierV1(value,"CanonicalTokenV1"); if(mutableBehaviorAliases.has(value.toLowerCase())) throw new Error("BEHAVIOR_VERSION_NOT_IMMUTABLE"); return token; }
export function canonicalUuidV1(value:string):CanonicalUuidV1 { assertString(value,"CanonicalUuidV1"); if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(value)) throw new Error("invalid CanonicalUuidV1"); return value as CanonicalUuidV1; }
export function canonicalDecimalV1(value:string,bounds?:{allowNegative?:boolean;min?:string;max?:string;maxIntegerDigits?:number;maxScale?:number}):CanonicalDecimalV1 { assertString(value,"CanonicalDecimalV1"); if(!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u.test(value)) throw new Error("invalid CanonicalDecimalV1"); if(/^-0(?:\.0+)?$/u.test(value)) throw new Error("invalid CanonicalDecimalV1 -0"); const negative=value.startsWith("-"); if(negative&&bounds?.allowNegative===false) throw new Error("CanonicalDecimalV1 negative not allowed"); const unsigned=negative?value.slice(1):value; const [whole="",fraction=""]=unsigned.split("."); const trimmedFraction=fraction.replace(/0+$/u,""); const canonical=`${negative?"-":""}${trimmedFraction===""?whole:`${whole}.${trimmedFraction}`}`; const [,canonicalFraction=""]=canonical.replace(/^-/u,"").split("."); if(bounds?.maxIntegerDigits!==undefined&&whole.length>bounds.maxIntegerDigits) throw new Error("CanonicalDecimalV1 integer digits out of bounds"); if(bounds?.maxScale!==undefined&&canonicalFraction.length>bounds.maxScale) throw new Error("CanonicalDecimalV1 scale out of bounds"); if(bounds?.min!==undefined&&compareCanonicalDecimal(canonical,canonicalDecimalV1(bounds.min))<0) throw new Error("CanonicalDecimalV1 below minimum"); if(bounds?.max!==undefined&&compareCanonicalDecimal(canonical,canonicalDecimalV1(bounds.max))>0) throw new Error("CanonicalDecimalV1 above maximum"); return canonical as CanonicalDecimalV1; }
export function canonicalIntegerV1(value:string,bounds?:{min?:string;max?:string;allowNegative?:boolean}):CanonicalIntegerV1 { assertString(value,"CanonicalIntegerV1"); if(!/^-?(?:0|[1-9][0-9]*)$/u.test(value)) throw new Error("invalid CanonicalIntegerV1"); if(value==="-0") throw new Error("invalid CanonicalIntegerV1 -0"); if(value.startsWith("-")&&bounds?.allowNegative===false) throw new Error("CanonicalIntegerV1 negative not allowed"); if(bounds?.min!==undefined&&compareCanonicalInteger(value,canonicalIntegerV1(bounds.min))<0) throw new Error("CanonicalIntegerV1 below minimum"); if(bounds?.max!==undefined&&compareCanonicalInteger(value,canonicalIntegerV1(bounds.max))>0) throw new Error("CanonicalIntegerV1 above maximum"); return value as CanonicalIntegerV1; }
export function canonicalDateV1(value:string):CanonicalDateV1 { assertString(value,"CanonicalDateV1"); const match=/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/u.exec(value); if(!match) throw new Error("invalid CanonicalDateV1"); assertGregorianDate(Number(match[1]),Number(match[2]),Number(match[3]),"CanonicalDateV1"); return value as CanonicalDateV1; }
export function canonicalTimestampUtcMicrosV1(value:string):CanonicalTimestampUtcMicrosV1 { assertString(value,"CanonicalTimestampUtcMicrosV1"); const match=/^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})\.([0-9]{6})Z$/u.exec(value); if(!match) throw new Error("invalid CanonicalTimestampUtcMicrosV1"); assertGregorianDate(Number(match[1]),Number(match[2]),Number(match[3]),"CanonicalTimestampUtcMicrosV1"); if(Number(match[4])>23||Number(match[5])>59||Number(match[6])>59) throw new Error("invalid CanonicalTimestampUtcMicrosV1"); return value as CanonicalTimestampUtcMicrosV1; }
export function canonicalSha256HexV1(value:string):CanonicalSha256HexV1 { assertString(value,"CanonicalSha256HexV1"); if(!/^[0-9A-F]{64}$/u.test(value)) throw new Error("invalid CanonicalSha256HexV1"); return value as CanonicalSha256HexV1; }
export function canonicalHashDomainV1(value:string):HashDomainV1 { assertString(value,"CanonicalHashDomainV1"); if(!/^[A-Z0-9:_-]+$/u.test(value)) throw new Error("invalid CanonicalHashDomainV1"); if(!Object.hasOwn(hashDomainAdmission,value)) throw new Error("unknown hash domain"); return value as HashDomainV1; }
export function hashDomainStateV1(domain:string):DomainAdmissionState { return hashDomainAdmission[canonicalHashDomainV1(domain)]; }
export function hashRefV1(input:{hashAlgorithm:string;hashDomain:string;hashVersion:string;hashHex:string}):HashRefV1 { assertClosedPlainObject(input,new Set(["hashAlgorithm","hashDomain","hashVersion","hashHex"])); if(input.hashAlgorithm!=="SHA-256") throw new Error("invalid hash algorithm"); if(input.hashVersion!=="SYNTRAKE_SHA256_V1") throw new Error("invalid hash version"); return {hashAlgorithm:"SHA-256",hashDomain:canonicalHashDomainV1(input.hashDomain),hashVersion:"SYNTRAKE_SHA256_V1",hashHex:canonicalSha256HexV1(input.hashHex)}; }
export function assertHashRefDomainV1(ref:HashRefV1,expectedDomain:HashDomainV1){ if(ref.hashDomain!==expectedDomain) throw new Error("wrong-domain HashRefV1"); }
export function assertHashDomainAdmittedForHashingV1(domain:HashDomainV1){ const state=hashDomainAdmission[domain]; if(state==="DECLARED_BUT_HASHING_DISABLED") throw new Error("hash domain declared but hashing disabled"); return state; }
function syntrakeCanonicalJsonV1(value:CanonicalJsonValue):string { return emitCanonicalJson(value,[]); }
function syntrakeCanonicalJsonBytesV1(value:CanonicalJsonValue):Buffer { return Buffer.from(syntrakeCanonicalJsonV1(value),"utf8"); }
export function i5ResearchInternalCanonicalJsonBytesV1(value:CanonicalJsonValue):Buffer { return syntrakeCanonicalJsonBytesV1(value); }
export function sha256HexV1(bytes:Uint8Array):CanonicalSha256HexV1 { return createHash("sha256").update(bytes).digest("hex").toUpperCase() as CanonicalSha256HexV1; }

export function canonicalRunInputHashPayloadV1(input:RunInputHashPayloadV1):CanonicalJsonValue { assertClosedPlainObject(input,new Set(["schemaVersion","runType","researchEnvironment","researchSourceContext","researchSpec","researchIr","experiment","datasetSnapshot","accountResearchContext","engineId","engineVersion","metricRegistryVersion","metricRequestSet","executionConfig","deterministicSeed","materialPolicies"]),new Set(["accountResearchContext","deterministicSeed"])); if(input.schemaVersion!=="RUN_INPUT_HASH_PAYLOAD_V1") throw new Error("RUN_INPUT_SCHEMA_VERSION_INVALID"); const runType=canonicalTokenV1(input.runType,runTypesV1) as RunTypeV1; const researchEnvironment=canonicalTokenV1(input.researchEnvironment,researchEnvironmentsV1) as ResearchEnvironmentV1; const researchSourceContext=canonicalTokenV1(input.researchSourceContext,researchSourceContextsV1) as ResearchSourceContextV1; const researchSpec=hashRefV1(input.researchSpec); assertHashRefDomainV1(researchSpec,"SYNTRAKE:RESEARCH_SPEC:V1"); const researchIr=hashRefV1(input.researchIr); assertHashRefDomainV1(researchIr,"SYNTRAKE:RESEARCH_IR:V1"); const experiment=hashRefV1(input.experiment); assertHashRefDomainV1(experiment,"SYNTRAKE:EXPERIMENT:V1"); const datasetSnapshot=hashRefV1(input.datasetSnapshot); assertHashRefDomainV1(datasetSnapshot,"SYNTRAKE:DATASET_SNAPSHOT:V1"); const metricRequestSet=hashRefV1(input.metricRequestSet); assertHashRefDomainV1(metricRequestSet,"SYNTRAKE:METRIC_REQUEST_SET:V1"); const executionConfig=hashRefV1(input.executionConfig); assertHashRefDomainV1(executionConfig,"SYNTRAKE:EXECUTION_CONFIG:V1"); const accountResearchContext=input.accountResearchContext===undefined?undefined:hashRefV1(input.accountResearchContext); if(accountResearchContext!==undefined) assertHashRefDomainV1(accountResearchContext,"SYNTRAKE:ACCOUNT_RESEARCH_CONTEXT:V1"); const engineId=canonicalRunInputAsciiIdentifierV1(input.engineId,"engineId"); const engineVersion=canonicalRunInputAsciiIdentifierV1(input.engineVersion,"engineVersion"); const metricRegistryVersion=canonicalRunInputAsciiIdentifierV1(input.metricRegistryVersion,"metricRegistryVersion"); const deterministicSeed=input.deterministicSeed===undefined?undefined:canonicalRunInputAsciiIdentifierV1(input.deterministicSeed,"deterministicSeed"); const materialPolicies=canonicalMaterialPoliciesV1(input.materialPolicies); const payload:{[key:string]:CanonicalJsonValue}={schemaVersion:"RUN_INPUT_HASH_PAYLOAD_V1",runType,researchEnvironment,researchSourceContext,researchSpec,researchIr,experiment,datasetSnapshot,engineId,engineVersion,metricRegistryVersion,metricRequestSet,executionConfig,materialPolicies}; if(accountResearchContext!==undefined) payload.accountResearchContext=accountResearchContext; if(deterministicSeed!==undefined) payload.deterministicSeed=deterministicSeed; return payload; }
export function canonicalRunInputBytesV1(input:RunInputHashPayloadV1):Buffer { return syntrakeCanonicalJsonBytesV1(canonicalRunInputHashPayloadV1(input)); }

function canonicalMaterialPoliciesV1(input:readonly MaterialPolicyRefV1[]):readonly CanonicalJsonValue[]{ if(!Array.isArray(input)) throw new Error("materialPolicies must be an array"); const policies=input.map((policy)=>{ assertClosedPlainObject(policy,new Set(["policyId","policyVersion"])); return {policyId:canonicalRunInputAsciiIdentifierV1(policy.policyId,"material policy id"),policyVersion:canonicalRunInputAsciiIdentifierV1(policy.policyVersion,"material policy version")}; }); policies.sort((a,b)=>{const left=a as {policyId:string;policyVersion:string};const right=b as {policyId:string;policyVersion:string};return left.policyId.localeCompare(right.policyId)||left.policyVersion.localeCompare(right.policyVersion);}); for(let i=1;i<policies.length;i+=1){if(JSON.stringify(policies[i-1])===JSON.stringify(policies[i])) throw new Error("duplicate material policy");} return policies; }
function canonicalRunInputAsciiIdentifierV1(value:string,label:string):CanonicalTokenV1 { assertString(value,label); if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value)) throw new Error(`invalid ${label}`); return value as CanonicalTokenV1; }
function emitCanonicalJson(value:CanonicalJsonValue,path:readonly string[]):string { if(value===null)return"null"; if(typeof value==="boolean")return value?"true":"false"; if(typeof value==="string"){assertValidUnicodeScalars(value);return JSON.stringify(value);} if(Array.isArray(value))return `[${value.map((entry,index)=>emitCanonicalJson(entry,[...path,String(index)])).join(",")}]`; if(typeof value==="object"){const record=value as {[key:string]:CanonicalJsonValue};const keys=Object.keys(record).sort(compareUtf8Bytes);return `{${keys.map((key)=>{assertValidUnicodeScalars(key);const entry=record[key];if(entry===undefined)throw new Error(`undefined is not canonical JSON at ${[...path,key].join(".")}`);return `${JSON.stringify(key)}:${emitCanonicalJson(entry,[...path,key])}`;}).join(",")}}`;} throw new Error(`unsupported canonical JSON value at ${path.join(".")}`); }
function compareUtf8Bytes(left:string,right:string):number { return Buffer.from(left,"utf8").compare(Buffer.from(right,"utf8")); }
function assertString(value:unknown,label:string):asserts value is string { if(typeof value!=="string")throw new Error(`${label} must be a string`); }
function assertValidUnicodeScalars(value:string){ for(let index=0;index<value.length;index+=1){const code=value.charCodeAt(index);if(code>=0xd800&&code<=0xdbff){const next=value.charCodeAt(index+1);if(!(next>=0xdc00&&next<=0xdfff))throw new Error("unpaired UTF-16 high surrogate");index+=1;}else if(code>=0xdc00&&code<=0xdfff)throw new Error("unpaired UTF-16 low surrogate");} }
function assertByteBounds(value:string,bounds:{minBytes?:number;maxBytes?:number}|undefined,label:string){const byteLength=Buffer.byteLength(value,"utf8");if(bounds?.minBytes!==undefined&&byteLength<bounds.minBytes)throw new Error(`${label} below minimum byte length`);if(bounds?.maxBytes!==undefined&&byteLength>bounds.maxBytes)throw new Error(`${label} above maximum byte length`);}
function assertGregorianDate(year:number,month:number,day:number,label:string){if(month<1||month>12)throw new Error(`invalid ${label} month`);const leap=year%4===0&&(year%100!==0||year%400===0);const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];if(day<1||day>(days[month-1]??0))throw new Error(`invalid ${label} day`);}
function compareCanonicalInteger(left:string,right:string):number{const leftNegative=left.startsWith("-");const rightNegative=right.startsWith("-");if(leftNegative!==rightNegative)return leftNegative?-1:1;const leftAbs=leftNegative?left.slice(1):left;const rightAbs=rightNegative?right.slice(1):right;const magnitude=leftAbs.length!==rightAbs.length?leftAbs.length-rightAbs.length:leftAbs.localeCompare(rightAbs);return leftNegative?-magnitude:magnitude;}
function compareCanonicalDecimal(left:string,right:string):number{const [leftWhole,leftFraction=""]=left.split(".");const [rightWhole,rightFraction=""]=right.split(".");const scale=Math.max(leftFraction.length,rightFraction.length);const leftScaled=`${leftWhole}${leftFraction.padEnd(scale,"0")}`;const rightScaled=`${rightWhole}${rightFraction.padEnd(scale,"0")}`;return compareCanonicalInteger(leftScaled,rightScaled);}
function assertClosedPlainObject(value:unknown,allowedKeys:ReadonlySet<string>,optionalKeys:ReadonlySet<string>=new Set()){if(value===null||typeof value!=="object"||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)throw new Error("expected closed plain object");for(const key of Object.keys(value)){if(!allowedKeys.has(key))throw new Error(`undeclared field ${key}`);if((value as Record<string,unknown>)[key]===undefined)throw new Error(`undefined is not canonical data at ${key}`);}for(const key of allowedKeys){if(!optionalKeys.has(key)&&!Object.hasOwn(value,key))throw new Error(`missing field ${key}`);}}
