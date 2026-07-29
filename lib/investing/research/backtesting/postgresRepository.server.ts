import "server-only";
import type { ScopedSqlPool } from "../dataset-catalog/postgresRepository.server";
import type { InvestingResearchScientificScope } from "../contracts";
import type { ScientificJobLease,ScientificJobRepository } from "./repository.server";

const values=(scope:InvestingResearchScientificScope)=>
  [scope.tenantId,scope.ownerId,scope.portfolioId,scope.accountId] as const;
const lease=(row:Record<string,unknown>,executionId:string):ScientificJobLease=>({
  scope:{ tenantId:String(row.tenant_id),ownerId:String(row.owner_id),
    portfolioId:String(row.portfolio_id),accountId:String(row.account_id) },
  jobId:String(row.job_id),experimentId:String(row.experiment_id),executionId,
  runId:String(row.run_id),
  attempt:Number(row.attempt),leaseToken:String(row.lease_token),
  leaseOwner:String(row.lease_owner),fencingToken:Number(row.fencing_token),
  stateVersion:Number(row.state_version),expiresAt:new Date(String(row.expires_at)).toISOString(),
});

export class PostgresScientificJobRepository implements ScientificJobRepository {
  constructor(private readonly pool:ScopedSqlPool){}
  private async query(text:string,parameters:readonly unknown[]){
    const client=await this.pool.connect();
    try{return await client.query(text,parameters);}finally{client.release?.();}
  }
  async claim(input:Parameters<ScientificJobRepository["claim"]>[0]){
    const result=await this.query(
      `select * from public.investing_research_job_claim_v1(
        $1,$2,$3,$4,$5,$6,$7,$8)`,
      [...values(input.scope),input.jobId,input.leaseToken,input.leaseOwner,input.leaseSeconds],
    );
    if(result.rows.length!==1)return null;
    const run=await this.query(
      `select execution_id from public.investing_research_experiment_runs
       where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4
         and run_id=$5 and experiment_id=$6 and attempt=$7`,
      [...values(input.scope),result.rows[0].run_id,result.rows[0].experiment_id,
        result.rows[0].attempt],
    );
    if(run.rows.length!==1)throw new Error("backtest_run_reference_missing");
    return lease(result.rows[0],String(run.rows[0].execution_id));
  }
  async start(current:ScientificJobLease){
    const result=await this.query(
      `select * from public.investing_research_job_start_v1(
        $1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [...values(current.scope),current.jobId,current.leaseToken,current.leaseOwner,
        current.fencingToken,current.stateVersion],
    );
    return result.rows.length===1?lease(result.rows[0],current.executionId):null;
  }
  async heartbeat(current:ScientificJobLease,leaseSeconds:number){
    const result=await this.query(
      `select * from public.investing_research_job_heartbeat_v1(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [...values(current.scope),current.jobId,current.leaseToken,current.leaseOwner,
        current.fencingToken,current.stateVersion,leaseSeconds],
    );
    return result.rows.length===1?lease(result.rows[0],current.executionId):null;
  }
  async finalize(current:ScientificJobLease,input:Parameters<ScientificJobRepository["finalize"]>[1]){
    const completed=input.state==="completed";
    const result=await this.query(
      `select * from public.investing_research_job_finalize_v1(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)`,
      [...values(current.scope),current.jobId,current.leaseToken,current.leaseOwner,
        current.fencingToken,current.stateVersion,input.state,
        completed?input.resultHash:null,
        completed?JSON.stringify(input.result):null,
        completed?null:input.reason],
    );
    return result.rows.length===1;
  }
  async scheduleRetry(current:ScientificJobLease,
    input:Parameters<ScientificJobRepository["scheduleRetry"]>[1]){
    const result=await this.query(
      `select * from public.investing_research_job_retry_v1(
        $1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [...values(current.scope),current.jobId,current.fencingToken,
        input.nextRunId,input.nextJobId,input.maximumAttempts],
    );
    if(result.rows.length!==1)return {scheduled:false,attempt:null,jobId:null};
    return {scheduled:Boolean(result.rows[0].scheduled),
      attempt:result.rows[0].next_attempt===null?null:Number(result.rows[0].next_attempt),
      jobId:result.rows[0].next_job_id===null?null:String(result.rows[0].next_job_id)};
  }
}
