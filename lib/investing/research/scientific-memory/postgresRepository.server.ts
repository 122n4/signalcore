import "server-only";
import type {ScopedSqlPool} from "../dataset-catalog/postgresRepository.server";
import {validateScientificDecision,type InvestingResearchScientificScope} from "../contracts";
import {validateScientificMemoryEvent} from "./persistedValidation.server";
import type {ScientificMemoryRepository} from "./repository.server";
import {SCIENTIFIC_MEMORY_INPUT_VERSION} from "./types";
import {scientificMemoryFamilyId} from "./family";
import {recordScientificMemory} from "./engine.server";
const values=(s:InvestingResearchScientificScope)=>
 [s.tenantId,s.ownerId,s.portfolioId,s.accountId] as const;
const checked=(v:unknown)=>{const p=validateScientificMemoryEvent(v);
 if(!p.ok)throw new Error("scientific_memory_integrity_failed");return p.value;};

export class PostgresScientificMemoryRepository implements ScientificMemoryRepository{
 constructor(private readonly pool:ScopedSqlPool){}
 private async query(text:string,params:readonly unknown[]){
  const c=await this.pool.connect();try{return await c.query(text,params);}
  finally{c.release?.();}
 }
 async getDecision(scope:InvestingResearchScientificScope,id:string){
  const r=await this.query(`select canonical_payload from
   public.investing_research_scientific_decisions where tenant_id=$1 and owner_id=$2
   and portfolio_id=$3 and account_id=$4 and decision_id=$5`,[...values(scope),id]);
  if(r.rows.length!==1)return null;const p=validateScientificDecision(r.rows[0].canonical_payload);
  if(!p.ok)throw new Error("scientific_memory_decision_integrity_failed");return p.value;
 }
 async getByDecision(scope:InvestingResearchScientificScope,id:string){
  const r=await this.query(`select canonical_payload from public.investing_research_audit_events
   where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4
   and decision_id=$5`,[...values(scope),id]);
  return r.rows.length===1?checked(r.rows[0].canonical_payload):null;
 }
 async listFamily(scope:InvestingResearchScientificScope,aggregateId:string){
  const r=await this.query(`select canonical_payload from
   public.investing_research_audit_events where tenant_id=$1 and owner_id=$2
   and portfolio_id=$3 and account_id=$4 and aggregate_id=$5
   order by occurred_at,event_id`,[...values(scope),aggregateId]);
  return r.rows.map(row=>checked(row.canonical_payload));
 }
 async recordAtomic(scope:InvestingResearchScientificScope,input:Parameters<
  ScientificMemoryRepository["recordAtomic"]>[1]){
  const client=await this.pool.connect();
  try{
   await client.query("begin",[]);
   const familyId=scientificMemoryFamilyId(
    input.decision.hypothesisId,input.decision.hypothesisVersion);
   await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))",
    [`${scope.tenantId}\u001f${scope.ownerId}\u001f${scope.portfolioId}\u001f${
      scope.accountId}\u001f${familyId}`]);
   const duplicate=await client.query(`select canonical_payload from
    public.investing_research_audit_events where tenant_id=$1 and owner_id=$2
    and portfolio_id=$3 and account_id=$4 and decision_id=$5`,
    [...values(scope),input.decision.decisionId]);
   if(duplicate.rows.length===1){
    const event=checked(duplicate.rows[0].canonical_payload);
    await client.query("commit",[]);return {event,reused:true};
   }
   const history=await client.query(`select canonical_payload from
    public.investing_research_audit_events where tenant_id=$1 and owner_id=$2
    and portfolio_id=$3 and account_id=$4 and aggregate_id=$5
    order by occurred_at,event_id`,[...values(scope),familyId]);
   const prior=history.rows.map(row=>checked(row.canonical_payload));
   const generated=recordScientificMemory({
    contractVersion:SCIENTIFIC_MEMORY_INPUT_VERSION,decision:input.decision,
    profile:input.profile,prior:prior.map(event=>({decisionId:event.decisionId,
     outcome:event.outcome,recordedAt:event.recordedAt})),
    recordedAt:input.recordedAt,recordedBy:input.recordedBy});
   if("reason"in generated)throw new Error(generated.reason);
   const event=generated.value;
   const r=await client.query(`insert into public.investing_research_audit_events(
   tenant_id,owner_id,portfolio_id,account_id,event_id,aggregate_type,aggregate_id,
   event_type,event_version,event_hash,occurred_at,decision_id,report_id,outcome,
   knowledge,family_state,attempt_ordinal,profile_version,canonical_payload)
   values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb)
   on conflict(tenant_id,owner_id,portfolio_id,account_id,decision_id) do nothing
   returning canonical_payload`,[...values(scope),event.eventId,event.aggregateType,
   event.aggregateId,event.eventType,event.contractVersion,event.eventHash,event.recordedAt,
   event.decisionId,event.reportId,event.outcome,event.knowledge,event.familyState,
   event.attemptOrdinal,event.profile.version,JSON.stringify(event)]);
   if(r.rows.length!==1)throw new Error("scientific_memory_identity_collision");
   const stored=checked(r.rows[0].canonical_payload);
   await client.query("commit",[]);return {event:stored,reused:false};
  }catch(error){try{await client.query("rollback",[]);}catch{}throw error;}
  finally{client.release?.();}
 }
 async get(scope:InvestingResearchScientificScope,id:string){
  const r=await this.query(`select canonical_payload from public.investing_research_audit_events
   where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4 and event_id=$5`,
   [...values(scope),id]);return r.rows.length===1?checked(r.rows[0].canonical_payload):null;
 }
 async list(scope:InvestingResearchScientificScope){
  const r=await this.query(`select canonical_payload from public.investing_research_audit_events
   where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4
   order by occurred_at,event_id`,values(scope));return r.rows.map(x=>checked(x.canonical_payload));
 }
}
