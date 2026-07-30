import {describe,expect,it,vi} from "vitest";vi.mock("server-only",()=>({}));
vi.mock("@/lib/investing/research/contracts",async(importOriginal)=>{
 const actual=await importOriginal<typeof import("@/lib/investing/research/contracts")>();
 return {...actual,validateScientificDecision:(v:unknown)=>({ok:true as const,value:v}),
  validatePromotionEligibilityEnvelope:(v:unknown)=>({ok:true as const,value:v})};});
vi.mock("@/lib/investing/research/portfolio-risk/runtimeValidation",()=>({
 validatePortfolioRiskAssessment:(v:unknown)=>({ok:true as const,value:v})}));
vi.mock("@/lib/investing/research/scientific-memory/persistedValidation.server",()=>({
 validateScientificMemoryEvent:(v:unknown)=>({ok:true as const,value:v})}));
vi.mock("@/lib/investing/research/architecture/promotionBoundary.server",()=>({
 verifyPromotionCandidateForPreparation:(v:unknown)=>{
  const target=(v as {requestedTarget?:string})?.requestedTarget;
  return target==="shadow"||target==="investing_paper"?
   {ok:true as const,value:v}:{ok:false as const,issues:[{path:"target",
    reasonCode:"research.promotion.target_forbidden"}]};}}));
import {evaluatePromotionEligibility} from
 "@/lib/investing/research/controlled-promotion/engine.server";
import {prepareControlledPromotion,revokeControlledPromotion,
 controlledPromotionSemanticMaterial,validateControlledPromotionRecord} from
 "@/lib/investing/research/controlled-promotion/preparation.server";
import {ControlledPromotionService} from
 "@/lib/investing/research/controlled-promotion/service.server";
import {PostgresControlledPromotionRepository} from
 "@/lib/investing/research/controlled-promotion/postgresRepository.server";
import {CONTROLLED_PROMOTION_PROFILE_VERSION,PROMOTION_ELIGIBILITY_INPUT_VERSION}
 from "@/lib/investing/research/controlled-promotion";
const scope={contractVersion:"investing-research-scope/v1",authenticatedUserId:"user",
 membershipId:"member",tenantId:"tenant",ownerId:"owner",portfolioId:"portfolio",
 accountId:"account"};const scientificScope={tenantId:"tenant",ownerId:"owner",
 portfolioId:"portfolio",accountId:"account"};
const decision={decisionId:"decision",outcome:"validated",scope,scientificScope,
 candidateId:"candidate",candidateVersion:"v1",hypothesisId:"hypothesis",
 hypothesisVersion:"v1",experimentId:"experiment",runId:"run",
 validationReport:{reportId:"report",dataset:{datasetVersionId:"dataset"}},
 evidenceIds:["report"]};
const risk={assessmentId:"risk",assessmentHash:"a".repeat(64),outcome:"passed",
 scope,scientificScope,members:[{decisionId:"decision",reportId:"report",
 experimentId:"experiment",runId:"run",candidateId:"candidate",candidateVersion:"v1"}]};
const memory={eventId:"memory",eventHash:"b".repeat(64),decisionId:"decision",
 reportId:"report",knowledge:"positive",outcome:"validated",scope,scientificScope};
const input=()=>({contractVersion:PROMOTION_ELIGIBILITY_INPUT_VERSION,decision,
 riskAssessment:risk,memoryEvent:memory,profile:{contractVersion:
  CONTROLLED_PROMOTION_PROFILE_VERSION,profileId:"promotion",profileVersion:"v1"},
 evaluatedAt:"2027-02-01T00:00:00.000Z",evaluatedBy:{id:"boundary",version:"v1"}});
