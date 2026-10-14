import {beforeEach,describe,expect,it,vi} from "vitest";
import type {InvestingAuthorityTransactionClient} from "../lib/investing/authority/context";
import type {ScientificPromotionEvaluationPlanV1} from "../lib/investing/research/scientificPromotionEngine";
import type {ScientificPromotionTransitionV1} from "../lib/investing/research/scientificPromotion";
import {persistScientificPromotionPlanV1} from "../lib/investing/research/scientificPromotionPersistenceWriter";

vi.mock("server-only",()=>({}));
vi.mock("../lib/investing/research/scientificPromotion",()=>({
  hashScientificPromotionTransitionV1:vi.fn((payload:{hashHex:string})=>({hashHex:payload.hashHex})),
  canonicalScientificPromotionTransitionV1:vi.fn((value:unknown)=>value),
  assertScientificPromotionPredecessorRelationV1:vi.fn(),
}));

const rootId="11111111-1111-4111-8111-111111111111";
const stageId="22222222-2222-4222-8222-222222222222";
const closureId="33333333-3333-4333-8333-333333333333";
const rootHash="A".repeat(64),stageHash="B".repeat(64),closureHash="C".repeat(64);
const predecessor={
  resultingState:"EXECUTED",hashHex:rootHash,
} as unknown as ScientificPromotionTransitionV1;
function fixture(withClosure=false){
  const stage={
    resultingState:withClosure?"VALIDATION_PASSED":"INSUFFICIENT_EVIDENCE",
    predecessorState:"EXECUTED",predecessorTransition:{hashHex:rootHash},
    hashHex:stageHash,
  } as unknown as ScientificPromotionTransitionV1;
  const closure={
    resultingState:"PROMOTION_ELIGIBLE",predecessorState:"VALIDATION_PASSED",
    predecessorTransition:{hashHex:stageHash},hashHex:closureHash,
  } as unknown as ScientificPromotionTransitionV1;
  const plan={
    kind:"AUTHORITATIVE_PLAN",
    stageA:{transition:stage,transitionRef:{hashHex:stageHash}},
    closure:withClosure?{transition:closure,transitionRef:{hashHex:closureHash}}:null,
  } as unknown as Extract<ScientificPromotionEvaluationPlanV1,{kind:"AUTHORITATIVE_PLAN"}>;
  const queries:{sql:string;params:readonly unknown[]}[]=[];
  let writeStatus="CREATED",badChain=false,badReceipt=false;
  const client={
    query:vi.fn(async(sql:string,params:readonly unknown[]=[])=>{
      queries.push({sql,params});
      if(sql.includes("persist_research_scientific_promotion_evaluation_plan_v1"))
        return {rows:[{result:badReceipt?{status:"CREATED"}:{
          status:writeStatus,stageATransitionIdentityId:stageId,
          closureTransitionIdentityId:withClosure?closureId:null,
        }}]};
      if(sql.includes("reconstruct_research_scientific_promotion_chain_v1"))return {rows:[{result:{
        status:badChain?"CORRUPT_HISTORY":"OK",rootTransitionIdentityId:rootId,
        activeLeafTransitionIdentityId:withClosure?closureId:stageId,
        activeLeafTransitionHashHex:withClosure?closureHash:stageHash,
        activeLeafState:withClosure?"PROMOTION_ELIGIBLE":"INSUFFICIENT_EVIDENCE",
        traversal:[
          {transitionIdentityId:rootId,transitionHashHex:rootHash},
          {transitionIdentityId:stageId,transitionHashHex:stageHash},
          ...(withClosure?[{transitionIdentityId:closureId,transitionHashHex:closureHash}]:[]),
        ],
        crossChainHops:[],
      }}]};
      return {rows:[]};
    }),
  } as unknown as InvestingAuthorityTransactionClient;
  return {plan,client,queries,setWriteStatus:(s:string)=>{writeStatus=s;},
    badChain:()=>{badChain=true;},badReceipt:()=>{badReceipt=true;}};
}

