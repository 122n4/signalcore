import {describe,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("@/lib/investing/research/contracts",async(importOriginal)=>{
 const actual=await importOriginal<typeof import("@/lib/investing/research/contracts")>();
 return {...actual,validateScientificDecision:(value:unknown)=>({ok:true as const,value})};
});
import {recordScientificMemory} from
 "@/lib/investing/research/scientific-memory/engine.server";
import {validateScientificMemoryInput} from
 "@/lib/investing/research/scientific-memory/runtimeValidation";
import {validateScientificMemoryEvent} from
 "@/lib/investing/research/scientific-memory/persistedValidation.server";
import {ScientificMemoryService} from
 "@/lib/investing/research/scientific-memory/service.server";
import {SCIENTIFIC_MEMORY_INPUT_VERSION,SCIENTIFIC_MEMORY_PROFILE_VERSION,
 SCIENTIFIC_MEMORY_REPETITION_REQUEST_VERSION,SCIENTIFIC_MEMORY_REQUEST_VERSION}
 from "@/lib/investing/research/scientific-memory";
const scope={contractVersion:"investing-research-scope/v1",authenticatedUserId:"user",
 membershipId:"member",tenantId:"tenant",ownerId:"owner",portfolioId:"portfolio",
 accountId:"account"};
const scientificScope={tenantId:"tenant",ownerId:"owner",portfolioId:"portfolio",
 accountId:"account"};
const decision=(outcome="rejected")=>({scope,scientificScope,decisionId:`decision-${outcome}`,
 validationReport:{reportId:"report"},hypothesisId:"hypothesis",hypothesisVersion:"v1",
 candidateId:"candidate",candidateVersion:"v1",experimentId:"experiment",runId:"run",
 outcome,evidenceIds:["evidence"],reasonCodes:["reason"]});
const profile={contractVersion:SCIENTIFIC_MEMORY_PROFILE_VERSION,profileId:"memory",
 profileVersion:"v1",maximumAttemptsPerFamily:3,maximumRejectedPerFamily:2,
 maximumInconclusivePerFamily:2};
const input=(outcome="rejected")=>({contractVersion:SCIENTIFIC_MEMORY_INPUT_VERSION,
 decision:decision(outcome),profile,prior:[],recordedAt:"2027-01-01T00:00:00.000Z",
 recordedBy:{id:"memory",version:"v1"}});
describe("Phase 6L scientific memory",()=>{
 it("records deterministic positive and negative knowledge",()=>{
  const negative=recordScientificMemory(input());
  const positive=recordScientificMemory(input("validated"));
  expect(negative).toEqual(recordScientificMemory(input()));
  expect(negative.ok&&negative.value.knowledge).toBe("negative");
  expect(positive.ok&&positive.value.knowledge).toBe("positive");
 });
 it("saturates a family deterministically and preserves prior decisions",()=>{
  const value=input();value.prior=[{decisionId:"old",outcome:"rejected",
   recordedAt:"2026-01-01T00:00:00.000Z"}];
  const result=recordScientificMemory(value);
  expect(result.ok&&result.value.familyState).toBe("saturated");
  expect(result.ok&&result.value.attemptOrdinal).toBe(2);
 });
 it.each([null,undefined,1,[],Symbol("x"),new Date(),Object.create({polluted:true})])
 ("rejects adversarial input without throws",value=>{
  expect(()=>validateScientificMemoryInput(value)).not.toThrow();
  expect(validateScientificMemoryInput(value).ok).toBe(false);
 });
 it("does not execute getters and reconstructs mutable input",()=>{
  let calls=0;const malicious={...input(),get prior(){calls++;return [];}};
  expect(validateScientificMemoryInput(malicious).ok).toBe(false);expect(calls).toBe(0);
  const value=input();const parsed=validateScientificMemoryInput(value);
  expect(parsed.ok).toBe(true);if(parsed.ok){value.profile.profileId="changed";
   expect(parsed.value.profile.profileId).toBe("memory");}
 });
 it("fully revalidates persisted content and its hash",()=>{
  const result=recordScientificMemory(input());if("reason"in result)throw new Error(result.reason);
  expect(validateScientificMemoryEvent(result.value).ok).toBe(true);
  expect(validateScientificMemoryEvent({...result.value,knowledge:"positive"}).ok).toBe(false);
 });
 it("authorizes before IO, checks full scope, and reuses an existing decision event",async()=>{
  const event=recordScientificMemory(input());if("reason"in event)throw new Error(event.reason);
  const repository={getByDecision:vi.fn(async()=>event.value),getDecision:vi.fn(),
   listFamily:vi.fn(),recordAtomic:vi.fn(),get:vi.fn(),list:vi.fn()};
  const service=new ScientificMemoryService(repository as never,{authorize:async()=>({
   ok:true as const,value:{authenticatedUserId:"user",membershipId:"member",
    scope:scientificScope}})},{load:vi.fn()},vi.fn());
  const result=await service.record({contractVersion:SCIENTIFIC_MEMORY_REQUEST_VERSION,
   decisionId:"decision-rejected",recordedAt:"2027-02-01T00:00:00.000Z",
   recordedBy:{id:"memory",version:"v1"}});
  expect(result.ok&&"event"in result.value&&result.value.reused).toBe(true);
  expect(repository.getDecision).not.toHaveBeenCalled();
 });
 it("rejects malformed requests before repository IO",async()=>{
  const repository={getByDecision:vi.fn(),getDecision:vi.fn(),listFamily:vi.fn(),
   recordAtomic:vi.fn(),get:vi.fn(),list:vi.fn()};
  const service=new ScientificMemoryService(repository as never,{authorize:async()=>({
   ok:true as const,value:{authenticatedUserId:"user",membershipId:"member",
    scope:scientificScope}})},{load:vi.fn()},vi.fn());
  expect(await service.record({})).toEqual({ok:false,
   reason:"scientific_memory_request_invalid"});
  expect(repository.getByDecision).not.toHaveBeenCalled();
 });
 it("blocks an exact repeat and a saturated family through an explicit gate",async()=>{
  const first=recordScientificMemory(input());if("reason"in first)throw new Error(first.reason);
  const repository={getByDecision:vi.fn(),getDecision:vi.fn(),
   listFamily:vi.fn(async()=>[first.value]),recordAtomic:vi.fn(),get:vi.fn(),list:vi.fn()};
  const authorization={authorize:async()=>({ok:true as const,value:{
   authenticatedUserId:"user",membershipId:"member",scope:scientificScope}})};
  const service=new ScientificMemoryService(repository as never,authorization,
   {load:vi.fn()},vi.fn());
  const base={contractVersion:SCIENTIFIC_MEMORY_REPETITION_REQUEST_VERSION,
   hypothesisId:"hypothesis",hypothesisVersion:"v1",candidateId:"candidate",
   candidateVersion:"v1",experimentId:"experiment"};
  await expect(service.checkRepetition(base)).resolves.toMatchObject({
   ok:true,value:{allowed:false,reason:"exact_repeat"}});
  repository.listFamily.mockResolvedValue([{...first.value,familyState:"saturated",
   candidateId:"other"}]);
  await expect(service.checkRepetition({...base,candidateId:"new"})).resolves.toMatchObject({
   ok:true,value:{allowed:false,reason:"family_saturated"}});
 });
});