const preparedRecord=()=>{
 const eligible=evaluatePromotionEligibility(input());if(!eligible.ok)throw new Error("fixture");
 const candidate={requestedTarget:"shadow" as const,scope,scientificDecision:decision,
  promotionEligibility:eligible.value.eligibility,candidate:{id:"candidate",version:"v1"},
  riskCapacityReferences:[{id:"risk",version:"a".repeat(64)}],
  correlationId:"correlation",idempotencyKey:"key"};
 const prepared=prepareControlledPromotion({candidateEnvelope:candidate,
  riskAssessmentId:"risk",memoryEventId:"memory",
  preparedAt:"2027-02-02T00:00:00.000Z",preparedBy:{id:"boundary",version:"v1"}});
 if(!prepared.ok)throw new Error("fixture");return {eligible:eligible.value,record:prepared.value};
};
describe("Phase 6M controlled promotion",()=>{
 it("creates deterministic eligibility only from decision+risk+memory",()=>{
  const a=evaluatePromotionEligibility(input());expect(a).toEqual(
   evaluatePromotionEligibility(input()));expect(a.ok).toBe(true);
  if(a.ok){expect(a.value.eligibility.state).toBe("promotion_eligible");
   expect(a.value.eligibility.evidenceIds).toEqual(["decision","memory","risk"]);}});
 it("fails closed for failed risk, non-positive memory and broken chain",()=>{
  expect(evaluatePromotionEligibility({...input(),riskAssessment:{...risk,
   outcome:"failed"}}).ok).toBe(false);
  expect(evaluatePromotionEligibility({...input(),memoryEvent:{...memory,
   knowledge:"negative"}}).ok).toBe(false);
  expect(evaluatePromotionEligibility({...input(),memoryEvent:{...memory,
   decisionId:"other"}}).ok).toBe(false);});
 it.each([null,undefined,1,[],Symbol("x"),new Date(),Object.create({polluted:true})])
 ("rejects adversarial eligibility input without throws",value=>{
  expect(()=>evaluatePromotionEligibility(value)).not.toThrow();
  expect(evaluatePromotionEligibility(value).ok).toBe(false);});
 it("prepares only shadow/paper and revalidates its content hash",()=>{
  const eligible=evaluatePromotionEligibility(input());if(!eligible.ok)return;
  const candidate={requestedTarget:"shadow",scope,scientificDecision:decision,
   promotionEligibility:eligible.value.eligibility,candidate:{id:"candidate",version:"v1"},
   idempotencyKey:"key"};
  const prepared=prepareControlledPromotion({candidateEnvelope:candidate,
   riskAssessmentId:"risk",memoryEventId:"memory",
   preparedAt:"2027-02-02T00:00:00.000Z",preparedBy:{id:"boundary",version:"v1"}});
  expect(prepared.ok).toBe(true);if(!prepared.ok)return;
  expect(validateControlledPromotionRecord(prepared.value).ok).toBe(true);
  expect(validateControlledPromotionRecord({...prepared.value,target:"live"}).ok).toBe(false);
  expect(prepareControlledPromotion({candidateEnvelope:{...candidate,
   requestedTarget:"live"},riskAssessmentId:"risk",memoryEventId:"memory",
   preparedAt:"2027-02-02T00:00:00.000Z",
   preparedBy:{id:"boundary",version:"v1"}}).ok).toBe(false);});
 it("creates an immutable content-addressed revocation",()=>{
  const eligible=evaluatePromotionEligibility(input());if(!eligible.ok)return;
  const candidate={requestedTarget:"investing_paper",scope,scientificDecision:decision,
   promotionEligibility:eligible.value.eligibility,candidate:{id:"candidate",version:"v1"},
   idempotencyKey:"key"};const prepared=prepareControlledPromotion({
   candidateEnvelope:candidate,riskAssessmentId:"risk",memoryEventId:"memory",
   preparedAt:"2027-02-02T00:00:00.000Z",preparedBy:{id:"boundary",version:"v1"}});
  if(!prepared.ok)return;const revoked=revokeControlledPromotion({request:prepared.value,
   reasonCode:"operator_revoked",revokedAt:"2027-02-03T00:00:00.000Z",
   revokedBy:{id:"operator",version:"v1"}});
  expect(revoked.ok&&revoked.value.state).toBe("promotion_revoked");});
 it("authorizes and validates requests before repository IO",async()=>{
  const repository={getDecision:vi.fn(),getRisk:vi.fn(),getMemory:vi.fn(),
   persistEligibility:vi.fn(),getEligibility:vi.fn(),persistRequest:vi.fn(),
   getRequest:vi.fn(),persistRevocation:vi.fn(),getRevocation:vi.fn(),list:vi.fn()};
  const denied=new ControlledPromotionService(repository as never,{
   authorize:async()=>({ok:false as const,reason:"denied"})},{load:vi.fn()},vi.fn());
  await expect(denied.evaluate({})).resolves.toEqual({ok:false,reason:"denied"});
  expect(repository.getDecision).not.toHaveBeenCalled();
  const allowed=new ControlledPromotionService(repository as never,{
   authorize:async()=>({ok:true as const,value:{authenticatedUserId:"user",
    membershipId:"member",scope:scientificScope}})},{load:vi.fn()},vi.fn());
  await expect(allowed.evaluate({})).resolves.toEqual({ok:false,
   reason:"promotion_eligibility_request_invalid"});
  await expect(allowed.revoke({requestId:"request",reasonCode:"bad",
   revokedAt:"bad",revokedBy:{}})).resolves.toEqual({ok:false,
   reason:"promotion_revocation_invalid"});
  expect(repository.getRequest).not.toHaveBeenCalled();
 });
 it("blocks reuse after revocation and exposes one consistent effective state",async()=>{
  const {eligible,record}=preparedRecord();
  const revocation=revokeControlledPromotion({request:record,reasonCode:"operator_revoked",
   revokedAt:"2027-02-03T00:00:00.000Z",revokedBy:{id:"operator",version:"v1"}});
  if(!revocation.ok)throw new Error("fixture");
  const repository={getDecision:vi.fn(),getRisk:vi.fn(),getMemory:vi.fn(),
   persistEligibility:vi.fn(),getEligibility:vi.fn().mockResolvedValue(eligible),
   persistRequest:vi.fn().mockResolvedValue({value:record,reused:true}),
   getRequest:vi.fn().mockResolvedValue(record),persistRevocation:vi.fn(),
   getRevocation:vi.fn().mockResolvedValue(revocation.value),
   list:vi.fn().mockResolvedValue([record])};
  const service=new ControlledPromotionService(repository as never,{
   authorize:async()=>({ok:true as const,value:{authenticatedUserId:"user",
    membershipId:"member",scope:scientificScope}})},{load:vi.fn()},vi.fn());
  await expect(service.prepare({candidateEnvelope:record.candidateEnvelope,
   riskAssessmentId:"risk",memoryEventId:"memory",preparedAt:record.preparedAt,
   preparedBy:record.preparedBy})).resolves.toEqual({ok:false,
    reason:"promotion_request_revoked"});
  await expect(service.get(record.requestId)).resolves.toMatchObject({ok:true,
   value:{effectiveState:"promotion_revoked",revocation:revocation.value}});
  await expect(service.list()).resolves.toMatchObject({ok:true,value:[{
   effectiveState:"promotion_revoked",revocation:revocation.value}]});
 });
 it("converges only for equal scientific promotion material",()=>{
  const {record}=preparedRecord();
  const operational={...record,idempotencyKey:"other-key",
   candidateEnvelope:{...record.candidateEnvelope,idempotencyKey:"other-key",
    correlationId:"other-correlation"}};
  expect(controlledPromotionSemanticMaterial(operational as typeof record))
   .toEqual(controlledPromotionSemanticMaterial(record));
  const divergent={...operational,candidateVersion:"v2",
   candidateEnvelope:{...operational.candidateEnvelope,
    candidate:{id:"candidate",version:"v2"}}};
 expect(controlledPromotionSemanticMaterial(divergent as typeof record))
   .not.toEqual(controlledPromotionSemanticMaterial(record));
 });
 it("rejects semantic divergence at the database convergence boundary",async()=>{
  const {record}=preparedRecord();
  const changed=prepareControlledPromotion({candidateEnvelope:{
   ...record.candidateEnvelope,idempotencyKey:"other-key",
   candidate:{id:"candidate",version:"v2"}},riskAssessmentId:"risk",
   memoryEventId:"memory",preparedAt:"2027-02-04T00:00:00.000Z",
   preparedBy:{id:"other-boundary",version:"v1"}});
  if(!changed.ok)throw new Error("fixture");
  const query=vi.fn()
   .mockResolvedValueOnce({rows:[]})
   .mockResolvedValueOnce({rows:[]})
   .mockResolvedValueOnce({rows:[{canonical_payload:record}]});
  const repository=new PostgresControlledPromotionRepository({connect:async()=>({
   query,release:vi.fn()})} as never);
  await expect(repository.persistRequest(scientificScope,changed.value))
   .rejects.toThrow("promotion_request_semantic_conflict");
 });
});
