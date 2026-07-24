import "server-only";

export {
  createInvestingApplicationBoundaryV1,
  type InvestingApplicationServerDependenciesV1,
} from "@/lib/investing/application/factory.server";
export type {
  InvestingApplicationCanonicalSourcePortV1,
  InvestingApplicationIntegrityGuardPortV1,
  InvestingApplicationScopeAuthorizerPortV1,
} from "@/lib/investing/application/ports";
