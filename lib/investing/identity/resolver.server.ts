import "server-only";

import {
  INVESTING_IDENTITY_CONTEXT_VERSION,
  INVESTING_IDENTITY_PERMISSIONS,
  type InvestingIdentityOperationV1,
  type InvestingIdentityPermissionV1,
  type ResolvedInvestingIdentityContextV1,
} from "@/lib/investing/identity/contracts";
import { identityResolutionError } from "@/lib/investing/identity/errors";
import type {
  InvestingAuthenticatedSessionPortV1,
  InvestingScopeDirectoryPortV1,
  InvestingTenantMembershipV1,
} from "@/lib/investing/identity/ports";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,191}$/u;

const REQUIRED_PERMISSION: Readonly<
  Record<InvestingIdentityOperationV1, InvestingIdentityPermissionV1>
> = {
  create_canonical_run: "investing:create",
  get_run: "investing:read",
  get_latest_run: "investing:read",
  verify_run: "investing:verify",
  replay_run: "investing:replay",
  create_dataset_requirement: "investing:create",
  request_dataset_acquisition: "investing:create",
  get_dataset_acquisition: "investing:read",
  cancel_dataset_acquisition: "investing:create",
  transition_dataset_acquisition: "investing:create",
  publish_dataset_version: "investing:create",
  evaluate_dataset_quality: "investing:create",
  get_dataset_quality_report: "investing:read",
  list_dataset_quality_reports: "investing:read",
  list_datasets: "investing:read",
  get_dataset_version: "investing:read",
  create_research_hypothesis: "investing:create",
  transition_research_hypothesis: "investing:create",
  get_research_hypothesis: "investing:read",
  list_research_hypotheses: "investing:read",
  create_strategy_candidate: "investing:create",
  transition_strategy_candidate: "investing:create",
  get_strategy_candidate: "investing:read",
  list_strategy_candidates: "investing:read",
  create_research_experiment: "investing:create",
  queue_research_backtest: "investing:create",
  cancel_research_backtest: "investing:create",
  get_research_experiment: "investing:read",
  get_research_experiment_run: "investing:read",
  list_research_experiments: "investing:read",
  create_research_validation_report: "investing:create",
  get_research_validation_report: "investing:read",
  list_research_validation_reports: "investing:read",
  create_research_scientific_decision: "investing:create",
  get_research_scientific_decision: "investing:read",
  list_research_scientific_decisions: "investing:read",
  create_research_portfolio_risk_capacity_assessment: "investing:create",
  get_research_portfolio_risk_capacity_assessment: "investing:read",
  list_research_portfolio_risk_capacity_assessments: "investing:read",
  create_research_scientific_memory_event: "investing:create",
  get_research_scientific_memory_event: "investing:read",
  list_research_scientific_memory_events: "investing:read",
  check_research_scientific_memory_repetition: "investing:read",
};

function identifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER.test(value);
}

function validMembership(
  membership: InvestingTenantMembershipV1,
  authenticatedUserId: string,
  permission: InvestingIdentityPermissionV1,
) {
  return Boolean(
    membership
    && membership.status === "active"
    && membership.authenticatedUserId === authenticatedUserId
    && identifier(membership.membershipId)
    && identifier(membership.ownerId)
    && identifier(membership.tenantId)
    && identifier(membership.role)
    && Array.isArray(membership.permissions)
    && membership.permissions.every((entry) =>
      INVESTING_IDENTITY_PERMISSIONS.includes(entry))
    && (
      membership.permissions.includes(permission)
      || membership.permissions.includes("investing:*")
    )
  );
}

export class InvestingIdentityScopeResolverV1 {
  constructor(
    private readonly session: InvestingAuthenticatedSessionPortV1,
    private readonly directory: InvestingScopeDirectoryPortV1,
  ) {}

  async resolve(
    operation: InvestingIdentityOperationV1,
  ): Promise<ResolvedInvestingIdentityContextV1> {
    const permission = REQUIRED_PERMISSION[operation];
    if (!permission) identityResolutionError();

    let session;
    let memberships;
    try {
      session = await this.session.resolve();
      if (
        !session
        || !identifier(session.authenticatedUserId)
        || !identifier(session.requestId)
      ) {
        identityResolutionError();
      }
      memberships = await this.directory.findMemberships(
        session.authenticatedUserId,
      );
    } catch (error) {
      identityResolutionError(error);
    }
    if (!Array.isArray(memberships)) identityResolutionError();

    const authorizedMemberships = memberships.filter((membership) =>
      validMembership(membership, session.authenticatedUserId, permission));
    if (authorizedMemberships.length !== 1) identityResolutionError();
    const membership = authorizedMemberships[0];

    let portfolios;
    try {
      portfolios = await this.directory.findPortfolios({
        authenticatedUserId: session.authenticatedUserId,
        ownerId: membership.ownerId,
        tenantId: membership.tenantId,
      });
    } catch (error) {
      identityResolutionError(error);
    }
    if (!Array.isArray(portfolios)) identityResolutionError();

    const allowed = portfolios.filter((portfolio) =>
      portfolio
      && portfolio.status === "active"
      && portfolio.investingEnabled === true
      && portfolio.ownerId === membership.ownerId
      && portfolio.tenantId === membership.tenantId
      && identifier(portfolio.portfolioId)
      && identifier(portfolio.accountId));
    if (allowed.length !== 1) identityResolutionError();
    const portfolio = allowed[0];

    return {
      contractVersion: INVESTING_IDENTITY_CONTEXT_VERSION,
      authenticatedUserId: session.authenticatedUserId,
      membershipId: membership.membershipId,
      ownerId: membership.ownerId,
      tenantId: membership.tenantId,
      portfolioId: portfolio.portfolioId,
      accountId: portfolio.accountId,
      role: membership.role,
      permissions: [...membership.permissions],
      requestId: session.requestId,
    };
  }
}
