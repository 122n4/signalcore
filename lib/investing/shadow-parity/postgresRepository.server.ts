import "server-only";import {canonicalizeResearchContract} from "@/lib/investing/research/contracts";
import type {ScopedSqlPool} from "@/lib/investing/research/dataset-catalog/postgresRepository.server";import type {ShadowParityRepository} from "./repository.server";
import type {ShadowParityCycle,ShadowParityProgress} from "./types";
import {validShadowParityCycle} from "./comparator.server";
const same=(a:unknown,b:unknown)=>{const x=canonicalizeResearchContract(a),y=canonicalizeResearchContract(b);return x.ok&&y.ok&&x.value===y.value};
const cycle=(row:Record<string,unknown>)=>{const value=row.canonical_payload as ShadowParityCycle;if(!validShadowParityCycle(value))throw new Error("shadow_parity_evidence_invalid");return value};
const consecutive=(history:readonly ShadowParityCycle[])=>{let count=0,previous:number|null=null;for(const item of history){if(item.state!=="passed")break;
 const day=Date.parse(`${item.dayKey}T00:00:00.000Z`);if(previous!==null&&previous-day!==86400000)break;count++;previous=day}return count};
export class PostgresShadowParityRepository implements ShadowParityRepository{constructor(private readonly pool:ScopedSqlPool){}
 async record(value:ShadowParityCycle){const client=await this.pool.connect();try{await client.query("begin");const s=value.scope;
  await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[`${s.tenantId}:${s.ownerId}:${s.portfolioId}:${s.accountId}:${value.dayKey}`]);
  const inserted=await client.query(`insert into public.investing_shadow_parity_cycles(tenant_id,owner_id,portfolio_id,account_id,authenticated_user_id,
   cycle_id,cycle_hash,day_key,observed_at,state,legacy_snapshot_hash,canonical_snapshot_hash,canonical_payload)
   values($1,$2,$3,$4::uuid,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)on conflict(tenant_id,owner_id,portfolio_id,account_id,day_key)do nothing returning canonical_payload`,
   [s.tenantId,s.ownerId,s.portfolioId,s.accountId,s.authenticatedUserId,value.cycleId,value.cycleHash,value.dayKey,value.observedAt,value.state,
    value.legacySnapshotHash,value.canonicalSnapshotHash,JSON.stringify(value)]);let reused=false;if(inserted.rows.length===0){const existing=await client.query(`select canonical_payload
    from public.investing_shadow_parity_cycles where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4::uuid and day_key=$5`,
    [s.tenantId,s.ownerId,s.portfolioId,s.accountId,value.dayKey]);if(existing.rows.length!==1||!same(existing.rows[0].canonical_payload,value))throw new Error("shadow_parity_daily_collision");reused=true}
  await client.query("commit");return {cycle:value,reused}
 }catch(error){try{await client.query("rollback")}catch{}throw error}finally{client.release?.()}}
 async progress(scope:ShadowParityCycle["scope"]):Promise<ShadowParityProgress>{const client=await this.pool.connect();try{const rows=await client.query(`select canonical_payload
   from public.investing_shadow_parity_cycles where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4::uuid
   order by day_key desc,cycle_id desc limit 90`,[scope.tenantId,scope.ownerId,scope.portfolioId,scope.accountId]);const history=rows.rows.map(cycle),count=consecutive(history);
  return {requiredCycles:30,consecutivePassedCycles:count,readyForCutover:count>=30,latest:history[0]??null,history}
 }finally{client.release?.()}}}
