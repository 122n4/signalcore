import "server-only";

export {
  createInvestingIdentityGatewayV1,
  createInvestingIdentityScopeResolverV1,
  type InvestingIdentityResolverDependenciesV1,
  type InvestingIdentityServerDependenciesV1,
} from "@/lib/investing/identity/factory.server";
export {
  createProductionInvestingIdentityScopeResolverV1,
  type ProductionInvestingIdentityResolverOptionsV1,
} from "@/lib/investing/identity/infrastructure/factory.server";
export type {
  InvestingAuthenticatedSessionPortV1,
  InvestingAuthorizedPortfolioV1,
  InvestingIdentityScopeResolverPortV1,
  InvestingPhase5AApplicationBoundaryPortV1,
  InvestingScopeDirectoryPortV1,
  InvestingTenantMembershipV1,
} from "@/lib/investing/identity/ports";
