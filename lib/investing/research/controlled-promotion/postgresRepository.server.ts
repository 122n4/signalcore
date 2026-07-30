import "server-only";
import type {ScopedSqlPool} from "../dataset-catalog/postgresRepository.server";
import {canonicalizeResearchContract,validatePromotionEligibilityEnvelope,
 validateScientificDecision,type InvestingResearchScientificScope} from "../contracts";
import {validatePortfolioRiskAssessment} from "../portfolio-risk/runtimeValidation";
import {validateScientificMemoryEvent} from "../scientific-memory/persistedValidation.server";
import {hashCanonicalResearchMaterial} from "../reproducibility/hashing.server";
import {ARTIFACT_IDENTITY_DOMAIN} from "../reproducibility/versions";
import {controlledPromotionSemanticMaterial,validateControlledPromotionRecord,
 validateControlledPromotionRevocation}
 from "./preparation.server";
import type {ControlledPromotionRepository} from "./repository.server";
import type {PromotionEligibilityEvidence} from "./types";
const values=(s:InvestingResearchScientificScope)=>
 [s.tenantId,s.ownerId,s.portfolioId,s.accountId] as const;
const plain=(v:unknown):v is Record<string,unknown>=>typeof v==="object"&&v!==null
 &&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype
 &&Reflect.ownKeys(v).every(k=>typeof k==="string"
  &&Object.getOwnPropertyDescriptor(v,k)?.enumerable===true
  &&!Object.getOwnPropertyDescriptor(v,k)?.get
  &&!Object.getOwnPropertyDescriptor(v,k)?.set);
const eligibility=(v:unknown):PromotionEligibilityEvidence=>{
 if(!plain(v)||Reflect.ownKeys(v).length!==7
  ||!["eligibility","evidenceHash","riskAssessmentId","riskAssessmentHash",
   "memoryEventId","memoryEventHash","profile"].every(k=>Object.hasOwn(v,k)))
  throw new Error("promotion_eligibility_integrity_failed");
 const value=v as PromotionEligibilityEvidence;const parsed=
  validatePromotionEligibilityEnvelope(value.eligibility);
 if(!parsed.ok||!/^[a-f0-9]{64}$/u.test(value.evidenceHash)
  ||!/^[a-f0-9]{64}$/u.test(value.riskAssessmentHash)
  ||!/^[a-f0-9]{64}$/u.test(value.memoryEventHash)
  ||typeof value.riskAssessmentId!=="string"||typeof value.memoryEventId!=="string"
  ||!plain(value.profile)||Reflect.ownKeys(value.profile).length!==2
  ||value.profile.id!==parsed.value.eligibilityProfile.id
  ||value.profile.version!==parsed.value.eligibilityProfile.version
  ||!parsed.value.evidenceIds.includes(value.riskAssessmentId)
  ||!parsed.value.evidenceIds.includes(value.memoryEventId))
  throw new Error("promotion_eligibility_integrity_failed");
 const material={...parsed.value} as Record<string,unknown>;
 delete material.contractVersion;delete material.eligibilityId;
 const h=hashCanonicalResearchMaterial(ARTIFACT_IDENTITY_DOMAIN,material);
 if(!h.ok||h.value.digest!==value.evidenceHash
  ||parsed.value.eligibilityId!==`irelig_v1_${value.evidenceHash}`)
  throw new Error("promotion_eligibility_integrity_failed");
 return structuredClone(value);
};
const request=(v:unknown)=>{const p=validateControlledPromotionRecord(v);
 if(!p.ok)throw new Error("promotion_request_integrity_failed");return p.value};
const revocation=(v:unknown)=>{const p=validateControlledPromotionRevocation(v);
 if(!p.ok)throw new Error("promotion_revocation_integrity_failed");return p.value};
