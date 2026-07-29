import "server-only";
import type {ScopedSqlPool} from "../dataset-catalog/postgresRepository.server";
import {
  validateScientificDecision,
  validateValidationReport,
  type InvestingResearchScientificScope,
  type ScientificDecision,
  type ValidationReport,
} from "../contracts";
import type {
  PersistedScientificValidation,
  ScientificValidationRepository,
} from "./repository.server";

const values=(scope:InvestingResearchScientificScope)=>
  [scope.tenantId,scope.ownerId,scope.portfolioId,scope.accountId] as const;

export class PostgresScientificValidationRepository
implements ScientificValidationRepository{
  constructor(private readonly pool:ScopedSqlPool){}
  private async query(text:string,parameters:readonly unknown[]){
    const client=await this.pool.connect();
    try{return await client.query(text,parameters);}finally{client.release?.();}
  }
  async persist(input:Parameters<ScientificValidationRepository["persist"]>[0]):
  Promise<PersistedScientificValidation>{
    const result=await this.query(
      `select * from public.investing_research_validation_persist_v1(
        $1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10::jsonb)`,
      [...values(input.scope),input.report.reportId,input.reportHash,
        JSON.stringify(input.report),input.decision.decisionId,input.decisionHash,
        JSON.stringify(input.decision)],
    );
    if(result.rows.length!==1)throw new Error("scientific_validation_persistence_failed");
    const report=validateValidationReport(result.rows[0].report_payload);
    const decision=validateScientificDecision(result.rows[0].decision_payload);
    if(!report.ok||!decision.ok)throw new Error("scientific_validation_integrity_failed");
    return {report:report.value,decision:decision.value,reused:Boolean(result.rows[0].reused)};
  }
  async getReport(scope:InvestingResearchScientificScope,id:string){
    const result=await this.query(
      `select canonical_payload from public.investing_research_validation_reports
       where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4
         and report_id=$5`,[...values(scope),id]);
    if(result.rows.length!==1)return null;
    const parsed=validateValidationReport(result.rows[0].canonical_payload);
    if(!parsed.ok)throw new Error("scientific_validation_integrity_failed");
    return parsed.value;
  }
  async getDecision(scope:InvestingResearchScientificScope,id:string){
    const result=await this.query(
      `select canonical_payload from public.investing_research_scientific_decisions
       where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4
         and decision_id=$5`,[...values(scope),id]);
    if(result.rows.length!==1)return null;
    const parsed=validateScientificDecision(result.rows[0].canonical_payload);
    if(!parsed.ok)throw new Error("scientific_validation_integrity_failed");
    return parsed.value;
  }
  private async list<T>(scope:InvestingResearchScientificScope,table:string,
    validate:(value:unknown)=>Readonly<{ok:true;value:T}|{ok:false}>){
    const result=await this.query(
      `select canonical_payload from public.${table}
       where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4
       order by created_at`,values(scope));
    return result.rows.map(row=>{
      const parsed=validate(row.canonical_payload);
      if(!parsed.ok)throw new Error("scientific_validation_integrity_failed");
      return parsed.value;
    });
  }
  listReports(scope:InvestingResearchScientificScope){
    return this.list<ValidationReport>(scope,"investing_research_validation_reports",
      validateValidationReport);
  }
  listDecisions(scope:InvestingResearchScientificScope){
    return this.list<ScientificDecision>(scope,"investing_research_scientific_decisions",
      validateScientificDecision);
  }
}