describe("RL-10 scientific promotion idempotent writer boundary",()=>{
  beforeEach(()=>vi.clearAllMocks());
  it.each(["CREATED","REUSED_IDENTICAL"])("persists and reconstructs Stage-A plus closure %s with exact hashes",async(status)=>{
    const f=fixture(true);f.setWriteStatus(status);
    const saved=await persistScientificPromotionPlanV1(f.client,rootId,predecessor,f.plan);
    expect(saved).toMatchObject({
      status,stageATransitionIdentityId:stageId,closureTransitionIdentityId:closureId,
      scientificState:"PROMOTION_ELIGIBLE",stageAHashHex:stageHash,
      closureHashHex:closureHash,
    });
    expect(f.queries).toHaveLength(2);
    expect(f.queries[0]!.params).toEqual([rootId,stageHash,
      JSON.stringify(f.plan.stageA.transition),closureHash,
      JSON.stringify(f.plan.closure?.transition)]);
    expect(f.queries[1]!.params).toEqual([rootId]);
    expect(f.queries.every(x=>x.sql.startsWith("select investing."))).toBe(true);
  });
  it("writes Stage-A and closure atomically as one writer call",async()=>{
    const f=fixture(true);
    const saved=await persistScientificPromotionPlanV1(f.client,rootId,predecessor,f.plan);
    expect(saved).toMatchObject({
      status:"CREATED",stageATransitionIdentityId:stageId,
      closureTransitionIdentityId:closureId,
      scientificState:"PROMOTION_ELIGIBLE",closureHashHex:closureHash,
    });
    expect(f.queries).toHaveLength(2);
    expect(f.queries[0]!.params[3]).toBe(closureHash);
    expect(f.queries[0]!.params[4]).toBe(JSON.stringify(f.plan.closure?.transition));
  });
  it("does not freeze an immutable root on INSUFFICIENT_EVIDENCE",async()=>{
    const f=fixture();
    await expect(persistScientificPromotionPlanV1(f.client,rootId,predecessor,f.plan))
      .rejects.toThrow("PROMOTION_EVIDENCE_UNAVAILABLE");
    expect(f.queries).toHaveLength(0);
  });
  it("blocks incomplete evidence/invalid lineage before touching SQL",async()=>{
    const f=fixture(true);
    await expect(persistScientificPromotionPlanV1(f.client,"invalid",predecessor,f.plan))
      .rejects.toThrow("PROMOTION_PLAN_NOT_WRITABLE");
    const invalid={...f.plan,stageA:{
      ...f.plan.stageA,transitionRef:{hashHex:"E".repeat(64)},
    }} as ScientificPromotionEvaluationPlanV1;
    await expect(persistScientificPromotionPlanV1(f.client,rootId,predecessor,invalid))
      .rejects.toThrow("PROMOTION_PLAN_LINEAGE_INVALID");
    const closed={kind:"FAIL_CLOSED",reason:"UNKNOWN_RL7_CLASSIFICATION"} as ScientificPromotionEvaluationPlanV1;
    await expect(persistScientificPromotionPlanV1(f.client,rootId,predecessor,closed))
      .rejects.toThrow("PROMOTION_PLAN_NOT_WRITABLE");
    expect(f.queries).toHaveLength(0);
  });
  it("returns conflict on divergent immutable successor; no successful receipt",async()=>{
    const f=fixture(true);f.setWriteStatus("DIVERGENT_EXISTING_IDENTITY");
    await expect(persistScientificPromotionPlanV1(f.client,rootId,predecessor,f.plan))
      .rejects.toThrow("PROMOTION_WRITER_CONFLICT");
    expect(f.queries).toHaveLength(1);
  });
  it("blocks malformed writer receipt or tampered reconstruction",async()=>{
    const f=fixture(true);f.badReceipt();
    await expect(persistScientificPromotionPlanV1(f.client,rootId,predecessor,f.plan))
      .rejects.toThrow("PROMOTION_WRITER_RECEIPT_INVALID");
    const g=fixture(true);g.badChain();
    await expect(persistScientificPromotionPlanV1(g.client,rootId,predecessor,g.plan))
      .rejects.toThrow("PROMOTION_POSTWRITE_CHAIN_INVALID");
  });
});
