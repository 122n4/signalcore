import { describe,expect,it,vi } from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("../lib/investing/research/researchPassportService",()=>({readResearchPassportServiceV1:vi.fn()}));
import { classifyResearchRunRecoveryV1, inspectResearchRunRecoveryForCurrentUserV1 } from "../lib/investing/research/runRecoveryInspector";
import { readResearchPassportServiceV1 } from "../lib/investing/research/researchPassportService";
import type { ResearchPassportV1 } from "../lib/investing/research/researchPassportReader";
const inv="11111111-1111-4111-8111-111111111111",input="22222222-2222-4222-8222-222222222222";
const runId="33333333-3333-4333-8333-333333333333",result="44444444-4444-4444-8444-444444444444";
function fixture(state:"REGISTERED"|"STARTED"|"SUCCEEDED"|"FAILED"){
 const events=["REGISTERED",...(state==="REGISTERED"?[]:["STARTED"]),
   ...(["SUCCEEDED","FAILED"].includes(state)?[state]:[])];
 return {
  investigation:{researchInvestigationId:inv},
  runInputs:[{runInputIdentityId:input}],
  executionRuns:[{
    researchExecutionRunId:runId,runInputIdentityId:input,terminalState:state,
    resultIdentityId:state==="SUCCEEDED"?result:null,
    failureReasonCode:state==="FAILED"?"UNSUPPORTED_ENGINE":null,
    events:events.map((s,i)=>({
      eventSequence:i+1,runStatus:s,
      resultIdentityId:s==="SUCCEEDED"?result:null,
      failureReasonCode:s==="FAILED"?"UNSUPPORTED_ENGINE":null,
    })),
  }],
  results:state==="SUCCEEDED"?[{resultIdentityId:result,runInputIdentityId:input}]:[],
  evidence:state==="SUCCEEDED"?[{resultIdentityId:result}]:[],
 } as unknown as ResearchPassportV1;
}
describe("RL-10 owner-run recovery read-only classification",()=>{
 it.each(["REGISTERED","STARTED"] as const)("blocks automatic retry of %s",s=>{
   const p=classifyResearchRunRecoveryV1(fixture(s));
   expect(p.retryAuthorized).toBe(false);
   expect(p.workerLiveness).toBe("UNAVAILABLE");
   expect(p.runs[0]).toMatchObject({nextAction:"BLOCKED_MANUAL_RECONCILIATION",recoveryState:"RECONCILIATION_REQUIRED"});
 });
 it.each(["SUCCEEDED","FAILED"] as const)("does not retry terminal %s",s=>{
   const p=classifyResearchRunRecoveryV1(fixture(s));
   expect(p.runs[0]).toMatchObject({nextAction:"NO_RETRY",recoveryState:s==="SUCCEEDED"?"OBSERVED_SUCCEEDED":"OBSERVED_FAILED"});
 });
 it("rejects orphaned Result and event tampering",()=>{
   const v=fixture("SUCCEEDED");
   expect(()=>classifyResearchRunRecoveryV1({...v,evidence:[]})).toThrow("RECOVERY_SOURCE_INVALID");
   expect(()=>classifyResearchRunRecoveryV1({...v,runInputs:[]})).toThrow("RECOVERY_SOURCE_INVALID");
   expect(()=>classifyResearchRunRecoveryV1({...v,executionRuns:[{...v.executionRuns[0]!,events:[]}]})).toThrow("RECOVERY_SOURCE_INVALID");
 });
 it("uses the authorized read result and refuses substituted Investigation",async()=>{
   vi.mocked(readResearchPassportServiceV1).mockResolvedValueOnce({ok:true,passport:fixture("STARTED")});
   expect((await inspectResearchRunRecoveryForCurrentUserV1({
     researchInvestigationId:inv,correlationId:"corr-a",
   })).ok).toBe(true);
   vi.mocked(readResearchPassportServiceV1).mockResolvedValueOnce({ok:true,passport:fixture("FAILED")});
   expect(await inspectResearchRunRecoveryForCurrentUserV1({
     researchInvestigationId:"66666666-6666-4666-8666-666666666666",correlationId:"corr-b",
   })).toEqual({ok:false,code:"INTERNAL_ERROR"});
   vi.mocked(readResearchPassportServiceV1).mockResolvedValueOnce({
     ok:false,code:"FORBIDDEN_OR_NOT_FOUND",externalCode:"FORBIDDEN_OR_NOT_FOUND",
   } as never);
   expect(await inspectResearchRunRecoveryForCurrentUserV1({
     researchInvestigationId:inv,correlationId:"corr-c",
   })).toMatchObject({ok:false,code:"FORBIDDEN_OR_NOT_FOUND"});
 });
});
