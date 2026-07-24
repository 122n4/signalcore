import "server-only";

import {
  INVESTING_APPLICATION_CONTEXT_VERSION,
  INVESTING_APPLICATION_CREATE_RUN_VERSION,
  INVESTING_APPLICATION_LATEST_QUERY_VERSION,
  INVESTING_APPLICATION_RUN_QUERY_VERSION,
  type InvestingApplicationContextV1,
  type InvestingApplicationOperationV1,
  type InvestingApplicationTargetV1,
} from "@/lib/investing/application";
import {
  type CreateCanonicalInvestingRunGatewayResultV1,
  type InvestingIdentityOperationV1,
  type InvestingReplayGatewayResultV1,
  type InvestingRunQueryGatewayResultV1,
  type ResolvedInvestingIdentityContextV1,
} from "@/lib/investing/identity/contracts";
import { identityFailure } from "@/lib/investing/identity/errors";
import type {
  InvestingIdentityScopeResolverPortV1,
  InvestingPhase5AApplicationBoundaryPortV1,
} from "@/lib/investing/identity/ports";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,191}$/u;

function strictRecord(value: unknown, keys: readonly string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const actual = Object.keys(candidate).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    return null;
  }
  return candidate;
}

function identifier(value: unknown) {
  return typeof value === "string" && IDENTIFIER.test(value) ? value : null;
}

function target(scope: ResolvedInvestingIdentityContextV1): InvestingApplicationTargetV1 {
  return {
    ownerId: scope.ownerId,
    tenantId: scope.tenantId,
    portfolioId: scope.portfolioId,
    accountId: scope.accountId,
  };
}

function context(
  scope: ResolvedInvestingIdentityContextV1,
  operation: InvestingApplicationOperationV1,
  idempotencyKey: string | null,
): InvestingApplicationContextV1 {
  const create = operation === "create_canonical_run";
  return {
    contractVersion: INVESTING_APPLICATION_CONTEXT_VERSION,
    authenticatedOwnerId: scope.ownerId,
    tenantId: scope.tenantId,
    portfolioId: scope.portfolioId,
    correlationId: scope.requestId,
    idempotencyKey,
    requestedOperation: operation,
    applicationVersion: "investing-phase5b/v1",
    actorType: create ? "service_operator" : "authenticated_owner",
    executionMode: create
      ? "administrative_canonical_persistence"
      : "internal_validation",
  };
}

export class InvestingIdentityApplicationGatewayV1 {
  constructor(
    private readonly resolver: InvestingIdentityScopeResolverPortV1,
    private readonly application: InvestingPhase5AApplicationBoundaryPortV1,
  ) {}

  private async scope(operation: InvestingIdentityOperationV1) {
    return this.resolver.resolve(operation);
  }

  async createCanonicalRun(
    rawRequest: unknown,
  ): Promise<CreateCanonicalInvestingRunGatewayResultV1> {
    const request = strictRecord(rawRequest, ["sourceReference", "idempotencyKey"]);
    const sourceReference = identifier(request?.sourceReference);
    const idempotencyKey = identifier(request?.idempotencyKey);
    if (!sourceReference || !idempotencyKey) return identityFailure();
    try {
      const scope = await this.scope("create_canonical_run");
      return this.application.createCanonicalRun(
        context(scope, "create_canonical_run", idempotencyKey),
        {
          contractVersion: INVESTING_APPLICATION_CREATE_RUN_VERSION,
          sourceReference,
          target: target(scope),
        },
      );
    } catch {
      return identityFailure();
    }
  }

  async getRun(rawRequest: unknown): Promise<InvestingRunQueryGatewayResultV1> {
    return this.runOperation("get_run", rawRequest);
  }

  async verifyRun(rawRequest: unknown): Promise<InvestingRunQueryGatewayResultV1> {
    return this.runOperation("verify_run", rawRequest);
  }

  async replayRun(rawRequest: unknown): Promise<InvestingReplayGatewayResultV1> {
    const request = strictRecord(rawRequest, ["runId"]);
    const runId = identifier(request?.runId);
    if (!runId) return identityFailure();
    try {
      const scope = await this.scope("replay_run");
      return this.application.replayRun(
        context(scope, "replay_run", null),
        {
          contractVersion: INVESTING_APPLICATION_RUN_QUERY_VERSION,
          runId,
          target: target(scope),
        },
      );
    } catch {
      return identityFailure();
    }
  }

  async getLatestRun(rawRequest: unknown = {}): Promise<InvestingRunQueryGatewayResultV1> {
    if (!strictRecord(rawRequest, [])) return identityFailure();
    try {
      const scope = await this.scope("get_latest_run");
      return this.application.getLatestRun(
        context(scope, "get_latest_run", null),
        {
          contractVersion: INVESTING_APPLICATION_LATEST_QUERY_VERSION,
          target: target(scope),
        },
      );
    } catch {
      return identityFailure();
    }
  }

  private async runOperation(
    operation: "get_run" | "verify_run",
    rawRequest: unknown,
  ): Promise<InvestingRunQueryGatewayResultV1> {
    const request = strictRecord(rawRequest, ["runId"]);
    const runId = identifier(request?.runId);
    if (!runId) return identityFailure();
    try {
      const scope = await this.scope(operation);
      const args = [
        context(scope, operation, null),
        {
          contractVersion: INVESTING_APPLICATION_RUN_QUERY_VERSION,
          runId,
          target: target(scope),
        },
      ] as const;
      return operation === "get_run"
        ? this.application.getRun(...args)
        : this.application.verifyRun(...args);
    } catch {
      return identityFailure();
    }
  }
}
