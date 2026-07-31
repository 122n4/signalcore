import "server-only";import {Pool} from "pg";import {createProductionInvestingIdentityScopeResolverV1} from
 "@/lib/investing/identity/server";import {ReleaseGateService} from "./releaseGate.server";import {PostgresReleaseGateRepository} from
 "./releaseGatePostgresRepository.server";import {createProductionTrustedBetaReadinessRuntime} from "./trustedComposition.server";
import {BETA_OPERATOR_USER_IDS_ENV,isAuthorizedBetaOperator} from "./operatorAuthorization.server";
let service:ReleaseGateService|null=null;export function createProductionReleaseGateServiceV1(){if(service)return service;
 const connectionString=process.env.SUPABASE_DB_URL??"";const resolver=createProductionInvestingIdentityScopeResolverV1({connectionString});
 const authorization={async authorize(){try{const i=await resolver.resolve("operate_research_beta");if(!i.membershipId
  ||!isAuthorizedBetaOperator(i.authenticatedUserId,process.env[BETA_OPERATOR_USER_IDS_ENV]))throw 0;
  return {ok:true as const,value:{authenticatedUserId:i.authenticatedUserId,membershipId:i.membershipId,requestId:i.requestId}}}
  catch{return {ok:false as const,reason:"release_gate_not_authorized"}}}};service=new ReleaseGateService(authorization,
  createProductionTrustedBetaReadinessRuntime(),new PostgresReleaseGateRepository(new Pool({connectionString,max:2,
   application_name:"investing-release-gate"})));return service}
