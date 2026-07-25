import "server-only";

import {
  INVESTING_APPLICATION_CONTEXT_VERSION,
  INVESTING_APPLICATION_CREATE_RUN_VERSION,
  type InvestingApplicationContextV1,
  type InvestingApplicationTargetV1,
} from "@/lib/investing/application";
import { identityFailure } from "@/lib/investing/identity/errors";
import type { ResolvedInvestingIdentityContextV1 } from "@/lib/investing/identity";
import {
  paperCallerFailure,
} from "@/lib/investing/paper-caller/errors";
import type {
  InvestingPaperCallerResultV1,
} from "@/lib/investing/paper-caller/contracts";
import type {
  InvestingPaperCallerDependenciesV1,
} from "@/lib/investing/paper-caller/ports";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,191}$/u;
const REQUEST_KEYS = ["mode", "sourceReference", "idempotencyKey"] as const;

function strictRequest(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const request = value as Record<string, unknown>;
  const actual = Object.keys(request).sort();
  const expected = [...REQUEST_KEYS].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index])
    ? request
    : null;
}

function identifier(value: unknown): string | null {
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
  idempotencyKey: string,
): InvestingApplicationContextV1 {
  return {
    contractVersion: INVESTING_APPLICATION_CONTEXT_VERSION,
    authenticatedOwnerId: scope.ownerId,
    tenantId: scope.tenantId,
    portfolioId: scope.portfolioId,
    correlationId: scope.requestId,
    idempotencyKey,
    requestedOperation: "create_canonical_run",
    applicationVersion: "investing-phase5c-paper-caller/v1",
    actorType: "service_operator",
    executionMode: "administrative_canonical_persistence",
  };
}

export class InvestingPaperCallerV1 {
  constructor(private readonly dependencies: InvestingPaperCallerDependenciesV1) {}

  async start(rawRequest: unknown): Promise<InvestingPaperCallerResultV1> {
    let scope: ResolvedInvestingIdentityContextV1;
    try {
      scope = await this.dependencies.identityResolver.resolve("create_canonical_run");
    } catch {
      return identityFailure();
    }

    const request = strictRequest(rawRequest);
    if (!request) return paperCallerFailure("invalid_request", scope.requestId);
    if (request.mode !== "paper") {
      return paperCallerFailure("paper_mode_required", scope.requestId);
    }
    const sourceReference = identifier(request.sourceReference);
    const idempotencyKey = identifier(request.idempotencyKey);
    if (!sourceReference || !idempotencyKey) {
      return paperCallerFailure("invalid_request", scope.requestId);
    }

    return this.dependencies.application.createCanonicalRun(
      context(scope, idempotencyKey),
      {
        contractVersion: INVESTING_APPLICATION_CREATE_RUN_VERSION,
        sourceReference,
        target: target(scope),
      },
    );
  }
}
