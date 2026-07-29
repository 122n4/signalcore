import "server-only";
import type {ScopedSqlClient,ScopedSqlPool} from "../dataset-catalog/postgresRepository.server";
import type {InvestingResearchScientificScope} from "../contracts";
import type {BacktestCatalogRepository,ExperimentRunJobRecord} from "./catalogRepository.server";

const scope=(value:InvestingResearchScientificScope)=>
  [value.tenantId,value.ownerId,value.portfolioId,value.accountId] as const;

export class PostgresBacktestCatalogRepository implements BacktestCatalogRepository{
  constructor(private readonly pool:ScopedSqlPool){}
  private async transaction<T>(work:(client:ScopedSqlClient)=>Promise<T>){
    const client=await this.pool.connect();
    try{await client.query("begin");const result=await work(client);
      await client.query("commit");return result;}
    catch(error){await client.query("rollback");throw error;}
    finally{client.release?.();}
  }
  async createOrReuse(input:Parameters<BacktestCatalogRepository["createOrReuse"]>[0]){
    return this.transaction(async(client):Promise<ExperimentRunJobRecord>=>{
      const s=scope(input.scope);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))",
        [`${s.join("/")}/${input.idempotencyKey}`]);
      const existing=await client.query(
        `select j.*,e.scientific_digest,r.execution_id
         from public.investing_research_jobs j
         join public.investing_research_experiments e using
           (tenant_id,owner_id,portfolio_id,account_id,experiment_id)
         join public.investing_research_experiment_runs r using
           (tenant_id,owner_id,portfolio_id,account_id,run_id,experiment_id)
         where j.tenant_id=$1 and j.owner_id=$2 and j.portfolio_id=$3
           and j.account_id=$4 and j.idempotency_key=$5`,
        [...s,input.idempotencyKey]);
      if(existing.rows.length===1){
        const row=existing.rows[0];
        if(String(row.experiment_id)!==input.experimentId
          ||String(row.execution_id)!==input.executionId){
          throw new Error("backtest_idempotency_mismatch");
        }
        return {scope:input.scope,experimentId:String(row.experiment_id),
          scientificDigest:String(row.scientific_digest),executionId:String(row.execution_id),
          runId:String(row.run_id),jobId:String(row.job_id),attempt:Number(row.attempt),
          state:String(row.state),reused:true};
      }
      const experiment=await client.query(
        `insert into public.investing_research_experiments(
          tenant_id,owner_id,portfolio_id,account_id,experiment_id,scientific_digest,
          identity_version,canonicalization_version,hash_algorithm,candidate_id,
          candidate_version,dataset_version_id,created_at,canonical_material)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         on conflict(tenant_id,owner_id,portfolio_id,account_id,scientific_digest)
         do nothing returning *`,
        [...s,input.experimentId,input.scientificDigest,input.identityVersion,
          input.canonicalizationVersion,input.hashAlgorithm,input.candidateId,
          input.candidateVersion,input.datasetVersionId,input.createdAt,input.canonicalMaterial]);
      if(!experiment.rowCount){
        const same=await client.query(
          `select canonical_material,experiment_id from public.investing_research_experiments
           where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4
             and scientific_digest=$5`,[...s,input.scientificDigest]);
        if(same.rows.length!==1||String(same.rows[0].experiment_id)!==input.experimentId
          ||String(same.rows[0].canonical_material)!==input.canonicalMaterial){
          throw new Error("backtest_experiment_integrity_mismatch");
        }
      }
      await client.query(
        `insert into public.investing_research_experiment_runs(
          tenant_id,owner_id,portfolio_id,account_id,run_id,experiment_id,
          execution_id,attempt,state,created_at,updated_at)
         values($1,$2,$3,$4,$5,$6,$7,1,'defined',$8,$8)`,
        [...s,input.runId,input.experimentId,input.executionId,input.createdAt]);
      await client.query(
        `insert into public.investing_research_jobs(
          tenant_id,owner_id,portfolio_id,account_id,job_id,experiment_id,run_id,
          idempotency_key,state,attempt,created_at,updated_at,not_before)
         values($1,$2,$3,$4,$5,$6,$7,$8,'queued',1,$9,$9,$9)`,
        [...s,input.jobId,input.experimentId,input.runId,input.idempotencyKey,input.createdAt]);
      return {scope:input.scope,experimentId:input.experimentId,
        scientificDigest:input.scientificDigest,executionId:input.executionId,
        runId:input.runId,jobId:input.jobId,attempt:1,state:"queued",reused:false};
    });
  }
  private async select(text:string,values:readonly unknown[]){
    const client=await this.pool.connect();
    try{return await client.query(text,values);}finally{client.release?.();}
  }
  async getExperiment(value:InvestingResearchScientificScope,id:string){
    const result=await this.select(
      `select * from public.investing_research_experiments where tenant_id=$1
       and owner_id=$2 and portfolio_id=$3 and account_id=$4 and experiment_id=$5`,
      [...scope(value),id]);
    return result.rows.length===1?result.rows[0]:null;
  }
  async getRun(value:InvestingResearchScientificScope,id:string){
    const result=await this.select(
      `select * from public.investing_research_experiment_runs where tenant_id=$1
       and owner_id=$2 and portfolio_id=$3 and account_id=$4 and run_id=$5`,
      [...scope(value),id]);
    return result.rows.length===1?result.rows[0]:null;
  }
  async listExperiments(value:InvestingResearchScientificScope){
    const result=await this.select(
      `select * from public.investing_research_experiments where tenant_id=$1
       and owner_id=$2 and portfolio_id=$3 and account_id=$4 order by created_at,experiment_id`,
      scope(value));
    return result.rows;
  }
  async cancel(value:InvestingResearchScientificScope,jobId:string){
    const result=await this.select(
      `select * from public.investing_research_job_cancel_v1($1,$2,$3,$4,$5)`,
      [...scope(value),jobId]);
    return result.rows.length===1;
  }
}
