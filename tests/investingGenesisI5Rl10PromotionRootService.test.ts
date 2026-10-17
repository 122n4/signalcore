import {beforeEach,describe,expect,it,vi} from "vitest";
const scenario=vi.hoisted(()=>({
 authorized:true,
 context:null as Record<string,unknown>|null,
 passport:null as unknown,
 calls:[] as {sql:string;params:readonly unknown[]|undefined}[],
 failRoot:false,
 divergent:false,
}));
vi.mock("server-only",()=>({}));
vi.mock("../lib/investing/authority/context",()=>({
 resolveAuthorizedResearchPassportReadContext:vi.fn(async()=>
  scenario.authorized?{ok:true,context:scenario.context}:{ok:false,code:"FORBIDDEN_OR_NOT_FOUND"}),
 isAuthorizedResearchPassportReadContext:vi.fn((input:unknown)=>scenario.authorized&&input===scenario.context),
}));
vi.mock("../lib/investing/research/researchPassportReader",()=>({
 readResearchPassportV1:vi.fn(async()=>({ok:true,passport:scenario.passport})),
}));
vi.mock("../lib/investing/authority/transport",()=>({
 getInvestingAuthorityDatabase:vi.fn(()=>({
  connect:async()=>({
   query:async(sql:string,params?:readonly unknown[])=>{
    scenario.calls.push({sql,params});
    if(sql.includes("persist_research_scientific_promotion_protocol_v1"))return {rows:[{
     result:{status:"CREATED",researchScientificPromotionProtocolIdentityId:ids.protocol,
     hashHex:params?.[0]},
    }]};
    if(sql.includes("persist_research_scientific_promotion_root_v1")){
     if(scenario.failRoot)throw Error("DATABASE_WRITE_FAILURE");
     return {rows:[{result:scenario.divergent?
      {status:"DIVERGENT_EXISTING_IDENTITY"}:
      {status:"CREATED",researchScientificPromotionTransitionIdentityId:ids.root,
       transitionHashHex:params?.[0]}}]};
    }
    return {rows:[]};
   },
   release:vi.fn(),
  }),
 })),
}));
import {createScientificPromotionRootForCurrentUserV1} from "../lib/investing/research/scientificPromotionRootService";
const ids={
 investigation:"11111111-1111-4111-8111-111111111111",
 exp:"22222222-2222-4222-8222-222222222222",
 run:"33333333-3333-4333-8333-333333333333",
 result:"44444444-4444-4444-8444-444444444444",
 evidence:"55555555-5555-4555-8555-555555555555",
 protocol:"66666666-6666-4666-8666-666666666666",
 root:"77777777-7777-4777-8777-777777777777",
 tenant:"88888888-8888-4888-8888-888888888888",
 principal:"99999999-9999-4999-8999-999999999999",
 membership:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};
