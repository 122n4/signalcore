import "server-only";

import {
  INVESTING_APPLICATION_RESPONSE_VERSION,
  type CreateCanonicalInvestingRunResponseV1,
  type InvestingApplicationContextV1,
  type InvestingApplicationErrorCodeV1,
  type InvestingApplicationOperationV1,
  type InvestingApplicationResultV1,
  type InvestingApplicationRunSummaryV1,
  type InvestingApplicationTargetV1,
  type InvestingReplayResponseV1,
  type InvestingRunQueryResponseV1,
} from "@/lib/investing/application/contracts";
import {
  InvestingApplicationErrorV1,
  applicationError,
  applicationFailure,
} from "@/lib/investing/application/errors";
import type {
  InvestingApplicationAuthorizedScopeV1,
  InvestingApplicationCanonicalSourcePortV1,
  InvestingApplicationIntegrityGuardPortV1,
  InvestingApplicationScopeAuthorizerPortV1,
} from "@/lib/investing/application/ports";
import {
  assertContextMatchesTargetV1,
  correlationIdFromUnknown,
  validateApplicationContextV1,
  validateCreateCanonicalRunCommandV1,
  validateLatestRunQueryV1,
  validateRunQueryV1,
} from "@/lib/investing/application/validation";
import {
  InvestingEnginePersistenceError,
  type InvestingEnginePersistenceInputV1,
  type InvestingEnginePersistenceServiceV1,
  type InvestingEngineReplayServiceV1,
  type InvestingEngineVerifiedLoadV1,
} from "@/lib/investing/engine/v1/persistence";

export type InvestingApplicationBoundaryDependenciesV1 = Readonly<{
  persistence: InvestingEnginePersistenceServiceV1;
  replay: InvestingEngineReplayServiceV1;
  canonicalSource: InvestingApplicationCanonicalSourcePortV1;
  scopeAuthorizer: InvestingApplicationScopeAuthorizerPortV1;
  integrityGuard: InvestingApplicationIntegrityGuardPortV1;
}>;

type FailureDomain = "persistence" | "verification" | "replay";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function mapError(error: unknown, domain: FailureDomain): InvestingApplicationErrorCodeV1 {
  if (error instanceof InvestingApplicationErrorV1) return error.code;
  if (error instanceof InvestingEnginePersistenceError) {
    if (error.code === "persistence_idempotency_conflict" || error.code === "persistence_run_conflict") {
      return "idempotency_conflict";
    }
    if (error.code === "persistence_not_found") return "run_not_found";
    if (domain === "replay") return "replay_failed";
    if (domain === "verification") return "verification_failed";
    return "canonical_persistence_failed";
  }
  return "internal_dependency_unavailable";
}

function assertPersistenceInputScope(
  input: InvestingEnginePersistenceInputV1,
  context: InvestingApplicationContextV1,
  scope: InvestingApplicationAuthorizedScopeV1,
) {
  const request = object(input.request);
  const engineContext = object(input.context);
  const canonicalInput = object(input.canonicalInput);
  const finalResult = object(input.finalResult);
  if (
    request.requestedUserId !== scope.ownerId
    || engineContext.ownerId !== scope.ownerId
    || engineContext.expectedUserId !== scope.ownerId
    || canonicalInput.userId !== scope.ownerId
    || finalResult.ownerId !== scope.ownerId
  ) {
    applicationError("owner_scope_mismatch");
  }
  if (canonicalInput.portfolioId !== scope.portfolioId) {
    applicationError("portfolio_scope_mismatch");
  }
  if (
    request.accountId !== scope.accountId
    || engineContext.expectedAccountId !== scope.accountId
    || canonicalInput.accountId !== scope.accountId
    || finalResult.accountId !== scope.accountId
  ) {
    applicationError("portfolio_scope_mismatch");
  }
  if (
    request.runId !== canonicalInput.runId
    || canonicalInput.runId !== finalResult.runId
  ) {
    applicationError("invalid_request");
  }
  if (
    context.idempotencyKey === null
    || input.idempotencyKey !== context.idempotencyKey
  ) {
    applicationError("idempotency_conflict");
  }
  if (
    request.environment === "live"
    || engineContext.environment === "live"
    || canonicalInput.environment === "live"
    || finalResult.environment === "live"
  ) {
    applicationError("live_operation_forbidden");
  }
  if (
    engineContext.accountMode !== "paper"
    || canonicalInput.environment !== "paper"
    || finalResult.executable !== false
  ) {
    applicationError("live_operation_forbidden");
  }
}

