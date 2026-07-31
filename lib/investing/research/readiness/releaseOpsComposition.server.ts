import "server-only";import {Pool} from "pg";import {createProductionInvestingIdentityScopeResolverV1} from
 "@/lib/investing/identity/server";import {ReleaseReadinessOpsRepository,ReleaseReadinessOpsService} from "./releaseOps.server";
let service:ReleaseReadinessOpsService|null=null;export function createProductionReleaseReadinessOpsServiceV1(){if(service)return service;
 const connectionString=process.env.SUPABASE_DB_URL??"";const resolver=createProductionInvestingIdentityScopeResolverV1({connectionString});
 const authorization={async authorize(){try{const identity=await resolver.resolve("view_research_lab_ops");if(!identity.membershipId)throw 0;
  return {ok:true as const}}catch{return {ok:false as const,reason:"release_readiness_ops_not_authorized"}}}};
 service=new ReleaseReadinessOpsService(new ReleaseReadinessOpsRepository(new Pool({connectionString,max:2,
  application_name:"investing-release-readiness-ops"})),authorization,()=>new Date().toISOString());return service}
