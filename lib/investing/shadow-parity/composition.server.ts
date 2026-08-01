import "server-only";import {Pool} from "pg";import {createInvestingIdentityScopeResolverV1,createProductionInvestingIdentityScopeResolverV1,
 type InvestingAuthenticatedSessionPortV1,type InvestingScopeDirectoryPortV1} from "@/lib/investing/identity/server";
import type {ScopedSqlPool} from "@/lib/investing/research/dataset-catalog/postgresRepository.server";import {PostgresShadowParityRepository} from "./postgresRepository.server";
import {PostgresShadowParitySource} from "./sourcePostgres.server";import {ShadowParityService,type ShadowParityAuthorization} from "./service.server";
export const SHADOW_PARITY_OPERATOR_IDS_ENV="INVESTING_SHADOW_PARITY_OPERATOR_USER_IDS" as const;
export const SHADOW_PARITY_SCHEDULED_OPERATOR_ID_ENV="INVESTING_SHADOW_PARITY_SCHEDULED_OPERATOR_USER_ID" as const;
const user=/^user_[A-Za-z0-9_-]{1,128}$/u;export const authorizedOperator=(id:unknown,raw:unknown)=>typeof id==="string"&&user.test(id)
 &&typeof raw==="string"&&(()=>{const values=raw.split(",").map(v=>v.trim()).filter(Boolean);return values.length>0&&new Set(values).size===values.length
 &&values.every(v=>user.test(v))&&values.includes(id)})();
const authorization=(resolver:Readonly<{resolve(operation:"operate_investing_shadow_parity"):Promise<import("@/lib/investing/identity/contracts").ResolvedInvestingIdentityContextV1>}>,
 raw:()=>string|undefined):ShadowParityAuthorization=>({async authorize(){try{const identity=await resolver.resolve("operate_investing_shadow_parity");
  return authorizedOperator(identity.authenticatedUserId,raw())?{ok:true as const,identity}:{ok:false as const,reason:"shadow_parity_not_authorized"}}
 catch{return {ok:false as const,reason:"shadow_parity_not_authorized"}}}});
export function createShadowParityServiceV1(d:Readonly<{session:InvestingAuthenticatedSessionPortV1;directory:InvestingScopeDirectoryPortV1;
 database:ScopedSqlPool;operatorIds:()=>string|undefined}>){const resolver=createInvestingIdentityScopeResolverV1(d);return new ShadowParityService(authorization(resolver,d.operatorIds),
 new PostgresShadowParitySource(d.database),new PostgresShadowParityRepository(d.database))}
let production:ShadowParityService|null=null;export function createProductionShadowParityServiceV1(){if(production)return production;const connectionString=process.env.SUPABASE_DB_URL??"";
 const resolver=createProductionInvestingIdentityScopeResolverV1({connectionString}),database=new Pool({connectionString,max:3,application_name:"investing-shadow-parity"});
 production=new ShadowParityService(authorization(resolver,()=>process.env[SHADOW_PARITY_OPERATOR_IDS_ENV]),new PostgresShadowParitySource(database),new PostgresShadowParityRepository(database));return production}
let scheduled:ShadowParityService|null=null;export function createScheduledShadowParityServiceV1(){if(scheduled)return scheduled;const connectionString=process.env.SUPABASE_DB_URL??"",operatorId=process.env[SHADOW_PARITY_SCHEDULED_OPERATOR_ID_ENV];
 const resolver=createProductionInvestingIdentityScopeResolverV1({connectionString,readUser:async()=>operatorId??null});
 const database=new Pool({connectionString,max:3,application_name:"investing-shadow-parity-scheduled"});
 scheduled=new ShadowParityService(authorization(resolver,()=>operatorId),new PostgresShadowParitySource(database),new PostgresShadowParityRepository(database));return scheduled}
