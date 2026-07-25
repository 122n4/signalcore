import "server-only";

import type {
  InvestingAuthenticatedSessionPortV1,
  InvestingScopeDirectoryPortV1,
} from "@/lib/investing/identity/ports";
import { InvestingIdentityScopeResolverV1 } from "@/lib/investing/identity/resolver.server";
import {
  InvestingOpsOfficialServicesAdapterV1,
  type InvestingOpsOfficialServicesAdapterDependenciesV1,
} from "@/lib/investing/ops/adapter.server";
import type {
  InvestingOpsClockPortV1,
  InvestingOpsLogPortV1,
} from "@/lib/investing/ops/ports";
import { InvestingOpsServiceV1 } from "@/lib/investing/ops/service.server";

export type InvestingOpsServerDependenciesV1 =
  InvestingOpsOfficialServicesAdapterDependenciesV1 & Readonly<{
    session: InvestingAuthenticatedSessionPortV1;
    directory: InvestingScopeDirectoryPortV1;
    clock: InvestingOpsClockPortV1;
    logger: InvestingOpsLogPortV1;
  }>;

function method(value: unknown, name: string): boolean {
  return Boolean(
    value
    && typeof value === "object"
    && typeof (value as Record<string, unknown>)[name] === "function",
  );
}

export function createInvestingOpsServiceV1(
  dependencies: InvestingOpsServerDependenciesV1,
): InvestingOpsServiceV1 {
  if (
    !dependencies
    || !method(dependencies.session, "resolve")
    || !method(dependencies.directory, "findMemberships")
    || !method(dependencies.directory, "findPortfolios")
    || !method(dependencies.readModel, "readScope")
    || !method(dependencies.integrity, "inspectScope")
    || !method(dependencies.verifier, "inspectRun")
    || !method(dependencies.replay, "inspectRun")
    || !method(dependencies.clock, "now")
    || !method(dependencies.logger, "write")
  ) {
    throw new Error("ops_dependency_unavailable");
  }
  return new InvestingOpsServiceV1(
    new InvestingIdentityScopeResolverV1(dependencies.session, dependencies.directory),
    new InvestingOpsOfficialServicesAdapterV1(dependencies),
    dependencies.clock,
    dependencies.logger,
  );
}
