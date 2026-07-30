import "server-only";
import type {ScopedSqlPool} from "../dataset-catalog/postgresRepository.server";
import {canonicalizeResearchContract,validateScientificDecision,
  type InvestingResearchScientificScope} from "../contracts";
import type {PortfolioRiskRepository} from "./repository.server";
import type {PortfolioRiskAssessment} from "./types";
import {validatePortfolioRiskAssessment} from "./runtimeValidation";

const scopeValues=(scope:InvestingResearchScientificScope)=>
  [scope.tenantId,scope.ownerId,scope.portfolioId,scope.accountId] as const;
const assessment=(value:unknown):PortfolioRiskAssessment=>{
  const parsed=validatePortfolioRiskAssessment(value);
  if(!parsed.ok)throw new Error("portfolio_risk_integrity_failed");
  return parsed.value;
};
export class PostgresPortfolioRiskRepository implements PortfolioRiskRepository{
  constructor(private readonly pool:ScopedSqlPool){}
  private async query(text:string,values:readonly unknown[]){
    const client=await this.pool.connect();
    try{return await client.query(text,values);}finally{client.release?.();}
  }
  async getDecision(scope:InvestingResearchScientificScope,id:string){
    const result=await this.query(
      `select canonical_payload from public.investing_research_scientific_decisions
       where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4
         and decision_id=$5`,[...scopeValues(scope),id]);
    if(result.rows.length!==1)return null;
    const parsed=validateScientificDecision(result.rows[0].canonical_payload);
    if(!parsed.ok)throw new Error("portfolio_risk_decision_integrity_failed");
    return parsed.value;
  }
  async persist(scope:InvestingResearchScientificScope,value:PortfolioRiskAssessment){
    const client=await this.pool.connect();
    try{
      await client.query("begin",[]);
      const result=await client.query(
      `insert into public.investing_research_portfolio_risk_capacity_assessments(
        tenant_id,owner_id,portfolio_id,account_id,assessment_id,assessment_hash,
        outcome,profile_version,evaluated_at,canonical_payload)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
       on conflict(tenant_id,owner_id,portfolio_id,account_id,assessment_hash)
       do nothing returning canonical_payload`,
      [...scopeValues(scope),value.assessmentId,value.assessmentHash,value.outcome,
        value.profile.version,value.evaluatedAt,JSON.stringify(value)]);
      if(result.rows.length===1){
        for(const member of value.members)await client.query(
          `insert into public.investing_research_portfolio_risk_capacity_members(
           tenant_id,owner_id,portfolio_id,account_id,assessment_id,decision_id,
           report_id,experiment_id,run_id,dataset_version_id,candidate_id,
           candidate_version,allocation_weight)
           values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [...scopeValues(scope),value.assessmentId,member.decisionId,member.reportId,
            member.experimentId,member.runId,member.datasetVersionId,member.candidateId,
            member.candidateVersion,member.allocationWeight]);
        await client.query("commit",[]);
        return {assessment:assessment(result.rows[0].canonical_payload),reused:false};
      }
      await client.query("commit",[]);
    }catch(error){try{await client.query("rollback",[]);}catch{}throw error;}
    finally{client.release?.();}
    const existing=await this.get(scope,value.assessmentId);
    const existingCanonical=canonicalizeResearchContract(existing);
    const requestedCanonical=canonicalizeResearchContract(value);
    if(!existing||!existingCanonical.ok||!requestedCanonical.ok
      ||existingCanonical.value!==requestedCanonical.value){
      throw new Error("portfolio_risk_identity_collision");
    }
    return {assessment:existing,reused:true};
  }
  async get(scope:InvestingResearchScientificScope,id:string){
    const result=await this.query(
      `select canonical_payload from
       public.investing_research_portfolio_risk_capacity_assessments
       where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4
         and assessment_id=$5`,[...scopeValues(scope),id]);
    if(result.rows.length!==1)return null;
    const parsed=assessment(result.rows[0].canonical_payload);
    const members=await this.query(
      `select decision_id,report_id,experiment_id,run_id,dataset_version_id,
        candidate_id,candidate_version,allocation_weight
       from public.investing_research_portfolio_risk_capacity_members
       where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4
         and assessment_id=$5 order by decision_id`,[...scopeValues(scope),id]);
    const relational=members.rows.map(row=>({
      decisionId:String(row.decision_id),reportId:String(row.report_id),
      experimentId:String(row.experiment_id),runId:String(row.run_id),
      datasetVersionId:String(row.dataset_version_id),candidateId:String(row.candidate_id),
      candidateVersion:String(row.candidate_version),
      allocationWeight:Number(row.allocation_weight)}));
    const canonicalMembers=parsed.members.map(item=>({decisionId:item.decisionId,
      reportId:item.reportId,experimentId:item.experimentId,runId:item.runId,
      datasetVersionId:item.datasetVersionId,candidateId:item.candidateId,
      candidateVersion:item.candidateVersion,allocationWeight:item.allocationWeight}))
      .sort((a,b)=>a.decisionId.localeCompare(b.decisionId));
    if(JSON.stringify(relational)!==JSON.stringify(canonicalMembers)){
      throw new Error("portfolio_risk_member_integrity_failed");
    }
    return parsed;
  }
  async list(scope:InvestingResearchScientificScope){
    const result=await this.query(
      `select assessment_id from
       public.investing_research_portfolio_risk_capacity_assessments
       where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4
       order by created_at`,scopeValues(scope));
    const values=[] as PortfolioRiskAssessment[];
    for(const row of result.rows){
      const value=await this.get(scope,String(row.assessment_id));
      if(!value)throw new Error("portfolio_risk_integrity_failed");
      values.push(value);
    }
    return values;
  }
}
