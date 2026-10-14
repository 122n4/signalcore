import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../lib/investing/research/investigationService",()=>({createResearchInvestigationForCurrentUserV1:vi.fn()}));
vi.mock("../lib/investing/research/draftService",()=>({createResearchDraftForCurrentUserV1:vi.fn()}));
vi.mock("../lib/investing/research/materialRevisionService",()=>({
  createResearchDraftRevisionForCurrentUserV1:vi.fn(),
  createResearchHypothesisRevisionForCurrentUserV1:vi.fn(),
}));
vi.mock("../lib/investing/research/researchSpecRevisionService",()=>({createResearchSpecRevisionForCurrentUserV1:vi.fn()}));
vi.mock("../lib/investing/research/experimentBaselineService",()=>({createExperimentBaselineForCurrentUserV1:vi.fn()}));
vi.mock("../lib/investing/research/experimentVariantService",()=>({createExperimentVariantForCurrentUserV1:vi.fn()}));
vi.mock("../lib/investing/research/researchPassportService",()=>({readResearchPassportServiceV1:vi.fn()}));
vi.mock("../lib/investing/research/runRecoveryInspector",()=>({inspectResearchRunRecoveryForCurrentUserV1:vi.fn()}));
vi.mock("../lib/investing/research/scientificPromotionHistoryService",()=>({readScientificPromotionChainForCurrentUserV1:vi.fn()}));
vi.mock("../lib/investing/research/experimentComparisonWriter",()=>({writeExperimentComparisonV1:vi.fn()}));
vi.mock("../lib/investing/research/runInputScientificService",()=>({createScientificRunInputForCurrentUserV1:vi.fn()}));
vi.mock("../lib/investing/research/researchExecutionService",()=>({executeResearchRunCommandV1:vi.fn()}));
vi.mock("../lib/investing/research/serverDatasetMaterialProvider",()=>({createServerDatasetMaterialProviderV1:vi.fn()}));
vi.mock("../lib/investing/research/validationExecutionService",()=>({
  createValidationProtocolCommandV1:vi.fn(),
  executeValidationChildCommandV1:vi.fn(),
}));
vi.mock("../lib/investing/research/validationAggregateService",()=>({finalizeValidationResultCommandV1:vi.fn()}));
vi.mock("../lib/investing/research/validationAssessmentService",()=>({
  createValidationAssessmentProtocolCommandV1:vi.fn(),
  finalizeValidationAssessmentResultCommandV1:vi.fn(),
}));

import {
  executeHeadlessResearchCommandV1, headlessResearchCommandOperationsV1,
} from "../lib/investing/research/headlessResearchService";
import { createResearchInvestigationForCurrentUserV1 } from "../lib/investing/research/investigationService";
import { createResearchDraftForCurrentUserV1 } from "../lib/investing/research/draftService";
import {
  createResearchDraftRevisionForCurrentUserV1,
  createResearchHypothesisRevisionForCurrentUserV1,
} from "../lib/investing/research/materialRevisionService";
import { createResearchSpecRevisionForCurrentUserV1 } from "../lib/investing/research/researchSpecRevisionService";
import { createExperimentBaselineForCurrentUserV1 } from "../lib/investing/research/experimentBaselineService";
import { createExperimentVariantForCurrentUserV1 } from "../lib/investing/research/experimentVariantService";
import { readResearchPassportServiceV1 } from "../lib/investing/research/researchPassportService";
import { inspectResearchRunRecoveryForCurrentUserV1 } from "../lib/investing/research/runRecoveryInspector";
import { readScientificPromotionChainForCurrentUserV1 } from "../lib/investing/research/scientificPromotionHistoryService";
import { writeExperimentComparisonV1 } from "../lib/investing/research/experimentComparisonWriter";
import { createScientificRunInputForCurrentUserV1 } from "../lib/investing/research/runInputScientificService";
import { executeResearchRunCommandV1 } from "../lib/investing/research/researchExecutionService";
import { createServerDatasetMaterialProviderV1 } from "../lib/investing/research/serverDatasetMaterialProvider";
import { createValidationProtocolCommandV1, executeValidationChildCommandV1 } from "../lib/investing/research/validationExecutionService";
import { finalizeValidationResultCommandV1 } from "../lib/investing/research/validationAggregateService";
import {
  createValidationAssessmentProtocolCommandV1,
  finalizeValidationAssessmentResultCommandV1,
} from "../lib/investing/research/validationAssessmentService";

