import "server-only";
import type {ScopedSqlPool} from "../dataset-catalog/postgresRepository.server";
import type {BetaReadinessOpsRepository} from "./opsRepository.server";
import type {BetaReadinessOpsEntry} from "./opsTypes";
const hash=(v:unknown,n:number)=>typeof v==="string"&&new RegExp(`^[a-f0-9]{${n}}$`,"u").test(v);
const id=(v:unknown)=>typeof v==="string"&&/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(v);
const time=(v:unknown)=>{const d=v instanceof Date?v:new Date(String(v));return Number.isFinite(d.valueOf())?d.toISOString():null};
export class PostgresBetaReadinessOpsRepository implements BetaReadinessOpsRepository{
 constructor(private readonly pool:ScopedSqlPool){}
 async read(){const client=await this.pool.connect();try{const result=await client.query(
  `select report_hash,checkpoint,evaluated_at,state,profile_id,profile_version
   from public.investing_research_beta_readiness_reports
   order by evaluated_at desc,report_hash desc limit 20`);return result.rows.map((row):BetaReadinessOpsEntry=>{
   const evaluatedAt=time(row.evaluated_at);if(!hash(row.report_hash,64)
    ||!(typeof row.checkpoint==="string"&&/^[a-f0-9]{40,64}$/u.test(row.checkpoint))
    ||!evaluatedAt||!['beta_ready','blocked'].includes(String(row.state))
    ||!id(row.profile_id)||!id(row.profile_version))throw new Error("beta_readiness_ops_integrity_failed");
   return {reportHash:String(row.report_hash),checkpoint:String(row.checkpoint),
    state:row.state as BetaReadinessOpsEntry["state"],evaluatedAt,
    profileId:String(row.profile_id),profileVersion:String(row.profile_version)}})}finally{client.release?.()}}
}
