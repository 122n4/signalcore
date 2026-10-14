import {beforeEach,describe,expect,it,vi} from "vitest";

const data=vi.hoisted(()=>({
  authority:true,
  scope:"PURE_RESEARCH",
  transport:"investing_app",
  readFailure:false,
  passport:{} as Record<string,unknown>,
  chainResult:null as unknown,
  connections:0,
  queries:[] as readonly {sql:string;params?:readonly unknown[]}[],
  releases:0,
}));
vi.mock("server-only",()=>({}));
vi.mock("../lib/investing/authority/context",()=>({
  resolveAuthorizedResearchPassportReadContext:vi.fn(async()=>data.authority?
    {ok:true,context:{
      actorId:"owner",principalId:"44444444-4444-4444-8444-444444444444",
      tenantId:"55555555-5555-4555-8555-555555555555",
      tenantMembershipId:"66666666-6666-4666-8666-666666666666",
      researchInvestigationId:"11111111-1111-4111-8111-111111111111",
      operationScope:"TENANT_SCOPE",sourceContext:data.scope,
    }}:{ok:false,code:"FORBIDDEN_OR_NOT_FOUND"}),
  isAuthorizedResearchPassportReadContext:vi.fn(()=>true),
}));
vi.mock("../lib/investing/research/researchPassportReader",()=>({
  readResearchPassportV1:vi.fn(async()=>data.readFailure?{ok:false,code:"PASSPORT_SOURCE_INTEGRITY_FAILURE"}:
    {ok:true,passport:data.passport}),
}));
vi.mock("../lib/investing/authority/transport",()=>({
  getInvestingAuthorityDatabase:vi.fn(()=>({
    connect:async()=>{
      data.connections++;
      return {
        query:async(sql:string,params?:readonly unknown[])=>{
          data.queries=[...data.queries,{sql,params}];
          if(sql==="select current_user,current_role")
            return {rows:[{current_user:"investing_app",current_role:"investing_app"}]};
          if(sql.includes("select m.tenant_membership_id"))
            return {rows:[{tenant_membership_id:"66666666-6666-4666-8666-666666666666"}]};
          if(sql.includes("reconstruct_research_scientific_promotion_chain_v1"))
            return {rows:[{result:data.chainResult??{status:"CORRUPT_HISTORY",rootTransitionIdentityId:"22222222-2222-4222-8222-222222222222"}}]};
          return {rows:[]};
        },
        release:async()=>{data.releases++;},
      };
    },
  })),
}));
import {evaluateScientificPromotionForCurrentUserV1,persistScientificPromotionForCurrentUserV1} from "../lib/investing/research/scientificPromotionEvaluationService";
import {hashRefV1} from "../lib/investing/research/canonical";
import {hashScientificPromotionProtocolV1,hashScientificPromotionTransitionV1,type ScientificPromotionTransitionV1} from "../lib/investing/research/scientificPromotion";

const inputs={researchInvestigationId:"11111111-1111-4111-8111-111111111111",
 rootTransitionIdentityId:"22222222-2222-4222-8222-222222222222",
 researchValidationProtocolIdentityId:"33333333-3333-4333-8333-333333333333",
 correlationId:"rl10-evaluate-test"};