const id = "11111111-1111-4111-8111-111111111111";
const version = "RL10_HEADLESS_RESEARCH_COMMAND_V1";
const correlationId = "rl10-control-1";
const idempotencyKey = "rl10-idempotent-command-1";
const basis = { researchInvestigationId: id, correlationId, idempotencyKey };
const pointer = Object.freeze({ expectedDraftRevisionId: id });
const root = Object.freeze({ expectedRootRevisionId: id });
const all: Record<string, ReturnType<typeof vi.fn>> = {
  CREATE_INVESTIGATION: vi.mocked(createResearchInvestigationForCurrentUserV1),
  CREATE_DRAFT: vi.mocked(createResearchDraftForCurrentUserV1),
  REVISE_DRAFT: vi.mocked(createResearchDraftRevisionForCurrentUserV1),
  REVISE_HYPOTHESIS: vi.mocked(createResearchHypothesisRevisionForCurrentUserV1),
  REVISE_SPEC: vi.mocked(createResearchSpecRevisionForCurrentUserV1),
  CREATE_BASELINE_EXPERIMENT: vi.mocked(createExperimentBaselineForCurrentUserV1),
  CREATE_VARIANT_EXPERIMENT: vi.mocked(createExperimentVariantForCurrentUserV1),
  CREATE_RUN_INPUT: vi.mocked(createScientificRunInputForCurrentUserV1),
  EXECUTE_RUN: vi.mocked(executeResearchRunCommandV1),
  CREATE_VALIDATION_PROTOCOL: vi.mocked(createValidationProtocolCommandV1),
  EXECUTE_VALIDATION_CHILD: vi.mocked(executeValidationChildCommandV1),
  FINALIZE_VALIDATION_RESULT: vi.mocked(finalizeValidationResultCommandV1),
  CREATE_VALIDATION_ASSESSMENT_PROTOCOL: vi.mocked(createValidationAssessmentProtocolCommandV1),
  FINALIZE_VALIDATION_ASSESSMENT: vi.mocked(finalizeValidationAssessmentResultCommandV1),
  COMPARE_EXPERIMENTS: vi.mocked(writeExperimentComparisonV1),
  READ_PASSPORT: vi.mocked(readResearchPassportServiceV1),
  INSPECT_RUN_RECOVERY: vi.mocked(inspectResearchRunRecoveryForCurrentUserV1),
  READ_PROMOTION_CHAIN: vi.mocked(readScientificPromotionChainForCurrentUserV1),
};
const provider = Object.freeze({loadSeriesContent:vi.fn()});
const comparisonOutput = Object.freeze({
  ok:true,protocolIdentityId:id,resultIdentityId:id,
  protocolHash:"A".repeat(64),resultHash:"B".repeat(64),
});
const commands: Record<string, Record<string,unknown>> = {
  CREATE_INVESTIGATION: {sourceContext:"PURE_RESEARCH",tenantId:id,correlationId,idempotencyKey},
  CREATE_DRAFT: {...basis,draft:{schemaVersion:"DRAFT_V1"}},
  REVISE_DRAFT: {...basis,expectedRoot:root,expectedPointers:pointer,draft:{schemaVersion:"DRAFT_V1"}},
  REVISE_HYPOTHESIS: {...basis,expectedRoot:root,expectedPointers:pointer,hypothesis:{schemaVersion:"HYPOTHESIS_V1"}},
  REVISE_SPEC: {...basis,expectedRoot:root,expectedPointers:pointer,sourceDraftRevisionId:id,
    hypothesisRevisionId:null,spec:{schemaVersion:"SPEC_V1"}},
  CREATE_BASELINE_EXPERIMENT: {...basis,expectedPointers:pointer,experiment:{schemaVersion:"EXPERIMENT_V1"}},
  CREATE_VARIANT_EXPERIMENT: {...basis,expectedPointers:pointer,experiment:{schemaVersion:"EXPERIMENT_V1"}},
  CREATE_RUN_INPUT: {researchInvestigationId:id,researchExperimentId:id,correlationId,candidate:{schemaVersion:"RUN_INPUT_V1"}},
  EXECUTE_RUN: {researchInvestigationId:id,runInputIdentityId:id,correlationId},
  CREATE_VALIDATION_PROTOCOL: {researchInvestigationId:id,researchExperimentId:id,correlationId,candidate:{schemaVersion:"VALIDATION_PROTOCOL_V1"}},
  EXECUTE_VALIDATION_CHILD: {researchInvestigationId:id,researchValidationProtocolIdentityId:id,foldOrdinal:"0",phase:"TRAINING",correlationId},
  FINALIZE_VALIDATION_RESULT: {researchInvestigationId:id,researchValidationProtocolIdentityId:id,correlationId},
  CREATE_VALIDATION_ASSESSMENT_PROTOCOL: {researchInvestigationId:id,researchValidationProtocolIdentityId:id,correlationId,protocol:{schemaVersion:"VALIDATION_ASSESSMENT_PROTOCOL_V1"}},
  FINALIZE_VALIDATION_ASSESSMENT: {researchInvestigationId:id,researchValidationProtocolIdentityId:id,correlationId},
  COMPARE_EXPERIMENTS: {researchInvestigationId:id,correlationId,
    sources:{protocol:{schemaVersion:"EXPERIMENT_COMPARISON_PROTOCOL_V1"},
      referenceParameters:{},subjectParameters:{},neighborhoodResults:[]}},
  READ_PASSPORT: {researchInvestigationId:id,correlationId},
  INSPECT_RUN_RECOVERY: {researchInvestigationId:id,correlationId},
  READ_PROMOTION_CHAIN: {researchInvestigationId:id,rootTransitionIdentityId:id,correlationId},
};
function input(operation:string,command:unknown = commands[operation]) {
  return {schemaVersion:version,operation,command};
}
function totalCalls(){return Object.values(all).reduce((n,m)=>n+m.mock.calls.length,0);}
beforeEach(()=>{
  vi.resetAllMocks();
  vi.mocked(createServerDatasetMaterialProviderV1).mockReturnValue(provider);
  for(const fn of Object.values(all)) fn.mockResolvedValue({ok:true, identity:id});
  vi.mocked(writeExperimentComparisonV1).mockResolvedValue(comparisonOutput as never);
});

