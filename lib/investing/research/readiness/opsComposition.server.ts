import "server-only";
import {createInvestingIdentityScopeResolverV1,
 createProductionInvestingIdentityScopeResolverV1,type InvestingAuthenticatedSessionPortV1,
 type InvestingScopeDirectoryPortV1} from "@/lib/investing/identity/server";
import {Pool} from "pg";import type {ScopedSqlPool} from "../dataset-catalog/postgresRepository.server";
import {PostgresBetaReadinessOpsRepository} from "./postgresOpsRepository.server";
import {BetaReadinessOpsService,type BetaReadinessOpsAuthorizationPort} from "./opsService.server";
const authorization=(resolver:Readonly<{resolve(operation:"view_research_lab_ops"):
 Promise<Readonly<{membershipId?:string}>>}>):BetaReadinessOpsAuthorizationPort=>({async authorize(){
 try{const identity=await resolver.resolve("view_research_lab_ops");if(!identity.membershipId)throw 0;
  return {ok:true}}catch{return {ok:false,reason:"beta_readiness_ops_not_authorized"}}}});
export function createBetaReadinessOpsServiceV1(dependencies:Readonly<{
 session:InvestingAuthenticatedSessionPortV1;directory:InvestingScopeDirectoryPortV1;
 database:ScopedSqlPool;now?:()=>string}>){const resolver=createInvestingIdentityScopeResolverV1(dependencies);
 return new BetaReadinessOpsService(new PostgresBetaReadinessOpsRepository(dependencies.database),
  authorization(resolver),dependencies.now??(()=>new Date().toISOString()))}
let production:BetaReadinessOpsService|null=null;
export function createProductionBetaReadinessOpsServiceV1(){if(production)return production;
 const connectionString=process.env.SUPABASE_DB_URL??"";
 const resolver=createProductionInvestingIdentityScopeResolverV1({connectionString});
 const database=new Pool({connectionString,max:2,application_name:"investing-beta-readiness-ops"});
 production=new BetaReadinessOpsService(new PostgresBetaReadinessOpsRepository(database),
  authorization(resolver),()=>new Date().toISOString());return production}
