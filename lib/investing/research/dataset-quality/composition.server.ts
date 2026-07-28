import "server-only";

import {
  createInvestingIdentityScopeResolverV1,
  type InvestingAuthenticatedSessionPortV1,
  type InvestingScopeDirectoryPortV1,
} from "@/lib/investing/identity/server";
import type { ScopedSqlPool } from "../dataset-catalog/postgresRepository.server";
import { PostgresDatasetQualityRepository } from "./postgresRepository.server";
import { DatasetQualityService, type DatasetQualityEvents } from "./service.server";
import type { DatasetQualityEvidenceCollector } from "./service.server";

export type DatasetQualityCompositionDependencies = Readonly<{
  session: InvestingAuthenticatedSessionPortV1;
  directory: InvestingScopeDirectoryPortV1;
  database: ScopedSqlPool;
  events?: DatasetQualityEvents;
  evidenceCollector: DatasetQualityEvidenceCollector;
}>;

export function createDatasetQualityServiceV1(dependencies: DatasetQualityCompositionDependencies) {
  if (!dependencies || typeof dependencies.database?.connect !== "function"
    || typeof dependencies.evidenceCollector?.collect !== "function") {
    throw new Error("dataset_quality_composition_dependency_unavailable");
  }
  const resolver = createInvestingIdentityScopeResolverV1(dependencies);
  return new DatasetQualityService(
    new PostgresDatasetQualityRepository(dependencies.database),
    {
      async resolve(operation) {
        const identity = await resolver.resolve(operation);
        return {
          tenantId: identity.tenantId, ownerId: identity.ownerId,
          portfolioId: identity.portfolioId, accountId: identity.accountId,
        };
      },
    },
    dependencies.evidenceCollector,
    dependencies.events,
  );
}
