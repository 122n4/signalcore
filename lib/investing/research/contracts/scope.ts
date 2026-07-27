import type { RuntimeValidationResult } from "./primitives";

export const INVESTING_RESEARCH_SCOPE_VERSION =
  "investing-research-scope/v1" as const;

/**
 * A snapshot of scope already resolved by the official server identity boundary.
 * This contract never authorizes a client-provided scope.
 */
export type InvestingResearchScope = Readonly<{
  contractVersion: typeof INVESTING_RESEARCH_SCOPE_VERSION;
  authenticatedUserId: string;
  membershipId: string;
  tenantId: string;
  ownerId: string;
  portfolioId: string;
  accountId: string;
}>;

export type InvestingResearchScientificScope = Readonly<{
  tenantId: string;
  ownerId: string;
  portfolioId: string;
  accountId: string;
}>;

export function toInvestingResearchScientificScope(
  scope: InvestingResearchScope,
): InvestingResearchScientificScope {
  return {
    tenantId: scope.tenantId,
    ownerId: scope.ownerId,
    portfolioId: scope.portfolioId,
    accountId: scope.accountId,
  };
}

export function scientificResearchScopesEqual(
  left: InvestingResearchScientificScope,
  right: InvestingResearchScientificScope,
): boolean {
  return left.tenantId === right.tenantId
    && left.ownerId === right.ownerId
    && left.portfolioId === right.portfolioId
    && left.accountId === right.accountId;
}

export function researchScopesEqual(
  left: InvestingResearchScope,
  right: InvestingResearchScope,
): boolean {
  return left.contractVersion === right.contractVersion
    && left.authenticatedUserId === right.authenticatedUserId
    && left.membershipId === right.membershipId
    && left.tenantId === right.tenantId
    && left.ownerId === right.ownerId
    && left.portfolioId === right.portfolioId
    && left.accountId === right.accountId;
}

export type InvestingResearchScopedCommand<T> = Readonly<{
  scope: InvestingResearchScope;
  payload: T;
}>;

export type ScopeValidator = (
  value: unknown,
) => RuntimeValidationResult<InvestingResearchScope>;
