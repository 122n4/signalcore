import "server-only";
import {createHash} from "node:crypto";
import {canonicalizeResearchContract} from "@/lib/investing/research/contracts";
import {SHADOW_PARITY_CYCLE_VERSION,SHADOW_PARITY_DIMENSIONS,SHADOW_PARITY_POLICY_VERSION,
 SHADOW_PARITY_SNAPSHOT_VERSION,type ShadowParityCycle,type ShadowParityDimension,type ShadowParityDimensionResult,
 type ShadowParityPending,type ShadowParityPosition,type ShadowParitySnapshot} from "./types";
const DAY=/^\d{4}-\d{2}-\d{2}$/u,ID=/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,191}$/u;
const finite=(v:unknown):v is number=>typeof v==="number"&&Number.isFinite(v)&&v>=0;
const time=(v:unknown):v is string=>typeof v==="string"&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const scopeValid=(v:ShadowParitySnapshot["scope"])=>Object.values(v).every(x=>typeof x==="string"&&ID.test(x));
const orderedPositions=(v:readonly ShadowParityPosition[])=>[...v].sort((a,b)=>a.symbol.localeCompare(b.symbol));
const orderedPending=(v:readonly ShadowParityPending[])=>[...v].sort((a,b)=>`${a.symbol}:${a.side}`.localeCompare(`${b.symbol}:${b.side}`));
const positionsValid=(v:readonly ShadowParityPosition[])=>Array.isArray(v)&&v.every(x=>/^[A-Z0-9._-]{1,24}$/u.test(x.symbol)
 &&finite(x.quantity)&&(x.valueEur===null||finite(x.valueEur)))&&new Set(v.map(x=>x.symbol)).size===v.length;
const pendingValid=(v:readonly ShadowParityPending[])=>Array.isArray(v)&&v.every(x=>/^[A-Z0-9._-]{1,24}$/u.test(x.symbol)
 &&["buy","sell"].includes(x.side)&&finite(x.quantity))&&new Set(v.map(x=>`${x.symbol}:${x.side}`)).size===v.length;
export function validShadowParitySnapshot(v:ShadowParitySnapshot){return v.contractVersion===SHADOW_PARITY_SNAPSHOT_VERSION
 &&["legacy","canonical"].includes(v.source)&&ID.test(v.sourceVersion)&&scopeValid(v.scope)&&time(v.observedAt)
 &&(v.cashEur===null||finite(v.cashEur))&&positionsValid(v.positions)&&pendingValid(v.pending)
 &&(v.valuationEur===null||finite(v.valuationEur));}
const hash=(domain:string,v:unknown)=>{const c=canonicalizeResearchContract(v);return c.ok?
 createHash("sha256").update(`${domain}\n${c.value}`).digest("hex"):null};
export function validShadowParityCycle(v:ShadowParityCycle){try{if(v.contractVersion!==SHADOW_PARITY_CYCLE_VERSION||v.policyVersion!==SHADOW_PARITY_POLICY_VERSION
 ||!v.cycleId.startsWith("irsp_v1_")||!/^[a-f0-9]{64}$/u.test(v.cycleHash)||v.cycleId!==`irsp_v1_${v.cycleHash}`||!scopeValid(v.scope)
 ||!DAY.test(v.dayKey)||!time(v.observedAt)||!/^[a-f0-9]{64}$/u.test(v.legacySnapshotHash)||!/^[a-f0-9]{64}$/u.test(v.canonicalSnapshotHash)
 ||!["passed","blocked","unavailable"].includes(v.state)||!Array.isArray(v.dimensions)||v.dimensions.length!==SHADOW_PARITY_DIMENSIONS.length)return false;
 const dimensionsValid=v.dimensions.every((d,index)=>d.dimension===SHADOW_PARITY_DIMENSIONS[index]&&["passed","blocked","unavailable"].includes(d.state)
  &&[null,"source_unavailable","identity_mismatch","value_mismatch"].includes(d.reason)&&Number.isInteger(d.differenceCount)&&d.differenceCount>=0);
 if(!dimensionsValid)return false;const expectedState=v.dimensions.some(d=>d.state==="blocked")?"blocked":v.dimensions.some(d=>d.state==="unavailable")?"unavailable":"passed";
 const material={contractVersion:v.contractVersion,policyVersion:v.policyVersion,scope:v.scope,dayKey:v.dayKey,observedAt:v.observedAt,
  legacySnapshotHash:v.legacySnapshotHash,canonicalSnapshotHash:v.canonicalSnapshotHash,state:v.state,dimensions:v.dimensions};
 return v.state===expectedState&&hash("investing-shadow-parity-cycle/v1",material)===v.cycleHash}catch{return false}}