function summary(
  verified: InvestingEngineVerifiedLoadV1,
  scope: InvestingApplicationAuthorizedScopeV1,
): InvestingApplicationRunSummaryV1 {
  const canonicalInput = verified.parsedArtifacts.canonical_input;
  if (
    verified.loaded.run.identity.ownerId !== scope.ownerId
    || verified.loaded.run.identity.requestedUserId !== scope.ownerId
  ) {
    applicationError("owner_scope_mismatch");
  }
  if (
    verified.loaded.run.identity.accountId !== scope.accountId
    || canonicalInput.accountId !== scope.accountId
  ) {
    applicationError("portfolio_scope_mismatch");
  }
  if (canonicalInput.portfolioId !== scope.portfolioId) {
    applicationError("portfolio_scope_mismatch");
  }
  return {
    runId: verified.loaded.run.identity.runId,
    ownerId: scope.ownerId,
    tenantId: scope.tenantId,
    portfolioId: scope.portfolioId,
    accountId: scope.accountId,
    state: verified.loaded.run.state,
    quality: verified.loaded.run.quality,
    asOf: verified.loaded.run.identity.asOf,
    manifestHash: verified.manifest.manifestHash,
    finalResultHash: verified.manifest.finalResultHash,
    artifactCounts: verified.manifest.counts,
    verified: true,
  };
}

export class InvestingApplicationBoundaryV1 {
  constructor(private readonly dependencies: InvestingApplicationBoundaryDependenciesV1) {}

  private async execute<T>(
    rawContext: unknown,
    operation: InvestingApplicationOperationV1,
    domain: FailureDomain,
    executeOperation: (context: InvestingApplicationContextV1) => Promise<T>,
  ): Promise<InvestingApplicationResultV1<T>> {
    const candidateCorrelationId = correlationIdFromUnknown(rawContext);
    try {
      const context = validateApplicationContextV1(rawContext, operation);
      return { ok: true, value: await executeOperation(context) };
    } catch (error) {
      return applicationFailure(mapError(error, domain), candidateCorrelationId);
    }
  }

  private async authorize(
    context: InvestingApplicationContextV1,
    target: InvestingApplicationTargetV1,
  ): Promise<InvestingApplicationAuthorizedScopeV1> {
    assertContextMatchesTargetV1(context, target);
    let authorization;
    try {
      authorization = await this.dependencies.scopeAuthorizer.authorize({ context, target });
    } catch (error) {
      applicationError("internal_dependency_unavailable", error);
    }
    if (!authorization || typeof authorization !== "object") {
      applicationError("internal_dependency_unavailable");
    }
    if (!authorization.authorized) {
      if (![
        "owner_scope_mismatch",
        "tenant_scope_mismatch",
        "portfolio_scope_mismatch",
      ].includes(authorization.reason)) {
        applicationError("internal_dependency_unavailable");
      }
      applicationError(authorization.reason);
    }
    const scope = authorization.scope;
    if (
      scope.ownerId !== target.ownerId
      || scope.tenantId !== target.tenantId
      || scope.portfolioId !== target.portfolioId
      || scope.accountId !== target.accountId
    ) {
      applicationError("internal_dependency_unavailable");
    }
    return scope;
  }

  private async assertIntegrity(
    context: InvestingApplicationContextV1,
    scope: InvestingApplicationAuthorizedScopeV1,
  ) {
    let result;
    try {
      result = await this.dependencies.integrityGuard.inspect({ context, scope });
    } catch (error) {
      applicationError("internal_dependency_unavailable", error);
    }
    if (!result || (result.status !== "clean" && result.status !== "blocked")) {
      applicationError("internal_dependency_unavailable");
    }
    if (result.status === "blocked") applicationError("integrity_blocked");
  }

  private async loadRun(
    scope: InvestingApplicationAuthorizedScopeV1,
    runId: string,
  ) {
    return this.dependencies.persistence.reader.loadByRunId({
      ownerId: scope.ownerId,
      accountId: scope.accountId,
      runId,
    });
  }

  createCanonicalRun(
    rawContext: unknown,
    rawCommand: unknown,
  ): Promise<InvestingApplicationResultV1<CreateCanonicalInvestingRunResponseV1>> {
    return this.execute(rawContext, "create_canonical_run", "persistence", async (context) => {
      const command = validateCreateCanonicalRunCommandV1(rawCommand);
      const scope = await this.authorize(context, command.target);
      await this.assertIntegrity(context, scope);
      let resolved;
      try {
        resolved = await this.dependencies.canonicalSource.resolve({
          sourceReference: command.sourceReference,
          context,
          scope,
        });
      } catch (error) {
        applicationError("internal_dependency_unavailable", error);
      }
      if (!resolved) applicationError("invalid_request");
      assertPersistenceInputScope(resolved.persistenceInput, context, scope);
      const persisted = await this.dependencies.persistence.persist(resolved.persistenceInput);
      const verified = await this.loadRun(scope, persisted.runId);
      const outcomes = {
        inserted: {
          status: "created",
          idempotencyOutcome: "created",
          reasonCode: "canonical_run_created",
        },
        idempotent_existing: {
          status: "existing",
          idempotencyOutcome: "existing_same_payload",
          reasonCode: "canonical_run_existing",
        },
        recovered_after_ambiguous_commit: {
          status: "recovered",
          idempotencyOutcome: "recovered_after_ambiguous_commit",
          reasonCode: "canonical_run_recovered",
        },
      } as const;
      return {
        contractVersion: INVESTING_APPLICATION_RESPONSE_VERSION,
        operation: "create_canonical_run",
        correlationId: context.correlationId,
        ...outcomes[persisted.status],
        run: summary(verified, scope),
      };
    });
  }

