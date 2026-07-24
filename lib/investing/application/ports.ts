import type {
  InvestingApplicationContextV1,
  InvestingApplicationErrorCodeV1,
  InvestingApplicationTargetV1,
} from "@/lib/investing/application/contracts";
import type { InvestingEnginePersistenceInputV1 } from "@/lib/investing/engine/v1/persistence";

export type InvestingApplicationAuthorizedScopeV1 = Readonly<{
  ownerId: string;
  tenantId: string;
  portfolioId: string;
  accountId: string;
}>;

export interface InvestingApplicationScopeAuthorizerPortV1 {
  authorize(args: Readonly<{
    context: InvestingApplicationContextV1;
    target: InvestingApplicationTargetV1;
  }>): Promise<
    | Readonly<{ authorized: true; scope: InvestingApplicationAuthorizedScopeV1 }>
    | Readonly<{
      authorized: false;
      reason:
        | "owner_scope_mismatch"
        | "tenant_scope_mismatch"
        | "portfolio_scope_mismatch";
    }>
  >;
}

/**
 * Administrative resolver for already validated engine material.
 * The opaque source reference is the only value exposed to a future caller;
 * canonical artifacts remain behind this server-side port.
 */
export interface InvestingApplicationCanonicalSourcePortV1 {
  resolve(args: Readonly<{
    sourceReference: string;
    context: InvestingApplicationContextV1;
    scope: InvestingApplicationAuthorizedScopeV1;
  }>): Promise<Readonly<{ persistenceInput: InvestingEnginePersistenceInputV1 }> | null>;
}

export interface InvestingApplicationIntegrityGuardPortV1 {
  inspect(args: Readonly<{
    context: InvestingApplicationContextV1;
    scope: InvestingApplicationAuthorizedScopeV1;
  }>): Promise<
    | Readonly<{ status: "clean" }>
    | Readonly<{ status: "blocked"; reasonCode: string }>
  >;
}

export type InvestingApplicationScopeFailureCodeV1 = Extract<
  InvestingApplicationErrorCodeV1,
  "owner_scope_mismatch" | "tenant_scope_mismatch" | "portfolio_scope_mismatch"
>;

