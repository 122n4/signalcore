import "server-only";

import {
  createInvestingIdentityScopeResolverV1,
  type InvestingAuthenticatedSessionPortV1,
  type InvestingScopeDirectoryPortV1,
} from "@/lib/investing/identity/server";
import type {
  DatasetClockPort,
  DatasetEventSink,
} from "./events.server";
import {
  PostgresDatasetCatalogRepository,
  type ScopedSqlPool,
} from "./postgresRepository.server";
import {
  DatasetCatalogService,
  type DatasetAuthorizationPort,
} from "./service.server";

const IDENTITY_OPERATION = {
  create_requirement: "create_dataset_requirement",
  request_acquisition: "request_dataset_acquisition",
  get_acquisition: "get_dataset_acquisition",
  cancel_acquisition: "cancel_dataset_acquisition",
  transition_acquisition: "transition_dataset_acquisition",
  publish_version: "publish_dataset_version",
  list_datasets: "list_datasets",
  get_dataset_version: "get_dataset_version",
} as const;

export type DatasetCatalogCompositionDependenciesV1 = Readonly<{
  session: InvestingAuthenticatedSessionPortV1;
  directory: InvestingScopeDirectoryPortV1;
  database: ScopedSqlPool;
  events: DatasetEventSink;
  clock: DatasetClockPort;
}>;

function method(value: unknown, name: string): boolean {
  return Boolean(
    value
    && typeof value === "object"
    && typeof (value as Record<string, unknown>)[name] === "function",
  );
}

function validateDependencies(
  dependencies: DatasetCatalogCompositionDependenciesV1,
): void {
  if (
    !dependencies
    || !method(dependencies.session, "resolve")
    || !method(dependencies.directory, "findMemberships")
    || !method(dependencies.directory, "findPortfolios")
    || !method(dependencies.database, "connect")
    || !method(dependencies.events, "emit")
    || !method(dependencies.clock, "now")
  ) {
    throw new Error("dataset_catalog_composition_dependency_unavailable");
  }
}

export function createDatasetCatalogAuthorizationPortV1(
  dependencies: Pick<
    DatasetCatalogCompositionDependenciesV1,
    "session" | "directory"
  >,
): DatasetAuthorizationPort {
  if (
    !dependencies
    || !method(dependencies.session, "resolve")
    || !method(dependencies.directory, "findMemberships")
    || !method(dependencies.directory, "findPortfolios")
  ) {
    throw new Error("dataset_catalog_composition_dependency_unavailable");
  }
  const resolver = createInvestingIdentityScopeResolverV1(dependencies);
  return {
    async authorize(_untrustedInput, operation) {
      try {
        const identity = await resolver.resolve(IDENTITY_OPERATION[operation]);
        return {
          ok: true,
          value: {
            authenticatedUserId: identity.authenticatedUserId,
            scope: {
              tenantId: identity.tenantId,
              ownerId: identity.ownerId,
              portfolioId: identity.portfolioId,
              accountId: identity.accountId,
            },
          },
        };
      } catch {
        return {
          ok: false,
          issues: [{
            path: "identity",
            reasonCode: "dataset_scope_mismatch",
          }],
        };
      }
    },
  };
}

export function createDatasetCatalogServiceV1(
  dependencies: DatasetCatalogCompositionDependenciesV1,
): DatasetCatalogService {
  validateDependencies(dependencies);
  return new DatasetCatalogService(
    new PostgresDatasetCatalogRepository(dependencies.database),
    dependencies.events,
    createDatasetCatalogAuthorizationPortV1(dependencies),
    dependencies.clock,
  );
}