describe("RL-10 headless Investing Research entry point",()=>{
  it("exposes a finite, stable, explicit catalogue of authorized commands",()=>{
    expect(headlessResearchCommandOperationsV1).toEqual(Object.keys(commands));
    expect(Object.isFrozen(headlessResearchCommandOperationsV1)).toBe(true);
  });

  it.each(headlessResearchCommandOperationsV1)("calls ONLY the existing owner service: %s",async(operation)=>{
    const result=await executeHeadlessResearchCommandV1(input(operation));
    expect(result).toEqual({ok:true,operation,
      value:operation==="COMPARE_EXPERIMENTS" ? comparisonOutput : {ok:true,identity:id}});
    expect(totalCalls()).toBe(1);
    expect(all[operation]).toHaveBeenCalledOnce();
    const received=all[operation]!.mock.calls[0]![0] as Record<string,unknown>;
    expect(received).toEqual(operation === "EXECUTE_RUN" || operation === "EXECUTE_VALIDATION_CHILD"
      ? {...commands[operation],datasetMaterialProvider:provider} : commands[operation]);
    expect(received).not.toHaveProperty("authorizedContext");
    expect(received).not.toHaveProperty("database");
  });

  it("supports account scope through original server-authorized investigation service only",async()=>{
    const command={sourceContext:"USER_PORTFOLIO",accountId:id,idempotencyKey,correlationId};
    const result=await executeHeadlessResearchCommandV1(input("CREATE_INVESTIGATION",command));
    expect(result.ok).toBe(true);
    expect(vi.mocked(createResearchInvestigationForCurrentUserV1)).toHaveBeenCalledWith(command);
    expect(totalCalls()).toBe(1);
  });

  it("rejects all calls that attempt to smuggle new capability or trusted authority",async()=>{
    for(const op of headlessResearchCommandOperationsV1){
      for(const dangerous of [
        {authorizedContext:{role:"OWNER"}},
        {database:{query:async()=>({rows:[]})}},
        {tenantMembershipId:id},
        {datasetMaterialProvider:{load:()=>[]}},
        {serviceRole:true},
        {portfolioId:id},
      ]){
        const command={...commands[op],...dangerous};
        expect(await executeHeadlessResearchCommandV1(input(op,command)))
          .toEqual({ok:false,code:"VALIDATION_ERROR"});
      }
    }
    expect(totalCalls()).toBe(0);
  });

  it("never exposes Vault or unverified execution routes, even for a valid payload",async()=>{
    for(const op of [
      "BLIND_TRUTH_REGISTER","BLIND_TRUTH_REVEAL","BLIND_TRUTH_EVALUATE",
    ]){
      expect(await executeHeadlessResearchCommandV1(input(op,{...basis})))
        .toEqual({ok:false,code:"CAPABILITY_UNAVAILABLE"});
    }
    expect(totalCalls()).toBe(0);
  });

  it("rejects unknown commands, invalid versions, invalid scope and malformed identities",async()=>{
    for(const invalid of [
      null,[],42,{},input("UNKNOWN"),
      {...input("READ_PASSPORT"),schemaVersion:"RL9"},
      input("READ_PASSPORT",{...commands.READ_PASSPORT,researchInvestigationId:"not-id"}),
      input("READ_PASSPORT",{...commands.READ_PASSPORT,correlationId:""}),
      input("READ_PASSPORT",{...commands.READ_PASSPORT,idempotencyKey}),
      input("CREATE_INVESTIGATION",{...commands.CREATE_INVESTIGATION,sourceContext:"USER_PORTFOLIO"}),
      input("CREATE_INVESTIGATION",{sourceContext:"USER_PORTFOLIO",tenantId:id,idempotencyKey,correlationId}),
      input("CREATE_INVESTIGATION",{sourceContext:"PURE_RESEARCH",accountId:id,idempotencyKey,correlationId}),
      input("CREATE_INVESTIGATION",{sourceContext:"PURE_RESEARCH",tenantId:"untrusted",idempotencyKey,correlationId}),
    ]){
      expect(await executeHeadlessResearchCommandV1(invalid))
        .toEqual({ok:false,code:"VALIDATION_ERROR"});
    }
    expect(totalCalls()).toBe(0);
  });

  it("rejects getters, proto poisoning, symbol fields and property injection without calling services",async()=>{
    const req=input("READ_PASSPORT");
    const evil={...req};
    Object.defineProperty(evil,"command",{enumerable:true,get(){throw Error("EVALUATED_GETTER");}});
    expect(await executeHeadlessResearchCommandV1(evil)).toEqual({ok:false,code:"VALIDATION_ERROR"});
    const command={...commands.READ_PASSPORT};
    Object.defineProperty(command,"researchInvestigationId",{enumerable:true,get(){throw Error("ACCESSOR");}});
    expect(await executeHeadlessResearchCommandV1(input("READ_PASSPORT",command)))
      .toEqual({ok:false,code:"VALIDATION_ERROR"});
    const withSymbol={...req,[Symbol("unsafe")]:"bad"};
    expect(await executeHeadlessResearchCommandV1(withSymbol)).toEqual({ok:false,code:"VALIDATION_ERROR"});
    const prototype=Object.create({role:"OWNER"});
    Object.assign(prototype,req);
    expect(await executeHeadlessResearchCommandV1(prototype)).toEqual({ok:false,code:"VALIDATION_ERROR"});
    expect(totalCalls()).toBe(0);
  });

  it("preserves authorization failure semantics without exposing tenant existence or DB errors",async()=>{
    const cases=[
      [{ok:false,code:"UNAUTHENTICATED"},"UNAUTHENTICATED"],
      [{ok:false,code:"FORBIDDEN_OR_NOT_FOUND"},"FORBIDDEN_OR_NOT_FOUND"],
      [{ok:false,code:"IDEMPOTENCY_CONFLICT"},"CONFLICT"],
      [{ok:false,code:"PASSPORT_SOURCE_INTEGRITY_FAILURE",externalCode:"INTERNAL_ERROR"},"INTERNAL_ERROR"],
      [{ok:false,code:"DATABASE_ERROR",debug:{sql:"tenant_secrets"}},"INTERNAL_ERROR"],
    ] as const;
    for(const [native,code] of cases){
      vi.mocked(readResearchPassportServiceV1).mockResolvedValueOnce(native as never);
      const result=await executeHeadlessResearchCommandV1(input("READ_PASSPORT"));
      expect(result).toEqual({ok:false,code});
      expect(JSON.stringify(result)).not.toContain("tenant_secrets");
    }
  });

  it("fails closed on thrown writer error, invalid writer result or declared failure",async()=>{
    vi.mocked(createResearchDraftForCurrentUserV1).mockRejectedValueOnce(Error("DATABASE_PASSWORD"));
    expect(await executeHeadlessResearchCommandV1(input("CREATE_DRAFT")))
      .toEqual({ok:false,code:"INTERNAL_ERROR"});
    vi.mocked(createResearchDraftForCurrentUserV1).mockResolvedValueOnce(undefined as never);
    expect(await executeHeadlessResearchCommandV1(input("CREATE_DRAFT")))
      .toEqual({ok:false,code:"INTERNAL_ERROR"});
    vi.mocked(createResearchDraftForCurrentUserV1).mockResolvedValueOnce({ok:false,code:"FORBIDDEN_OR_NOT_FOUND"} as never);
    expect(await executeHeadlessResearchCommandV1(input("CREATE_DRAFT")))
      .toEqual({ok:false,code:"FORBIDDEN_OR_NOT_FOUND"});
  });

  it("rejects authority injection, invalid scientific IDs and extra idempotency fields for new owner-bound services",async()=>{
    for(const op of [
      "CREATE_RUN_INPUT","EXECUTE_RUN","CREATE_VALIDATION_PROTOCOL","EXECUTE_VALIDATION_CHILD","FINALIZE_VALIDATION_RESULT",
      "CREATE_VALIDATION_ASSESSMENT_PROTOCOL","FINALIZE_VALIDATION_ASSESSMENT",
    ]){
      expect(await executeHeadlessResearchCommandV1(input(op,{...commands[op],idempotencyKey})))
        .toEqual({ok:false,code:"VALIDATION_ERROR"});
      expect(await executeHeadlessResearchCommandV1(input(op,{...commands[op],researchInvestigationId:"invalid"})))
        .toEqual({ok:false,code:"VALIDATION_ERROR"});
      const selector = op === "EXECUTE_RUN" ? "runInputIdentityId"
        : op === "CREATE_RUN_INPUT" || op === "CREATE_VALIDATION_PROTOCOL"
        ? "researchExperimentId" : "researchValidationProtocolIdentityId";
      expect(await executeHeadlessResearchCommandV1(input(op,{...commands[op],[selector]:"invalid"})))
        .toEqual({ok:false,code:"VALIDATION_ERROR"});
    }
    expect(totalCalls()).toBe(0);
  });

  it("does not invoke execution when the server material directory is unavailable",async()=>{
    vi.mocked(createServerDatasetMaterialProviderV1).mockReturnValueOnce(null);
    expect(await executeHeadlessResearchCommandV1(input("EXECUTE_RUN")))
      .toEqual({ok:false,code:"CAPABILITY_UNAVAILABLE"});
    vi.mocked(createServerDatasetMaterialProviderV1).mockReturnValueOnce(null);
    expect(await executeHeadlessResearchCommandV1(input("EXECUTE_VALIDATION_CHILD")))
      .toEqual({ok:false,code:"CAPABILITY_UNAVAILABLE"});
    expect(totalCalls()).toBe(0);
  });
  it("rejects client-injected file roots and providers for execution",async()=>{
    for(const extra of [{directory:"/tmp"}, {datasetMaterialProvider:provider}, {provider:"api"}, {legacyResearchIrProof:{}}]){
      expect(await executeHeadlessResearchCommandV1(input("EXECUTE_RUN",{...commands.EXECUTE_RUN,...extra})))
        .toEqual({ok:false,code:"VALIDATION_ERROR"});
    }
    expect(totalCalls()).toBe(0);
  });
  it("rejects malformed fold ordinals and execution phases before calling any service",async()=>{
    const candidate = commands.EXECUTE_VALIDATION_CHILD;
    for(const foldOrdinal of ["-1","00","1.0","1e2","",0,null]){
      expect(await executeHeadlessResearchCommandV1(input("EXECUTE_VALIDATION_CHILD",{...candidate,foldOrdinal})))
        .toEqual({ok:false,code:"VALIDATION_ERROR"});
    }
    for(const phase of ["LIVE","BOTH","training",null,1]){
      expect(await executeHeadlessResearchCommandV1(input("EXECUTE_VALIDATION_CHILD",{...candidate,phase})))
        .toEqual({ok:false,code:"VALIDATION_ERROR"});
    }
    expect(totalCalls()).toBe(0);
  });
  it("never permits client-provided data providers or scientific authority in child execution",async()=>{
    const candidate=commands.EXECUTE_VALIDATION_CHILD;
    for(const extra of [{datasetMaterialProvider:provider},{datasetRoot:"/tmp"},{authorizedContext:{}},{serviceRole:true}]){
      expect(await executeHeadlessResearchCommandV1(input("EXECUTE_VALIDATION_CHILD",{...candidate,...extra})))
        .toEqual({ok:false,code:"VALIDATION_ERROR"});
    }
    expect(totalCalls()).toBe(0);
  });
  it("rejects comparison source injection and unverified top-level arguments",async()=>{
    const command=commands.COMPARE_EXPERIMENTS;
    for(const extra of [{database:{}},{authorizedContext:{}},{tenantId:id},{idempotencyKey}]) {
      expect(await executeHeadlessResearchCommandV1(input("COMPARE_EXPERIMENTS",{...command,...extra})))
        .toEqual({ok:false,code:"VALIDATION_ERROR"});
    }
    for(const sources of [
      null, {}, {protocol:{},referenceParameters:{},subjectParameters:{},neighborhoodResults:"fake"},
      {...(command.sources as object),database:{}},
      {...(command.sources as object),neighborhoodResults:[{experiment:{},result:{},authorizedContext:{}}]},
    ]) {
      expect(await executeHeadlessResearchCommandV1(input("COMPARE_EXPERIMENTS",{...command,sources})))
        .toEqual({ok:false,code:"VALIDATION_ERROR"});
    }
    expect(totalCalls()).toBe(0);
  });
  it("does not claim comparison success when the accepted persistence writer rejects it",async()=>{
    vi.mocked(writeExperimentComparisonV1).mockRejectedValueOnce(new Error("COMPARISON_AUTHORITY_REQUIRED"));
    expect(await executeHeadlessResearchCommandV1(input("COMPARE_EXPERIMENTS")))
      .toEqual({ok:false,code:"INTERNAL_ERROR"});
    expect(vi.mocked(writeExperimentComparisonV1)).toHaveBeenCalledOnce();
  });
  it("fails closed when scientific comparison returns malformed persisted identities",async()=>{
    for (const malformed of [
      undefined, null, {},
      {...comparisonOutput,protocolIdentityId:"invalid"},
      {...comparisonOutput,resultIdentityId:"invalid"},
      {...comparisonOutput,protocolHash:"unverified"},
      {...comparisonOutput,resultHash:"unverified"},
    ]) {
      vi.mocked(writeExperimentComparisonV1).mockResolvedValueOnce(malformed as never);
      expect(await executeHeadlessResearchCommandV1(input("COMPARE_EXPERIMENTS")))
        .toEqual({ok:false,code:"INTERNAL_ERROR"});
    }
  });
  it("recovery inspection refuses caller status, retry or authority injection",async()=>{
    for(const extra of [
      {runStatus:"FAILED"},{leaseId:id},{resume:true},{retry:true},{database:{}},{authorizedContext:{}},
    ]) {
      expect(await executeHeadlessResearchCommandV1(input("INSPECT_RUN_RECOVERY",{
        ...commands.INSPECT_RUN_RECOVERY,...extra,
      }))).toEqual({ok:false,code:"VALIDATION_ERROR"});
    }
    expect(totalCalls()).toBe(0);
  });
  it("keeps promotion history read-only, without caller-supplied evidence or mutation claims",async()=>{
    for (const extra of [
      {newPromotionState:"PROMOTION_ELIGIBLE"},
      {authority:{status:"VERIFIED"}},
      {evaluationPlan:{}},
      {database:{}},{serviceRole:true},{tenantId:id},
    ]) {
      expect(await executeHeadlessResearchCommandV1(input("READ_PROMOTION_CHAIN",{
        ...commands.READ_PROMOTION_CHAIN,...extra,
      }))).toEqual({ok:false,code:"VALIDATION_ERROR"});
    }
    expect(await executeHeadlessResearchCommandV1(input("READ_PROMOTION_CHAIN",{
      ...commands.READ_PROMOTION_CHAIN,rootTransitionIdentityId:"invalid",
    }))).toEqual({ok:false,code:"VALIDATION_ERROR"});
    expect(totalCalls()).toBe(0);
  });
  it("retains stable failure codes for existing validation owner writers",async()=>{
    vi.mocked(finalizeValidationResultCommandV1).mockResolvedValueOnce({
      ok:false,code:"VALIDATION_RESULT_CONCURRENT_CONFLICT",
    } as never);
    expect(await executeHeadlessResearchCommandV1(input("FINALIZE_VALIDATION_RESULT")))
      .toEqual({ok:false,code:"CONFLICT"});
    vi.mocked(createValidationProtocolCommandV1).mockResolvedValueOnce({
      ok:false,code:"UNAVAILABLE",
    } as never);
    expect(await executeHeadlessResearchCommandV1(input("CREATE_VALIDATION_PROTOCOL")))
      .toEqual({ok:false,code:"INTERNAL_ERROR"});
  });

  it("reuses the actual service idempotency authority rather than inventing a cross-command transaction",async()=>{
    const first=await executeHeadlessResearchCommandV1(input("CREATE_INVESTIGATION"));
    const second=await executeHeadlessResearchCommandV1(input("CREATE_INVESTIGATION"));
    expect(first).toEqual(second);
    expect(totalCalls()).toBe(2);
    expect(all.CREATE_INVESTIGATION.mock.calls[0]![0]).toEqual(all.CREATE_INVESTIGATION.mock.calls[1]![0]);
    expect(Object.keys(commands.CREATE_INVESTIGATION)).not.toContain("serviceRole");
  });
});
