import "server-only";
import {canonicalizeResearchContract} from "../contracts";
import type {ScopedSqlPool} from "../dataset-catalog/postgresRepository.server";
import {evaluateBetaReadiness} from "./evaluator.server";
import type {BetaReadinessRepository,PersistedBetaReadiness} from "./repository.server";
const verified=(value:unknown):PersistedBetaReadiness=>{if(typeof value!=="object"||value===null
 ||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)
 throw new Error("beta_readiness_integrity_failed");const v=value as PersistedBetaReadiness;
 const result=evaluateBetaReadiness(v.manifest);const a=canonicalizeResearchContract(v.report);
 const b=result.ok?canonicalizeResearchContract(result.value):null;
 if(!result.ok||!a.ok||!b?.ok||a.value!==b.value)
  throw new Error("beta_readiness_integrity_failed");return structuredClone(v)};
export class PostgresBetaReadinessRepository implements BetaReadinessRepository{
 constructor(private readonly pool:ScopedSqlPool){}
 private async query(text:string,params:readonly unknown[]){const client=await this.pool.connect();
  try{return await client.query(text,params)}finally{client.release?.()}}
 async persist(value:PersistedBetaReadiness){const checked=verified(value);const r=await this.query(
  `insert into public.investing_research_beta_readiness_reports(
   report_hash,checkpoint,evaluated_at,state,profile_id,profile_version,canonical_payload)
   values($1,$2,$3,$4,$5,$6,$7::jsonb) on conflict(report_hash) do nothing
   returning canonical_payload`,[checked.report.reportHash,checked.report.checkpoint,
   checked.report.evaluatedAt,checked.report.state,checked.report.profile.id,
   checked.report.profile.version,JSON.stringify(checked)]);
  if(r.rows.length===1)return {value:verified(r.rows[0].canonical_payload),reused:false};
  const existing=await this.get(checked.report.reportHash);const a=canonicalizeResearchContract(existing);
  const b=canonicalizeResearchContract(checked);if(!existing||!a.ok||!b.ok||a.value!==b.value)
   throw new Error("beta_readiness_identity_collision");return {value:existing,reused:true}}
 async get(hash:string){if(!/^[a-f0-9]{64}$/u.test(hash))return null;const r=await this.query(
  `select canonical_payload from public.investing_research_beta_readiness_reports
   where report_hash=$1`,[hash]);return r.rows.length===1?verified(r.rows[0].canonical_payload):null}
}
