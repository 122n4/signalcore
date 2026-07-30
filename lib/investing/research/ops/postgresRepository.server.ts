import "server-only";
import type {ScopedSqlPool} from "../dataset-catalog/postgresRepository.server";
import type {InvestingResearchScientificScope} from "../contracts";
import type {ResearchOpsRepository} from "./repository.server";
import type {ResearchOpsCount,ResearchOpsRecent} from "./types";
const scope=(s:InvestingResearchScientificScope)=>[s.tenantId,s.ownerId,s.portfolioId,s.accountId];
const SOURCES=Object.freeze([
 ["datasets","investing_research_dataset_versions","dataset_version_id","quality_state","null::timestamptz","null"],
 ["acquisition_jobs","investing_research_acquisition_jobs","acquisition_job_id","state","updated_at","reason_code"],
 ["scientific_jobs","investing_research_jobs","job_id","state","updated_at","null"],
 ["experiments","investing_research_experiment_runs","run_id","state","created_at","failure_reason"],
 ["validation_reports","investing_research_validation_reports","report_id","'published'","evaluated_at","null"],
 ["scientific_decisions","investing_research_scientific_decisions","decision_id","outcome","created_at","null"],
] as const);
const safe=(v:unknown)=>typeof v==="string"&&/^[a-z0-9_]+$/u.test(v);
const failureState=(v:string)=>/(failed|invalid|unavailable|cancelled|revoked|blocked)/u.test(v);
const count=(v:unknown)=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<0)
 throw new Error("research_ops_projection_invalid");return n};
export class PostgresResearchOpsRepository implements ResearchOpsRepository{
 constructor(private readonly pool:ScopedSqlPool){}
 async read(s:InvestingResearchScientificScope,authenticatedUserId:string){
  const client=await this.pool.connect();const counts:ResearchOpsCount[]=[];
  const recent:ResearchOpsRecent[]=[];
  try{
   await client.query("begin read only");
   await client.query("select set_config('request.jwt.claims',$1,true)",
    [JSON.stringify({sub:authenticatedUserId})]);
   await client.query("set local role authenticated");
   for(const [category,table,id,state,at,reason] of SOURCES){
    if(![table,id].every(safe)||(reason!=="null"&&!safe(reason)))
     throw new Error("research_ops_projection_invalid");
    const grouped=await client.query(`select ${state} as state,count(*)::int as count
     from public.${table} where tenant_id=$1 and owner_id=$2 and portfolio_id=$3
     and account_id=$4 group by state order by state`,scope(s));
    for(const row of grouped.rows)counts.push({category,state:String(row.state),
     count:count(row.count)});
    const rows=await client.query(`select ${id} as id,${state} as state,${at} as occurred_at,
     ${reason} as reason_code from public.${table} where tenant_id=$1 and owner_id=$2
     and portfolio_id=$3 and account_id=$4 order by occurred_at desc,id limit 20`,scope(s));
    for(const row of rows.rows)recent.push({category,id:String(row.id),state:String(row.state),
     occurredAt:row.occurred_at instanceof Date?row.occurred_at.toISOString():
      typeof row.occurred_at==="string"?new Date(row.occurred_at).toISOString():null,
     reasonCode:typeof row.reason_code==="string"?row.reason_code:null});
   }
   const promotionCounts=await client.query(`select case when r.request_id is null
     then p.state else 'promotion_revoked' end as state,count(*)::bigint as count
     from public.investing_research_promotion_requests p left join
     public.investing_research_promotion_revocations r on r.tenant_id=p.tenant_id
     and r.owner_id=p.owner_id and r.portfolio_id=p.portfolio_id
     and r.account_id=p.account_id and r.request_id=p.request_id
     where p.tenant_id=$1 and p.owner_id=$2 and p.portfolio_id=$3 and p.account_id=$4
     group by case when r.request_id is null then p.state else 'promotion_revoked' end
     order by state`,scope(s));
   for(const row of promotionCounts.rows)counts.push({category:"promotions",
    state:String(row.state),count:count(row.count)});
   const promotionRecent=await client.query(`select p.request_id as id,
     case when r.request_id is null then p.state else 'promotion_revoked' end as state,
     coalesce(r.revoked_at,p.created_at) as occurred_at,r.reason_code
     from public.investing_research_promotion_requests p left join
     public.investing_research_promotion_revocations r on r.tenant_id=p.tenant_id
     and r.owner_id=p.owner_id and r.portfolio_id=p.portfolio_id
     and r.account_id=p.account_id and r.request_id=p.request_id
     where p.tenant_id=$1 and p.owner_id=$2 and p.portfolio_id=$3 and p.account_id=$4
     order by coalesce(r.revoked_at,p.created_at) desc,p.request_id limit 20`,scope(s));
   for(const row of promotionRecent.rows)recent.push({category:"promotions",
    id:String(row.id),state:String(row.state),occurredAt:row.occurred_at instanceof Date?
     row.occurred_at.toISOString():typeof row.occurred_at==="string"?
      new Date(row.occurred_at).toISOString():null,
    reasonCode:typeof row.reason_code==="string"?row.reason_code:null});
   const failures=recent.filter(r=>failureState(r.state));
   const failureCount=count(counts.filter(v=>v.category!=="failures"&&failureState(v.state))
    .reduce((total,v)=>total+v.count,0));
   counts.push({category:"failures",state:"observed",count:failureCount});
   await client.query("commit");return {counts,recent:[...recent,...failures.map(r=>({...r,
    category:"failures" as const}))]};
  }catch(error){try{await client.query("rollback")}catch{}throw error}
  finally{client.release?.()}
 }
}
