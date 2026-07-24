import type {
  CreateCanonicalInvestingRunResponseV1,
  InvestingApplicationContextV1,
  InvestingApplicationResultV1,
  InvestingApplicationTargetV1,
  InvestingReplayResponseV1,
  InvestingRunQueryResponseV1,
} from "@/lib/investing/application";
import type {
  InvestingIdentityOperationV1,
  InvestingIdentityPermissionV1,
  ResolvedInvestingIdentityContextV1,
} from "@/lib/investing/identity/contracts";

export type InvestingAuthenticatedSessionV1 = Readonly<{
  authenticatedUserId: string;
  requestId: string;
}>;

export type InvestingTenantMembershipV1 = Readonly<{
  membershipId: string;
  authenticatedUserId: string;
  ownerId: string;
  tenantId: string;
  role: string;
  permissions: readonly InvestingIdentityPermissionV1[];
  status: "active" | "inactive" | "revoked";
}>;

export type InvestingAuthorizedPortfolioV1 = Readonly<{
  portfolioId: string;
  accountId: string;
  ownerId: string;
  tenantId: string;
  status: "active" | "inactive" | "closed";
  investingEnabled: boolean;
}>;

export interface InvestingAuthenticatedSessionPortV1 {
  resolve(): Promise<InvestingAuthenticatedSessionV1 | null>;
}

export interface InvestingScopeDirectoryPortV1 {
  findMemberships(
    authenticatedUserId: string,
  ): Promise<readonly InvestingTenantMembershipV1[]>;
  findPortfolios(args: Readonly<{
    authenticatedUserId: string;
    ownerId: string;
    tenantId: string;
  }>): Promise<readonly InvestingAuthorizedPortfolioV1[]>;
}

export interface InvestingIdentityScopeResolverPortV1 {
  resolve(
    operation: InvestingIdentityOperationV1,
  ): Promise<ResolvedInvestingIdentityContextV1>;
}

export interface InvestingPhase5AApplicationBoundaryPortV1 {
  createCanonicalRun(
    context: InvestingApplicationContextV1,
    command: Readonly<{
      contractVersion: "investing-application-create-run/v1";
      sourceReference: string;
      target: InvestingApplicationTargetV1;
    }>,
  ): Promise<InvestingApplicationResultV1<CreateCanonicalInvestingRunResponseV1>>;
  getRun(
    context: InvestingApplicationContextV1,
    query: Readonly<{
      contractVersion: "investing-application-run-query/v1";
      runId: string;
      target: InvestingApplicationTargetV1;
    }>,
  ): Promise<InvestingApplicationResultV1<InvestingRunQueryResponseV1>>;
  getLatestRun(
    context: InvestingApplicationContextV1,
    query: Readonly<{
      contractVersion: "investing-application-latest-query/v1";
      target: InvestingApplicationTargetV1;
    }>,
  ): Promise<InvestingApplicationResultV1<InvestingRunQueryResponseV1>>;
  verifyRun(
    context: InvestingApplicationContextV1,
    query: Readonly<{
      contractVersion: "investing-application-run-query/v1";
      runId: string;
      target: InvestingApplicationTargetV1;
    }>,
  ): Promise<InvestingApplicationResultV1<InvestingRunQueryResponseV1>>;
  replayRun(
    context: InvestingApplicationContextV1,
    query: Readonly<{
      contractVersion: "investing-application-run-query/v1";
      runId: string;
      target: InvestingApplicationTargetV1;
    }>,
  ): Promise<InvestingApplicationResultV1<InvestingReplayResponseV1>>;
}