beforeEach(()=>{
 data.authority=true;data.scope="PURE_RESEARCH";data.transport="investing_app";data.chainResult=null;
 data.readFailure=false;data.connections=0;data.queries=[];data.releases=0;
 data.passport={
   transportProof:{currentUser:"investing_app",currentRole:"investing_app"},
   investigation:{
     tenantId:"55555555-5555-4555-8555-555555555555",
     principalId:"44444444-4444-4444-8444-444444444444",
     tenantMembershipId:"66666666-6666-4666-8666-666666666666",
     researchInvestigationId:"11111111-1111-4111-8111-111111111111",
     sourceContext:"PURE_RESEARCH",operationScope:"TENANT_SCOPE",
   },
   validation:{availability:"UNAVAILABLE_RL3_SCOPE",episodes:[]},
 };
});
describe("RL-10 persisted-only, no-write promotion evaluation",()=>{
 it("denies unowned and non-pure Investigation before reading any data",async()=>{
   data.authority=false;
   expect(await evaluateScientificPromotionForCurrentUserV1(inputs))
     .toMatchObject({ok:false,code:"FORBIDDEN_OR_NOT_FOUND"});
   data.authority=true;data.scope="USER_PORTFOLIO";
   expect(await evaluateScientificPromotionForCurrentUserV1(inputs))
     .toMatchObject({ok:false,code:"FORBIDDEN_OR_NOT_FOUND"});
   expect(data.connections).toBe(0);
 });
 it("rejects malformed selectors without resolving ownership",async()=>{
   expect(await evaluateScientificPromotionForCurrentUserV1({
     ...inputs,rootTransitionIdentityId:"not-a-uuid"}))
     .toMatchObject({ok:false,code:"VALIDATION_ERROR"});
   expect(data.connections).toBe(0);
 });
 it("rejects a corrupt Passport and non-investing_app read transport",async()=>{
   data.readFailure=true;
   expect(await evaluateScientificPromotionForCurrentUserV1(inputs))
     .toMatchObject({ok:false,code:"INTERNAL_ERROR"});
   data.readFailure=false;
   (data.passport.transportProof as Record<string,string>).currentRole="service_role";
   expect(await evaluateScientificPromotionForCurrentUserV1(inputs))
     .toMatchObject({ok:false,code:"INTERNAL_ERROR"});
   expect(data.connections).toBe(0);
 });
 it("refuses scientific gate evaluation when validation is unavailable",async()=>{
   expect(await evaluateScientificPromotionForCurrentUserV1(inputs))
     .toEqual({ok:false,code:"CAPABILITY_UNAVAILABLE"});
   expect(data.connections).toBe(0);
 });
 it("matches only a scientific root hash from authorized Passport, without direct RL-8 table SELECT",async()=>{
   const mk=(domain:string,c:string)=>hashRefV1({
     hashAlgorithm:"SHA-256",hashDomain:domain as "SYNTRAKE:EXPERIMENT:V1",
     hashVersion:"SYNTRAKE_SHA256_V1",hashHex:c.repeat(64),
   });
   const experiment=mk("SYNTRAKE:EXPERIMENT:V1","A");
   const parameters=mk("SYNTRAKE:EXPERIMENT_PARAMETERS:V1","B");
   const ir=mk("SYNTRAKE:RESEARCH_IR:V1","C");
   const run=mk("SYNTRAKE:RUN_INPUT:V1","D");
   const result=mk("SYNTRAKE:RESULT:V1","E");
   const predecessor:ScientificPromotionTransitionV1={
     schemaVersion:"SCIENTIFIC_PROMOTION_TRANSITION_V1",
     protocol:hashScientificPromotionProtocolV1(),
     subject:{subjectExperiment:experiment,subjectExperimentParameters:parameters,subjectResearchIr:ir},
     predecessorTransition:null,predecessorState:"DRAFT_RESEARCH",resultingState:"EXECUTED",
     evidenceSnapshot:{
       runInput:run,result,evidenceObject:null,validationProtocol:null,validationResult:null,
       validationAssessmentProtocol:null,validationAssessmentResult:null,
       robustnessComparisonProtocol:null,robustnessComparisonResult:null,
     },
     gateOutcomes:[],transitionReasons:[],supersedes:null,rejectedTransition:null,supersededByChain:null,
   };
   const hash=hashScientificPromotionTransitionV1(predecessor).hashHex;
   data.chainResult={
     status:"OK",rootTransitionIdentityId:inputs.rootTransitionIdentityId,
     activeLeafTransitionIdentityId:inputs.rootTransitionIdentityId,
     activeLeafTransitionHashHex:hash,activeLeafState:"EXECUTED",
     traversal:[{transitionIdentityId:inputs.rootTransitionIdentityId,transitionHashHex:hash,resultingState:"EXECUTED"}],
     crossChainHops:[],
   };
   Object.assign(data.passport,{
     validation:{availability:"AVAILABLE_RL3",episodes:[]},
     experiments:[{researchExperimentId:"77777777-7777-4777-8777-777777777777",
       experiment,experimentParameters:parameters,researchIr:ir}],
     runInputs:[{runInputIdentityId:"88888888-8888-4888-8888-888888888888",
       researchExperimentId:"77777777-7777-4777-8777-777777777777",
       runInput:run,experimentHashHex:experiment.hashHex,researchIrHashHex:ir.hashHex,
       canonicalPayload:{}}],
     results:[{resultIdentityId:"99999999-9999-4999-8999-999999999999",
       runInputIdentityId:"88888888-8888-4888-8888-888888888888",result,canonicalPayload:{}}],
     executionRuns:[{runInputIdentityId:"88888888-8888-4888-8888-888888888888",
       terminalState:"SUCCEEDED",resultIdentityId:"99999999-9999-4999-8999-999999999999"}],
     evidence:[{resultIdentityId:"99999999-9999-4999-8999-999999999999",
       runInputIdentityId:"88888888-8888-4888-8888-888888888888",
       evidenceIdentityId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",evidence:mk("SYNTRAKE:EVIDENCE_OBJECT:V1","F"),
       acceptedContent:{availability:"INLINE",utf8:"{}"},contentSha256:"F".repeat(64),contentByteLength:"2",
       descriptor:{schemaVersion:"EVIDENCE_CONTENT_DESCRIPTOR_V1",kind:"RESEARCH_EXECUTION_EVIDENCE",
         artifactSchemaVersion:"RESEARCH_EXECUTION_EVIDENCE_V1",format:"CANONICAL_JSON_UTF8_V1"}}],
   });
   // The mock DB has no validation protocol row; execution must fail closed
   // AFTER matching the hash and checking the scoped validation source.
   expect(await evaluateScientificPromotionForCurrentUserV1(inputs))
     .toEqual({ok:false,code:"INTERNAL_ERROR"});
   expect(data.queries.some(x=>x.sql.includes("from investing.research_evidence_objects_scientific_identities"))).toBe(false);
   expect(data.queries.some(x=>x.sql.includes("from investing.research_validation_protocols_scientific_identities"))).toBe(false);
   expect(data.queries.some(x=>x.sql.includes("from investing.research_scientific_promotion_transitions_scientific_identities"))).toBe(false);
   expect(data.queries.some(x=>x.sql==="rollback")).toBe(true);
 });
 it("PERSIST_PROMOTION must not open a transaction without owner scope or full validation",async()=>{
   data.authority=false;
   expect(await persistScientificPromotionForCurrentUserV1(inputs))
     .toEqual({ok:false,code:"FORBIDDEN_OR_NOT_FOUND"});
   data.authority=true;data.scope="USER_PORTFOLIO";
   expect(await persistScientificPromotionForCurrentUserV1(inputs))
     .toEqual({ok:false,code:"FORBIDDEN_OR_NOT_FOUND"});
   data.scope="PURE_RESEARCH";
   expect(await persistScientificPromotionForCurrentUserV1({...inputs,rootTransitionIdentityId:"invalid"}))
     .toEqual({ok:false,code:"VALIDATION_ERROR"});
   expect(await persistScientificPromotionForCurrentUserV1(inputs))
     .toEqual({ok:false,code:"CAPABILITY_UNAVAILABLE"});
   expect(data.connections).toBe(0);
   expect(data.queries).toHaveLength(0);
 });
 it("PERSIST_PROMOTION rolls back on a corrupt RL-8 reconstruction without calling SQL writer",async()=>{
   data.passport.validation={availability:"AVAILABLE_RL3",episodes:[]};
   expect(await persistScientificPromotionForCurrentUserV1(inputs))
     .toEqual({ok:false,code:"INTERNAL_ERROR"});
   expect(data.queries.some(x=>x.sql==="rollback")).toBe(true);
   expect(data.queries.some(x=>x.sql.includes("persist_research_scientific_promotion_evaluation_plan_v1"))).toBe(false);
   expect(data.releases).toBe(1);
 });
 it("rolls back a corrupt persisted RL-8 chain without mutation",async()=>{
   data.passport.validation={availability:"AVAILABLE_RL3",episodes:[]};
   expect(await evaluateScientificPromotionForCurrentUserV1(inputs))
     .toEqual({ok:false,code:"INTERNAL_ERROR"});
   expect(data.connections).toBe(1);
   expect(data.releases).toBe(1);
   expect(data.queries.some(x=>x.sql==="rollback")).toBe(true);
   expect(data.queries.some(x=>/^\s*(insert|update|delete|alter|drop|create)\b/iu.test(x.sql))).toBe(false);
   expect(data.queries.filter(x=>x.sql.includes("reconstruct_research_scientific_promotion_chain_v1")))
     .toHaveLength(1);
   expect(data.queries.some(x=>x.sql.includes("persist_research_scientific_promotion_evaluation_plan_v1"))).toBe(false);
 });
});
