import {describe,expect,it,vi} from "vitest";vi.mock("server-only",()=>({}));
import {ResearchOpsService} from "@/lib/investing/research/ops/service.server";
import {PostgresResearchOpsRepository} from
 "@/lib/investing/research/ops/postgresRepository.server";
const scope={tenantId:"tenant",ownerId:"owner",portfolioId:"portfolio",accountId:"account"};
describe("Phase 6N research ops",()=>{
 it("authorizes before IO and fails closed",async()=>{
  const read=vi.fn();const service=new ResearchOpsService({read},{authorize:async()=>({
   ok:false as const,reason:"research_ops_scope_not_authorized"})},()=>"2027-03-01T00:00:00.000Z");
  await expect(service.load()).resolves.toEqual({ok:false,
   reason:"research_ops_scope_not_authorized"});expect(read).not.toHaveBeenCalled();
 });
 it("reconstructs a read-only snapshot detached from repository rows",async()=>{
  const row={category:"datasets" as const,state:"research_ready",count:1};
  const recent={category:"datasets" as const,id:"dataset",state:"research_ready",
   occurredAt:null,reasonCode:null};
  const service=new ResearchOpsService({read:async()=>({counts:[row],recent:[recent]})},
   {authorize:async()=>({ok:true as const,value:{authenticatedUserId:"user",scope}})},
   ()=>"2027-03-01T00:00:00.000Z");const result=await service.load();
  expect(result.ok&&result.value.notices).toEqual(["read_only",
   "no_scientific_decision_writes","no_ui_promotion"]);
  if(result.ok){expect(result.value.scope).not.toBe(scope);
   expect(result.value.counts[0]).not.toBe(row);expect(result.value.recent[0]).not.toBe(recent);}
 });
 it("uses a read-only transaction and full scope for every projection",async()=>{
  const query=vi.fn(async(text:string,params?:readonly unknown[])=>{
   void params;
   if(text.startsWith("select ")&&!text.includes("set_config"))return {rows:[],rowCount:0};
   return {rows:[],rowCount:0};});
  const release=vi.fn();const repository=new PostgresResearchOpsRepository({
   connect:async()=>({query,release})});
  await repository.read(scope,"user");
  expect(query.mock.calls[0]?.[0]).toBe("begin read only");
  expect(query.mock.calls[1]).toEqual([
   "select set_config('request.jwt.claims',$1,true)",['{"sub":"user"}']]);
  expect(query.mock.calls[2]?.[0]).toBe("set local role authenticated");
  for(const [sql,params] of query.mock.calls.slice(3,-1)
   .filter(([sql])=>sql.includes("from public."))){
   expect(sql).toMatch(/tenant_id=\$1[\s\S]+owner_id=\$2[\s\S]+portfolio_id=\$3[\s\S]+account_id=\$4/u);
   expect(params).toEqual(["tenant","owner","portfolio","account"]);
   expect(sql).not.toMatch(/canonical_payload|canonical_result|lease_token|provider/u);
  }
  expect(query.mock.calls.at(-1)?.[0]).toBe("commit");expect(release).toHaveBeenCalled();
 });
 it("rolls back and sanitizes repository failure",async()=>{
  const query=vi.fn().mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({rows:[]})
   .mockRejectedValueOnce(new Error("postgres secret")).mockResolvedValue({rows:[]});
  const repository=new PostgresResearchOpsRepository({connect:async()=>({query})});
  const service=new ResearchOpsService(repository,{authorize:async()=>({
   ok:true as const,value:{authenticatedUserId:"user",scope}})},
   ()=>"2027-03-01T00:00:00.000Z");
  await expect(service.load()).resolves.toEqual({ok:false,reason:"research_ops_read_failed"});
  expect(query).toHaveBeenCalledWith("rollback");
 });
 it("projects revocations and counts all failures before recent limits",async()=>{
  const query=vi.fn(async(sql:string)=>{
   if(sql.includes("investing_research_acquisition_jobs")&&sql.includes("count(*)"))
    return {rows:[{state:"acquisition_failed",count:"37"}],rowCount:1};
   if(sql.includes("promotion_requests")&&sql.includes("count(*)"))
    return {rows:[{state:"promotion_revoked",count:"2"}],rowCount:1};
   if(sql.includes("promotion_requests")&&sql.includes("coalesce"))
    return {rows:[{id:"request",state:"promotion_revoked",
     occurred_at:"2027-03-01T00:00:00.000Z",reason_code:"operator_revoked"}],rowCount:1};
   return {rows:[],rowCount:0};
  });
  const repository=new PostgresResearchOpsRepository({connect:async()=>({query})});
  const result=await repository.read(scope,"user");
  expect(result.counts).toContainEqual({category:"promotions",
   state:"promotion_revoked",count:2});
  expect(result.counts).toContainEqual({category:"failures",state:"observed",count:39});
  expect(result.recent).toContainEqual(expect.objectContaining({category:"promotions",
   state:"promotion_revoked",reasonCode:"operator_revoked"}));
 });
});