  getRun(
    rawContext: unknown,
    rawQuery: unknown,
  ): Promise<InvestingApplicationResultV1<InvestingRunQueryResponseV1>> {
    return this.execute(rawContext, "get_run", "verification", async (context) => {
      const query = validateRunQueryV1(rawQuery);
      const scope = await this.authorize(context, query.target);
      const verified = await this.loadRun(scope, query.runId);
      return {
        contractVersion: INVESTING_APPLICATION_RESPONSE_VERSION,
        operation: "get_run",
        correlationId: context.correlationId,
        status: "complete",
        idempotencyOutcome: "not_applicable",
        reasonCode: "canonical_run_loaded",
        run: summary(verified, scope),
      };
    });
  }

  getLatestRun(
    rawContext: unknown,
    rawQuery: unknown,
  ): Promise<InvestingApplicationResultV1<InvestingRunQueryResponseV1>> {
    return this.execute(rawContext, "get_latest_run", "verification", async (context) => {
      const query = validateLatestRunQueryV1(rawQuery);
      const scope = await this.authorize(context, query.target);
      const verified = await this.dependencies.persistence.reader.loadLatest({
        ownerId: scope.ownerId,
        accountId: scope.accountId,
      });
      return {
        contractVersion: INVESTING_APPLICATION_RESPONSE_VERSION,
        operation: "get_latest_run",
        correlationId: context.correlationId,
        status: "complete",
        idempotencyOutcome: "not_applicable",
        reasonCode: "canonical_run_loaded",
        run: summary(verified, scope),
      };
    });
  }

  verifyRun(
    rawContext: unknown,
    rawQuery: unknown,
  ): Promise<InvestingApplicationResultV1<InvestingRunQueryResponseV1>> {
    return this.execute(rawContext, "verify_run", "verification", async (context) => {
      const query = validateRunQueryV1(rawQuery);
      const scope = await this.authorize(context, query.target);
      const verified = await this.loadRun(scope, query.runId);
      return {
        contractVersion: INVESTING_APPLICATION_RESPONSE_VERSION,
        operation: "verify_run",
        correlationId: context.correlationId,
        status: "verified",
        idempotencyOutcome: "not_applicable",
        reasonCode: "canonical_run_verified",
        run: summary(verified, scope),
      };
    });
  }

  replayRun(
    rawContext: unknown,
    rawQuery: unknown,
  ): Promise<InvestingApplicationResultV1<InvestingReplayResponseV1>> {
    return this.execute(rawContext, "replay_run", "replay", async (context) => {
      const query = validateRunQueryV1(rawQuery);
      const scope = await this.authorize(context, query.target);
      const verified = await this.loadRun(scope, query.runId);
      summary(verified, scope);
      const replayed = await this.dependencies.replay.replay({
        ownerId: scope.ownerId,
        accountId: scope.accountId,
        runId: query.runId,
      });
      if (replayed.status === "replay_blocked_by_integrity_error") {
        applicationError("integrity_blocked");
      }
      if (
        replayed.status !== "replay_match"
        || !replayed.manifestHash
        || !replayed.persistedFinalResultHash
        || !replayed.replayedFinalResultHash
      ) {
        applicationError("replay_failed");
      }
      return {
        contractVersion: INVESTING_APPLICATION_RESPONSE_VERSION,
        operation: "replay_run",
        correlationId: context.correlationId,
        status: "replay_match",
        idempotencyOutcome: "not_applicable",
        reasonCode: "canonical_replay_match",
        runId: query.runId,
        ownerId: scope.ownerId,
        tenantId: scope.tenantId,
        portfolioId: scope.portfolioId,
        accountId: scope.accountId,
        manifestHash: replayed.manifestHash,
        persistedFinalResultHash: replayed.persistedFinalResultHash,
        replayedFinalResultHash: replayed.replayedFinalResultHash,
        writes: "none",
      };
    });
  }
}
