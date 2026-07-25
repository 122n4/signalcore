import "server-only";

import type {
  InvestingAuthenticatedSessionPortV1,
  InvestingPhase5AApplicationBoundaryPortV1,
  InvestingScopeDirectoryPortV1,
} from "@/lib/investing/identity/ports";
import { InvestingIdentityScopeResolverV1 } from "@/lib/investing/identity/resolver.server";
import { InvestingPaperCallerV1 } from "@/lib/investing/paper-caller/caller.server";

export type InvestingPaperCallerServerDependenciesV1 = Readonly<{
  session: InvestingAuthenticatedSessionPortV1;
  directory: InvestingScopeDirectoryPortV1;
  application: InvestingPhase5AApplicationBoundaryPortV1;
}>;

function method(value: unknown, name: string): boolean {
  return Boolean(
    value
    && typeof value === "object"
    && typeof (value as Record<string, unknown>)[name] === "function",
  );
}

export function createInvestingPaperCallerV1(
  dependencies: InvestingPaperCallerServerDependenciesV1,
): InvestingPaperCallerV1 {
  if (
    !dependencies
    || !method(dependencies.session, "resolve")
    || !method(dependencies.directory, "findMemberships")
    || !method(dependencies.directory, "findPortfolios")
    || !method(dependencies.application, "createCanonicalRun")
  ) {
    throw new Error("paper_caller_dependency_unavailable");
  }
  return new InvestingPaperCallerV1({
    identityResolver: new InvestingIdentityScopeResolverV1(
      dependencies.session,
      dependencies.directory,
    ),
    application: dependencies.application,
  });
}
