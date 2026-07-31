import "server-only";import {Pool} from "pg";import {createProductionInvestingIdentityScopeResolverV1} from
 "@/lib/investing/identity/server";import {BetaActivationService} from "./activationBoundary.server";
import {PostgresBetaActivationRepository} from "./activationPostgresRepository.server";let service:BetaActivationService|null=null;
export function createProductionBetaActivationServiceV1(){if(service)return service;const connectionString=process.env.SUPABASE_DB_URL??"";
 const resolver=createProductionInvestingIdentityScopeResolverV1({connectionString});const authorization={async authorize(){try{
  const i=await resolver.resolve("operate_research_beta");if(!i.membershipId)throw 0;return {ok:true as const,value:{
   authenticatedUserId:i.authenticatedUserId,membershipId:i.membershipId,tenantId:i.tenantId,requestId:i.requestId}}}
  catch{return {ok:false as const,reason:"beta_activation_not_authorized"}}}};service=new BetaActivationService(authorization,
  new PostgresBetaActivationRepository(new Pool({connectionString,max:2,application_name:"investing-beta-activation"})));return service}
