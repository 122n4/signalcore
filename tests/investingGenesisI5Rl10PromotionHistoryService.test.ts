import { beforeEach,describe,expect,it,vi } from "vitest";
const state=vi.hoisted(()=>({
  authorized:true,
  context:null as null|Record<string,unknown>,
  sqlResult:null as unknown,
  queries:[] as {sql:string;params?:readonly unknown[]}[],
  failSql:false,
}));
vi.mock("server-only",()=>({}));
vi.mock("../lib/investing/authority/context",()=>({
  resolveAuthorizedResearchPassportReadContext:vi.fn(async()=>state.authorized?
    {ok:true,context:state.context}:{ok:false,code:"FORBIDDEN_OR_NOT_FOUND"}),
  isAuthorizedResearchPassportReadContext:vi.fn((c:unknown)=>c===state.context),
}));
vi.mock("../lib/investing/authority/transport",()=>({
  getInvestingAuthorityDatabase:vi.fn(()=>({
    connect:async()=>({
      query:async (sql:string,params?:readonly unknown[])=>{
        state.queries.push({sql,params});
        if(state.failSql && sql.includes("reconstruct_research_scientific_promotion_chain_v1"))
          throw Error("AUTHORITY_FAILURE");
        return {rows:sql.includes("reconstruct_research_scientific_promotion_chain_v1")?
          [{value:state.sqlResult}]:[]};
      },
      release:vi.fn(),
    }),
  })),
}));
import { readScientificPromotionChainForCurrentUserV1 } from "../lib/investing/research/scientificPromotionHistoryService";
const id="11111111-1111-4111-8111-111111111111",
root="22222222-2222-4222-8222-222222222222",
leaf="33333333-3333-4333-8333-333333333333";
beforeEach(()=>{
 state.authorized=true;state.failSql=false;state.queries=[];
 state.context={actorId:"user",principalId:"44444444-4444-4444-8444-444444444444",
 tenantId:"55555555-5555-4555-8555-555555555555",
 tenantMembershipId:"66666666-6666-4666-8666-666666666666",
 researchInvestigationId:id,operationScope:"TENANT_SCOPE",sourceContext:"PURE_RESEARCH"};
 state.sqlResult={status:"OK",rootTransitionIdentityId:root,
 activeLeafTransitionIdentityId:leaf,activeLeafTransitionHashHex:"A".repeat(64),
 activeLeafState:"PROMOTION_ELIGIBLE",crossChainHops:[],
 traversal:[{transitionIdentityId:leaf,transitionHashHex:"A".repeat(64),resultingState:"PROMOTION_ELIGIBLE"}]};
});
function input(){return {researchInvestigationId:id,rootTransitionIdentityId:root,correlationId:"rl10-promotion-read"};}
describe("RL-10 authorized, read-only RL-8 chain reconstruction",()=>{
 it("returns persisted state, never a new gate evaluation or broker authority",async()=>{
   const v=await readScientificPromotionChainForCurrentUserV1(input());
   expect(v).toEqual({ok:true,chain:{
    schemaVersion:"RL10_PROMOTION_CHAIN_READ_V1",researchInvestigationId:id,
    rootTransitionIdentityId:root,activeLeafTransitionIdentityId:leaf,
    activeLeafTransitionHashHex:"A".repeat(64),
    scientificState:"PROMOTION_ELIGIBLE",historicalTransitionCount:1,crossChainHops:0,
    executionAuthority:"NONE",newPromotionEvaluation:"NOT_PERFORMED",
   }});
   expect(state.queries.some(x=>x.sql.startsWith("insert")||x.sql.startsWith("update")||x.sql.startsWith("delete"))).toBe(false);
   expect(state.queries.filter(x=>x.sql.includes("reconstruct_research_scientific_promotion_chain_v1")))
    .toHaveLength(1);
 });
 it("does not touch database on denied caller authority or non-pure scope",async()=>{
   state.authorized=false;
   expect((await readScientificPromotionChainForCurrentUserV1(input())).ok).toBe(false);
   expect(state.queries).toHaveLength(0);
   state.authorized=true;state.context!.sourceContext="USER_PORTFOLIO";
   expect((await readScientificPromotionChainForCurrentUserV1(input())).ok).toBe(false);
   expect(state.queries).toHaveLength(0);
 });
 it("rejects corrupt, incomplete or mismatched persisted reconstructions",async()=>{
   for(const altered of [
    {status:"CORRUPT_HISTORY",rootTransitionIdentityId:root},
    {...(state.sqlResult as object),activeLeafState:"VALIDATION_PASSED"},
    {...(state.sqlResult as object),rootTransitionIdentityId:id},
    {...(state.sqlResult as object),activeLeafTransitionHashHex:"bad"},
    {...(state.sqlResult as object),traversal:[]},
   ]) {
    state.sqlResult=altered;
    expect(await readScientificPromotionChainForCurrentUserV1(input()))
      .toEqual({ok:false,code:"INTERNAL_ERROR"});
   }
 });
 it("maps missing/foreign root to non-disclosing failure",async()=>{
   state.failSql=true;
   expect(await readScientificPromotionChainForCurrentUserV1(input()))
    .toEqual({ok:false,code:"FORBIDDEN_OR_NOT_FOUND"});
 });
});
