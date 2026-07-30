import "server-only";
import {createInvestingIdentityScopeResolverV1,type InvestingAuthenticatedSessionPortV1,
 type InvestingScopeDirectoryPortV1} from "@/lib/investing/identity/server";
import type {ScopedSqlPool} from "../dataset-catalog/postgresRepository.server";
import {PostgresScientificMemoryRepository} from "./postgresRepository.server";
import {ScientificMemoryService,type ScientificMemoryAuthorizationPort,
 type ScientificMemoryProfilePort} from "./service.server";
const operations={create:"create_research_scientific_memory_event",
 get:"get_research_scientific_memory_event",list:"list_research_scientific_memory_events",
 check:"check_research_scientific_memory_repetition"} as const;
export function createScientificMemoryServiceV1(dependencies:Readonly<{
 session:InvestingAuthenticatedSessionPortV1;directory:InvestingScopeDirectoryPortV1;
 database:ScopedSqlPool;profiles:ScientificMemoryProfilePort;
 emit:(event:Readonly<Record<string,unknown>>)=>Promise<void>}>){
 const resolver=createInvestingIdentityScopeResolverV1(dependencies);
 const authorization:ScientificMemoryAuthorizationPort={async authorize(operation){
  try{const i=await resolver.resolve(operations[operation]);
   if(!i.membershipId)throw new Error("membership_unavailable");
   return {ok:true,value:{authenticatedUserId:i.authenticatedUserId,
    membershipId:i.membershipId,scope:{tenantId:i.tenantId,ownerId:i.ownerId,
     portfolioId:i.portfolioId,accountId:i.accountId}}};
  }catch{return {ok:false,reason:"scientific_memory_scope_not_authorized"};}
 }};
 return new ScientificMemoryService(new PostgresScientificMemoryRepository(
  dependencies.database),authorization,dependencies.profiles,dependencies.emit);
}