const near=(a:number,b:number,tolerance=.00000001)=>Math.abs(a-b)<=tolerance;
const result=(dimension:ShadowParityDimension,state:ShadowParityDimensionResult["state"],reason:ShadowParityDimensionResult["reason"],differenceCount:number):ShadowParityDimensionResult=>({dimension,state,reason,differenceCount});
const comparePositions=(a:readonly ShadowParityPosition[],b:readonly ShadowParityPosition[])=>{const left=orderedPositions(a),right=orderedPositions(b);
 let differences=Math.abs(left.length-right.length);for(const item of left){const match=right.find(x=>x.symbol===item.symbol);if(!match||!near(item.quantity,match.quantity))differences++}return differences};
const comparePending=(a:readonly ShadowParityPending[],b:readonly ShadowParityPending[])=>{const left=orderedPending(a),right=orderedPending(b);
 let differences=Math.abs(left.length-right.length);for(const item of left){const match=right.find(x=>x.symbol===item.symbol&&x.side===item.side);if(!match||!near(item.quantity,match.quantity))differences++}return differences};
export function compareShadowParity(input:Readonly<{dayKey:string;observedAt:string;legacy:ShadowParitySnapshot;canonical:ShadowParitySnapshot}>):
 Readonly<{ok:true;value:ShadowParityCycle}|{ok:false;reason:"shadow_parity_input_invalid"}>{try{const {legacy,canonical}=input;
  if(!DAY.test(input.dayKey)||!time(input.observedAt)||!validShadowParitySnapshot(legacy)||!validShadowParitySnapshot(canonical)
   ||legacy.source!=="legacy"||canonical.source!=="canonical")return {ok:false,reason:"shadow_parity_input_invalid"};
  const identityDifferences=Object.keys(legacy.scope).filter(k=>legacy.scope[k as keyof typeof legacy.scope]!==canonical.scope[k as keyof typeof canonical.scope]).length;
  const cash=legacy.cashEur===null||canonical.cashEur===null?result("cash","unavailable","source_unavailable",0):near(legacy.cashEur,canonical.cashEur)?result("cash","passed",null,0):result("cash","blocked","value_mismatch",1);
  const positionDifferences=comparePositions(legacy.positions,canonical.positions),pendingDifferences=comparePending(legacy.pending,canonical.pending);
  const valuation=legacy.valuationEur===null||canonical.valuationEur===null?result("valuation","unavailable","source_unavailable",0):near(legacy.valuationEur,canonical.valuationEur,.01)?result("valuation","passed",null,0):result("valuation","blocked","value_mismatch",1);
  const dimensions=[identityDifferences?result("identity","blocked","identity_mismatch",identityDifferences):result("identity","passed",null,0),cash,
   positionDifferences?result("positions","blocked","value_mismatch",positionDifferences):result("positions","passed",null,0),
   pendingDifferences?result("pending_state","blocked","value_mismatch",pendingDifferences):result("pending_state","passed",null,0),valuation];
  if(dimensions.map(x=>x.dimension).join()!==SHADOW_PARITY_DIMENSIONS.join())return {ok:false,reason:"shadow_parity_input_invalid"};
  const state:ShadowParityCycle["state"]=dimensions.some(x=>x.state==="blocked")?"blocked":dimensions.some(x=>x.state==="unavailable")?"unavailable":"passed";
  const legacySnapshotHash=hash("investing-shadow-parity-legacy-snapshot/v1",legacy),canonicalSnapshotHash=hash("investing-shadow-parity-canonical-snapshot/v1",canonical);
  if(!legacySnapshotHash||!canonicalSnapshotHash)return {ok:false,reason:"shadow_parity_input_invalid"};const material={contractVersion:SHADOW_PARITY_CYCLE_VERSION,
   policyVersion:SHADOW_PARITY_POLICY_VERSION,scope:structuredClone(canonical.scope),dayKey:input.dayKey,observedAt:input.observedAt,
   legacySnapshotHash,canonicalSnapshotHash,state,dimensions};const cycleHash=hash("investing-shadow-parity-cycle/v1",material);
  if(!cycleHash)return {ok:false,reason:"shadow_parity_input_invalid"};return {ok:true,value:{...material,cycleId:`irsp_v1_${cycleHash}`,cycleHash}}
 }catch{return {ok:false,reason:"shadow_parity_input_invalid"}}}
