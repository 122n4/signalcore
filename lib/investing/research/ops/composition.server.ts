import "server-only";
import {createInvestingIdentityScopeResolverV1,
 createProductionInvestingIdentityScopeResolverV1,
 type InvestingAuthenticatedSessionPortV1,type InvestingScopeDirectoryPortV1}
 from "@/lib/investing/identity/server";
import {Pool} from "pg";
import type {ScopedSqlPool} from "../dataset-catalog/postgresRepository.server";
import {PostgresResearchOpsRepository} from "./postgresRepository.server";
import {ResearchOpsService,type ResearchOpsAuthorizationPort} from "./service.server";
const authorization=(resolver:Readonly<{resolve(operation:"view_research_lab_ops"):
 Promise<Readonly<{authenticatedUserId:string;membershipId?:string;tenantId:string;ownerId:string;
 portfolioId:string;accountId:string}>>}>):ResearchOpsAuthorizationPort=>({async authorize(){
 try{const i=await resolver.resolve("view_research_lab_ops");if(!i.membershipId)throw 0;
  return {ok:true,value:{authenticatedUserId:i.authenticatedUserId,
   scope:{tenantId:i.tenantId,ownerId:i.ownerId,
   portfolioId:i.portfolioId,accountId:i.accountId}}};}
 catch{return {ok:false,reason:"research_ops_scope_not_authorized"};}
}});
export function createResearchOpsServiceV1(dependencies:Readonly<{
 session:InvestingAuthenticatedSessionPortV1;directory:InvestingScopeDirectoryPortV1;
 database:ScopedSqlPool;now?:()=>string}>){
 const resolver=createInvestingIdentityScopeResolverV1(dependencies);
 return new ResearchOpsService(new PostgresResearchOpsRepository(dependencies.database),
  authorization(resolver),dependencies.now??(()=>new Date().toISOString()));
}
let production:ResearchOpsService|null=null;
export function createProductionResearchOpsServiceV1(){
 if(production)return production;
 const connectionString=process.env.SUPABASE_DB_URL??"";
 const resolver=createProductionInvestingIdentityScopeResolverV1({connectionString});
 const database=new Pool({connectionString,max:4,application_name:"investing-research-ops"});
 production=new ResearchOpsService(new PostgresResearchOpsRepository(database),
  authorization(resolver),()=>new Date().toISOString());return production;
}
