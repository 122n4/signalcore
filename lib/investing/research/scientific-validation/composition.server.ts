import "server-only";
import {
  createInvestingIdentityScopeResolverV1,
  type InvestingAuthenticatedSessionPortV1,
  type InvestingScopeDirectoryPortV1,
} from "@/lib/investing/identity/server";
import type {ScopedSqlPool} from "../dataset-catalog/postgresRepository.server";
import {PostgresScientificValidationRepository} from "./postgresRepository.server";
import {
  ArtifactScientificValidationEvidenceCollector,
} from "./evidenceCollector.server";
import {ContentAddressedBacktestArtifactStorage} from "../backtesting/artifactStorage.server";
import {PostgresContentAddressedDatasetBars} from "./datasetBars.server";
import {
  ScientificValidationService,
  type ScientificValidationAuthorizationPort,
  type ScientificValidationProfilePort,
} from "./service.server";

const operations={
  create_report:"create_research_validation_report",
  create_decision:"create_research_scientific_decision",
  get_report:"get_research_validation_report",
  list_reports:"list_research_validation_reports",
  get_decision:"get_research_scientific_decision",
  list_decisions:"list_research_scientific_decisions",
} as const;
export function createScientificValidationServiceV1(dependencies:Readonly<{
  session:InvestingAuthenticatedSessionPortV1;
  directory:InvestingScopeDirectoryPortV1;
  database:ScopedSqlPool;
  profiles:ScientificValidationProfilePort;
  artifactStorageRoot:string;
  datasetStorageRoot:string;
  emit:(event:Readonly<Record<string,unknown>>)=>Promise<void>;
}>){
  if(!dependencies||typeof dependencies.session?.resolve!=="function"
    ||typeof dependencies.directory?.findMemberships!=="function"
    ||typeof dependencies.directory?.findPortfolios!=="function"
    ||typeof dependencies.database?.connect!=="function"
    ||typeof dependencies.profiles?.load!=="function"
    ||typeof dependencies.artifactStorageRoot!=="string"
    ||typeof dependencies.datasetStorageRoot!=="string"
    ||typeof dependencies.emit!=="function"){
    throw new Error("scientific_validation_composition_invalid");
  }
  const resolver=createInvestingIdentityScopeResolverV1(dependencies);
  const authorization:ScientificValidationAuthorizationPort={async authorize(operation){
    try{
      const identity=await resolver.resolve(operations[operation]);
      if(typeof identity.membershipId!=="string")throw new Error("membership_unavailable");
      return {ok:true,value:{authenticatedUserId:identity.authenticatedUserId,
        membershipId:identity.membershipId,scope:{tenantId:identity.tenantId,
          ownerId:identity.ownerId,portfolioId:identity.portfolioId,
          accountId:identity.accountId}}};
    }catch{return {ok:false,reason:"scientific_validation_scope_not_authorized"};}
  }};
  return new ScientificValidationService(
    new PostgresScientificValidationRepository(dependencies.database),
    authorization,dependencies.profiles,
    new ArtifactScientificValidationEvidenceCollector(
      new ContentAddressedBacktestArtifactStorage(dependencies.artifactStorageRoot),
      new PostgresContentAddressedDatasetBars(
        dependencies.database,dependencies.datasetStorageRoot)),
    dependencies.emit);
}
