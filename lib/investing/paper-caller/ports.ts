import type { InvestingPhase5AApplicationBoundaryPortV1 } from "@/lib/investing/identity/ports";
import type { InvestingIdentityScopeResolverPortV1 } from "@/lib/investing/identity/ports";

export type InvestingPaperCallerDependenciesV1 = Readonly<{
  identityResolver: InvestingIdentityScopeResolverPortV1;
  application: InvestingPhase5AApplicationBoundaryPortV1;
}>;