const ref=(domain:string,c:string)=>({
 hashAlgorithm:"SHA-256",hashDomain:domain,hashVersion:"SYNTRAKE_SHA256_V1",
 hashHex:c.repeat(64),
});
const input=()=>({
 researchInvestigationId:ids.investigation,researchExperimentId:ids.exp,
 runInputIdentityId:ids.run,correlationId:"rl10-root-unit",
});
const passport=()=>({
 transportProof:{currentUser:"investing_app",currentRole:"investing_app"},
 investigation:{
  researchInvestigationId:ids.investigation,tenantId:ids.tenant,
  principalId:ids.principal,tenantMembershipId:ids.membership,
  operationScope:"TENANT_SCOPE",sourceContext:"PURE_RESEARCH",
 },
 experiments:[{researchExperimentId:ids.exp,
  experiment:ref("SYNTRAKE:EXPERIMENT:V1","A"),
  experimentParameters:ref("SYNTRAKE:EXPERIMENT_PARAMETERS:V1","B"),
  researchIr:ref("SYNTRAKE:RESEARCH_IR:V1","C")}],
 runInputs:[{runInputIdentityId:ids.run,researchExperimentId:ids.exp,
  runInput:ref("SYNTRAKE:RUN_INPUT:V1","D"),
  experimentHashHex:"A".repeat(64),researchIrHashHex:"C".repeat(64)}],
 executionRuns:[{runInputIdentityId:ids.run,terminalState:"SUCCEEDED",resultIdentityId:ids.result}],
 results:[{resultIdentityId:ids.result,runInputIdentityId:ids.run,
  result:ref("SYNTRAKE:RESULT:V1","E")}],
 evidence:[{evidenceIdentityId:ids.evidence,resultIdentityId:ids.result,runInputIdentityId:ids.run}],
});
beforeEach(()=>{
 scenario.calls=[];scenario.authorized=true;scenario.failRoot=false;scenario.divergent=false;
 scenario.context={
  actorId:"rl10-owner",principalId:ids.principal,tenantId:ids.tenant,
  tenantMembershipId:ids.membership,researchInvestigationId:ids.investigation,
  operationScope:"TENANT_SCOPE",sourceContext:"PURE_RESEARCH",
 };
 scenario.passport=passport();
});
describe("RL-10 owner-authorized RL-8 promotion root persistence",()=>{
 it("writes canonical current protocol then deterministic root only, in one transaction",async()=>{
  const out=await createScientificPromotionRootForCurrentUserV1(input());
  expect(out).toMatchObject({ok:true,status:"CREATED",scientificState:"EXECUTED",
   promotionEligibility:"NOT_EVALUATED",executionAuthority:"NONE",
   rootTransitionIdentityId:ids.root});
  const writes=scenario.calls.filter(x=>x.sql.includes("persist_research_scientific_promotion_"));
  expect(writes).toHaveLength(2);
  const canonical=JSON.parse(writes[1]!.params?.[1] as string);
  expect(canonical.predecessorState).toBe("DRAFT_RESEARCH");
  expect(canonical.resultingState).toBe("EXECUTED");
  expect(canonical.subject.subjectExperiment.hashHex).toBe("A".repeat(64));
  expect(canonical.evidenceSnapshot.result.hashHex).toBe("E".repeat(64));
  expect(canonical.evidenceSnapshot.validationAssessmentResult).toBeNull();
  expect(canonical.gateOutcomes).toEqual([]);
  expect(scenario.calls.filter(x=>x.sql==="commit")).toHaveLength(1);
 });
 it("rejects foreign authority and non-pure scopes before database writes",async()=>{
  scenario.authorized=false;
  expect((await createScientificPromotionRootForCurrentUserV1(input())).ok).toBe(false);
  expect(scenario.calls).toHaveLength(0);
  scenario.authorized=true;
  scenario.context!.sourceContext="USER_PORTFOLIO";
  expect((await createScientificPromotionRootForCurrentUserV1(input())).ok).toBe(false);
  expect(scenario.calls).toHaveLength(0);
 });
 it("fails closed on incomplete or unproven persisted execution state",async()=>{
  for(const changed of [
   {...passport(),results:[]},
   {...passport(),evidence:[]},
   {...passport(),executionRuns:[]},
   {...passport(),runInputs:[{...passport().runInputs[0],researchExperimentId:ids.investigation}]},
   {...passport(),transportProof:{currentUser:"service_role",currentRole:"service_role"}},
  ]){
   scenario.passport=changed;
   expect((await createScientificPromotionRootForCurrentUserV1(input())).ok).toBe(false);
   expect(scenario.calls).toHaveLength(0);
  }
 });
 it("maps divergent identity to conflict and rolls back transaction",async()=>{
  scenario.divergent=true;
  expect(await createScientificPromotionRootForCurrentUserV1(input()))
   .toEqual({ok:false,code:"CONFLICT"});
  expect(scenario.calls.some(x=>x.sql==="rollback")).toBe(true);
  expect(scenario.calls.some(x=>x.sql==="commit")).toBe(false);
 });
 it("rolls back failed root write; no invented scientific outcome",async()=>{
  scenario.failRoot=true;
  expect(await createScientificPromotionRootForCurrentUserV1(input()))
   .toEqual({ok:false,code:"INTERNAL_ERROR"});
  expect(scenario.calls.some(x=>x.sql==="rollback")).toBe(true);
  expect(scenario.calls.some(x=>x.sql==="commit")).toBe(false);
 });
});
