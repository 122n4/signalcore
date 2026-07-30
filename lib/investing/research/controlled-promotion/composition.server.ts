import "server-only";
import {createInvestingIdentityScopeResolverV1,type InvestingAuthenticatedSessionPortV1,
 type InvestingScopeDirectoryPortV1} from "@/lib/investing/identity/server";
import type {ScopedSqlPool} from "../dataset-catalog/postgresRepository.server";
import {PostgresControlledPromotionRepository} from "./postgresRepository.server";
import {ControlledPromotionService,type ControlledPromotionAuthorizationPort,
 type ControlledPromotionProfilePort} from "./service.server";
const operations={evaluate:"evaluate_research_promotion_eligibility",
 prepare:"prepare_research_promotion_request",revoke:"revoke_research_promotion",
 get:"get_research_promotion_request",list:"list_research_promotion_requests"} as const;
export function createControlledPromotionServiceV1(dependencies:Readonly<{
 session:InvestingAuthenticatedSessionPortV1;directory:InvestingScopeDirectoryPortV1;
 database:ScopedSqlPool;profiles:ControlledPromotionProfilePort;
 emit:(event:Readonly<Record<string,unknown>>)=>Promise<void>}>){
 const resolver=createInvestingIdentityScopeResolverV1(dependencies);
 const authorization:ControlledPromotionAuthorizationPort={async authorize(operation){
  try{const i=await resolver.resolve(operations[operation]);
   if(!i.membershipId)throw new Error("membership_unavailable");
   return {ok:true,value:{authenticatedUserId:i.authenticatedUserId,
    membershipId:i.membershipId,scope:{tenantId:i.tenantId,ownerId:i.ownerId,
     portfolioId:i.portfolioId,accountId:i.accountId}}};
  }catch{return {ok:false,reason:"promotion_scope_not_authorized"};}
 }};
 return new ControlledPromotionService(new PostgresControlledPromotionRepository(
  dependencies.database),authorization,dependencies.profiles,dependencies.emit);
}
