import "server-only";
import {
  createInvestingIdentityScopeResolverV1,type InvestingAuthenticatedSessionPortV1,
  type InvestingScopeDirectoryPortV1,
} from "@/lib/investing/identity/server";
import type {ScopedSqlPool} from "../dataset-catalog/postgresRepository.server";
import {ContentAddressedBacktestArtifactStorage} from
  "../backtesting/artifactStorage.server";
import {PostgresContentAddressedDatasetBars} from
  "../scientific-validation/datasetBars.server";
import {ArtifactPortfolioRiskEvidenceCollector} from "./evidenceCollector.server";
import {PostgresPortfolioRiskRepository} from "./postgresRepository.server";
import {
  PortfolioRiskService,type PortfolioRiskAuthorizationPort,
  type PortfolioRiskProfilePort,
} from "./service.server";

const operations={create:"create_research_portfolio_risk_capacity_assessment",
  get:"get_research_portfolio_risk_capacity_assessment",
  list:"list_research_portfolio_risk_capacity_assessments"} as const;
export function createPortfolioRiskServiceV1(dependencies:Readonly<{
  session:InvestingAuthenticatedSessionPortV1;
  directory:InvestingScopeDirectoryPortV1;
  database:ScopedSqlPool;
  profiles:PortfolioRiskProfilePort;
  artifactStorageRoot:string;
  datasetStorageRoot:string;
  emit:(event:Readonly<Record<string,unknown>>)=>Promise<void>;
}>){
  const resolver=createInvestingIdentityScopeResolverV1(dependencies);
  const authorization:PortfolioRiskAuthorizationPort={async authorize(operation){
    try{
      const identity=await resolver.resolve(operations[operation]);
      if(!identity.membershipId)throw new Error("membership_unavailable");
      return {ok:true,value:{authenticatedUserId:identity.authenticatedUserId,
        membershipId:identity.membershipId,scope:{tenantId:identity.tenantId,
          ownerId:identity.ownerId,portfolioId:identity.portfolioId,
          accountId:identity.accountId}}};
    }catch{return {ok:false,reason:"portfolio_risk_scope_not_authorized"};}
  }};
  return new PortfolioRiskService(
    new PostgresPortfolioRiskRepository(dependencies.database),authorization,
    dependencies.profiles,new ArtifactPortfolioRiskEvidenceCollector(
      new ContentAddressedBacktestArtifactStorage(dependencies.artifactStorageRoot),
      new PostgresContentAddressedDatasetBars(
        dependencies.database,dependencies.datasetStorageRoot)),dependencies.emit);
}
