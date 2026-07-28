import "server-only";

import { InvestingIdentityApplicationGatewayV1 } from "@/lib/investing/identity/gateway.server";
import type {
  InvestingAuthenticatedSessionPortV1,
  InvestingIdentityScopeResolverPortV1,
  InvestingPhase5AApplicationBoundaryPortV1,
  InvestingScopeDirectoryPortV1,
} from "@/lib/investing/identity/ports";
import { InvestingIdentityScopeResolverV1 } from "@/lib/investing/identity/resolver.server";

export type InvestingIdentityServerDependenciesV1 = Readonly<{
  session: InvestingAuthenticatedSessionPortV1;
  directory: InvestingScopeDirectoryPortV1;
  application: InvestingPhase5AApplicationBoundaryPortV1;
}>;

export type InvestingIdentityResolverDependenciesV1 = Readonly<{
  session: InvestingAuthenticatedSessionPortV1;
  directory: InvestingScopeDirectoryPortV1;
}>;

function method(value: unknown, name: string) {
  return Boolean(
    value
    && typeof value === "object"
    && typeof (value as Record<string, unknown>)[name] === "function",
  );
}

export function createInvestingIdentityScopeResolverV1(
  dependencies: InvestingIdentityResolverDependenciesV1,
): InvestingIdentityScopeResolverPortV1 {
  if (
    !dependencies
    || !method(dependencies.session, "resolve")
    || !method(dependencies.directory, "findMemberships")
    || !method(dependencies.directory, "findPortfolios")
  ) {
    throw new Error("identity_scope_not_authorized");
  }
  return new InvestingIdentityScopeResolverV1(
    dependencies.session,
    dependencies.directory,
  );
}

export function createInvestingIdentityGatewayV1(
  dependencies: InvestingIdentityServerDependenciesV1,
) {
  if (
    !dependencies
    || !method(dependencies.session, "resolve")
    || !method(dependencies.directory, "findMemberships")
    || !method(dependencies.directory, "findPortfolios")
    || !method(dependencies.application, "createCanonicalRun")
    || !method(dependencies.application, "getRun")
    || !method(dependencies.application, "getLatestRun")
    || !method(dependencies.application, "verifyRun")
    || !method(dependencies.application, "replayRun")
  ) {
    throw new Error("identity_scope_not_authorized");
  }
  return new InvestingIdentityApplicationGatewayV1(
    createInvestingIdentityScopeResolverV1(dependencies),
    dependencies.application,
  );
}