export class PostgresControlledPromotionRepository implements ControlledPromotionRepository{
 constructor(private readonly pool:ScopedSqlPool){}
 private async query(text:string,params:readonly unknown[]){const c=await this.pool.connect();
  try{return await c.query(text,params)}finally{c.release?.()}}
 async getDecision(s:InvestingResearchScientificScope,id:string){const r=await this.query(
  `select canonical_payload from public.investing_research_scientific_decisions
   where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4
   and decision_id=$5`,[...values(s),id]);if(r.rows.length!==1)return null;
  const p=validateScientificDecision(r.rows[0].canonical_payload);
  if(!p.ok)throw new Error("promotion_decision_integrity_failed");return p.value}
 async getRisk(s:InvestingResearchScientificScope,id:string){const r=await this.query(
  `select canonical_payload from public.investing_research_portfolio_risk_capacity_assessments
   where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4
   and assessment_id=$5`,[...values(s),id]);if(r.rows.length!==1)return null;
  const p=validatePortfolioRiskAssessment(r.rows[0].canonical_payload);
  if(!p.ok)throw new Error("promotion_risk_integrity_failed");return p.value}
 async getMemory(s:InvestingResearchScientificScope,id:string){const r=await this.query(
  `select canonical_payload from public.investing_research_audit_events
   where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4
   and event_id=$5`,[...values(s),id]);if(r.rows.length!==1)return null;
  const p=validateScientificMemoryEvent(r.rows[0].canonical_payload);
  if(!p.ok)throw new Error("promotion_memory_integrity_failed");return p.value}
 async persistEligibility(s:InvestingResearchScientificScope,v:PromotionEligibilityEvidence){
  const r=await this.query(`insert into public.investing_research_promotion_eligibility(
   tenant_id,owner_id,portfolio_id,account_id,eligibility_id,decision_id,experiment_id,
   candidate_id,candidate_version,risk_assessment_id,risk_assessment_hash,
   memory_event_id,memory_event_hash,evidence_hash,evaluated_at,canonical_payload)
   values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb)
   on conflict(evidence_hash) do nothing returning canonical_payload`,[...values(s),
   v.eligibility.eligibilityId,v.eligibility.validationDecision.decisionId,
   v.eligibility.experimentId,v.eligibility.candidateId,v.eligibility.candidateVersion,
   v.riskAssessmentId,v.riskAssessmentHash,v.memoryEventId,v.memoryEventHash,
   v.evidenceHash,v.eligibility.evaluatedAt,
   JSON.stringify(v)]);if(r.rows.length===1)return {value:eligibility(
    r.rows[0].canonical_payload),reused:false};
  const existing=await this.getEligibility(s,v.eligibility.eligibilityId);
  const a=canonicalizeResearchContract(existing),b=canonicalizeResearchContract(v);
  if(!existing||!a.ok||!b.ok||a.value!==b.value)
   throw new Error("promotion_eligibility_identity_collision");
  return {value:existing,reused:true}}
 async getEligibility(s:InvestingResearchScientificScope,id:string){const r=await this.query(
  `select canonical_payload from public.investing_research_promotion_eligibility
   where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4
   and eligibility_id=$5`,[...values(s),id]);return r.rows.length===1?
   eligibility(r.rows[0].canonical_payload):null}
 async persistRequest(s:InvestingResearchScientificScope,v:Parameters<
  ControlledPromotionRepository["persistRequest"]>[1]){const r=await this.query(
  `insert into public.investing_research_promotion_requests(
   tenant_id,owner_id,portfolio_id,account_id,request_id,request_hash,eligibility_id,
   decision_id,risk_assessment_id,memory_event_id,target,state,idempotency_key,
   prepared_at,canonical_payload) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)
   on conflict do nothing returning canonical_payload`,[...values(s),v.requestId,v.requestHash,
   v.eligibilityId,v.decisionId,v.riskAssessmentId,v.memoryEventId,v.target,v.state,
   v.idempotencyKey,v.preparedAt,JSON.stringify(v)]);
  if(r.rows.length===1)return {value:request(r.rows[0].canonical_payload),reused:false};
  let q=await this.query(`select canonical_payload from
   public.investing_research_promotion_requests where tenant_id=$1 and owner_id=$2
   and portfolio_id=$3 and account_id=$4 and idempotency_key=$5`,
   [...values(s),v.idempotencyKey]);
  if(q.rows.length===0)q=await this.query(`select canonical_payload from
   public.investing_research_promotion_requests where tenant_id=$1 and owner_id=$2
   and portfolio_id=$3 and account_id=$4 and eligibility_id=$5 and target=$6`,
   [...values(s),v.eligibilityId,v.target]);
  if(q.rows.length!==1)throw new Error("promotion_request_identity_collision");
  const existing=request(
    q.rows[0].canonical_payload);const a=canonicalizeResearchContract(existing);
  const b=canonicalizeResearchContract(v);if(!a.ok||!b.ok
   ||(existing.idempotencyKey===v.idempotencyKey&&a.value!==b.value))
   throw new Error("promotion_request_idempotency_conflict");
  if(existing.idempotencyKey!==v.idempotencyKey){
   const left=canonicalizeResearchContract(controlledPromotionSemanticMaterial(existing));
   const right=canonicalizeResearchContract(controlledPromotionSemanticMaterial(v));
   if(!left.ok||!right.ok||left.value!==right.value)
    throw new Error("promotion_request_semantic_conflict");
  }
  return {value:existing,reused:true}}
 async getRequest(s:InvestingResearchScientificScope,id:string){const r=await this.query(
  `select canonical_payload from public.investing_research_promotion_requests
   where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4
   and request_id=$5`,[...values(s),id]);return r.rows.length===1?
   request(r.rows[0].canonical_payload):null}
 async persistRevocation(s:InvestingResearchScientificScope,v:Parameters<
  ControlledPromotionRepository["persistRevocation"]>[1]){const r=await this.query(
  `insert into public.investing_research_promotion_revocations(
   tenant_id,owner_id,portfolio_id,account_id,revocation_id,revocation_hash,
   request_id,reason_code,revoked_at,canonical_payload)
   values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
   on conflict(tenant_id,owner_id,portfolio_id,account_id,request_id)
   do nothing returning canonical_payload`,[...values(s),v.revocationId,v.revocationHash,
   v.requestId,v.reasonCode,v.revokedAt,JSON.stringify(v)]);
  if(r.rows.length===1)return {value:revocation(r.rows[0].canonical_payload),reused:false};
  const existing=await this.getRevocation(s,v.requestId);if(!existing)
   throw new Error("promotion_revocation_identity_collision");
  const a=canonicalizeResearchContract(existing),b=canonicalizeResearchContract(v);
  if(!a.ok||!b.ok||a.value!==b.value)
   throw new Error("promotion_revocation_conflict");
  return {value:existing,reused:true}}
 async getRevocation(s:InvestingResearchScientificScope,id:string){const r=await this.query(
  `select canonical_payload from public.investing_research_promotion_revocations
   where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4
   and request_id=$5`,[...values(s),id]);return r.rows.length===1?
   revocation(r.rows[0].canonical_payload):null}
 async list(s:InvestingResearchScientificScope){const r=await this.query(
  `select canonical_payload from public.investing_research_promotion_requests
   where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4
   order by prepared_at,request_id`,values(s));return r.rows.map(x=>request(x.canonical_payload))}
}
