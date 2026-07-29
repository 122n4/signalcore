import "server-only";
import {createInvestingIdentityScopeResolverV1,
  type InvestingAuthenticatedSessionPortV1,type InvestingScopeDirectoryPortV1}
  from "@/lib/investing/identity/server";
import type {ScopedSqlPool} from "../dataset-catalog/postgresRepository.server";
import {PostgresBacktestCatalogRepository} from "./postgresCatalogRepository.server";
import {BacktestApplicationService,type BacktestAuthorizationPort} from "./service.server";

const operations={
  create:"create_research_experiment",
  queue:"queue_research_backtest",
  cancel:"cancel_research_backtest",
  get_experiment:"get_research_experiment",
  get_run:"get_research_experiment_run",
  list:"list_research_experiments",
} as const;
export type BacktestCompositionDependencies=Readonly<{
  session:InvestingAuthenticatedSessionPortV1;
  directory:InvestingScopeDirectoryPortV1;
  database:ScopedSqlPool;
  emit:(event:Readonly<Record<string,unknown>>)=>Promise<void>;
}>;
export function createBacktestApplicationServiceV1(dependencies:BacktestCompositionDependencies){
  if(!dependencies||typeof dependencies.session?.resolve!=="function"
    ||typeof dependencies.directory?.findMemberships!=="function"
    ||typeof dependencies.directory?.findPortfolios!=="function"
    ||typeof dependencies.database?.connect!=="function"
    ||typeof dependencies.emit!=="function")throw new Error("backtest_composition_invalid");
  const resolver=createInvestingIdentityScopeResolverV1(dependencies);
  const authorization:BacktestAuthorizationPort={
    async authorize(operation){
      try{
        const identity=await resolver.resolve(operations[operation]);
        if(typeof identity.membershipId!=="string")throw new Error("membership_unavailable");
        return {ok:true,value:{authenticatedUserId:identity.authenticatedUserId,
          membershipId:identity.membershipId,scope:{tenantId:identity.tenantId,
            ownerId:identity.ownerId,portfolioId:identity.portfolioId,
            accountId:identity.accountId}}};
      }catch{return {ok:false,reason:"backtest_scope_not_authorized"};}
    },
  };
  return new BacktestApplicationService(
    new PostgresBacktestCatalogRepository(dependencies.database),
    authorization,dependencies.emit);
}
