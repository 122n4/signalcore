import "server-only";

import type { ResolvedInvestingIdentityContextV1 } from "@/lib/investing/identity";
import type {
  InvestingOpsIntegrityProjectionPortV1,
  InvestingOpsReplayProjectionPortV1,
  InvestingOpsVerifierProjectionPortV1,
} from "@/lib/investing/ops/ports";
import {
  InvestingEnginePersistenceReaderV1,
  InvestingEngineReplayServiceV1,
} from "@/lib/investing/engine/v1/persistence";
import type { Pool } from "pg";
import { InvestingEnginePhase4CIntegrityScanner } from
  "@/lib/investing/engine/v1/integrity/scanner.server";
import { AuthenticatedInvestingPersistenceReadPortV1 } from
  "@/lib/investing/ops/infrastructure/scopedPersistence.server";
import type { PureInvestingEngineRunnerV1 } from
  "@/lib/investing/engine/v1/persistence";
import {
  type InvestingOpsOperationBudgetV1,
} from "@/lib/investing/ops/adapter.server";

function selector(scope: ResolvedInvestingIdentityContextV1, runId: string) {
  return {
    ownerId: scope.ownerId,
    accountId: scope.accountId,
    runId,
  };
}

export class OfficialInvestingOpsVerifierProjectionV1
implements InvestingOpsVerifierProjectionPortV1 {
  constructor(
    private readonly pool: Pool,
    private readonly budget: InvestingOpsOperationBudgetV1,
  ) {}

  async inspectRun(args: Readonly<{
    scope: ResolvedInvestingIdentityContextV1;
    runId: string;
  }>) {
    try {
      const reader = scopedReader(this.pool, args.scope, this.budget);
      await reader.loadByRunId(selector(args.scope, args.runId));
      return "pass" as const;
    } catch {
      return "failed" as const;
    }
  }
}

export class OfficialInvestingOpsReplayProjectionV1
implements InvestingOpsReplayProjectionPortV1 {
  constructor(
    private readonly pool: Pool,
    private readonly pureRunner: PureInvestingEngineRunnerV1,
    private readonly budget: InvestingOpsOperationBudgetV1,
  ) {}

  async inspectRun(args: Readonly<{
    scope: ResolvedInvestingIdentityContextV1;
    runId: string;
  }>) {
    const result = await scopedReplay(
      this.pool,
      args.scope,
      this.pureRunner,
      this.budget,
    )
      .replay(selector(args.scope, args.runId));
    if (this.budget.expired()) return "blocked" as const;
    return result.status === "replay_match"
      ? "pass" as const
      : result.status === "replay_blocked_by_integrity_error"
        ? "blocked" as const
        : "failed" as const;
  }
}

export const INVESTING_OPS_INTEGRITY_MAX_RUNS_V1 = 25;
export const INVESTING_OPS_INTEGRITY_TIMEOUT_MS_V1 = 5_000;

export class ScopedInvestingOpsIntegrityProjectionV1
implements InvestingOpsIntegrityProjectionPortV1 {
  constructor(private readonly dependencies: Readonly<{
    pool: Pool;
    pureRunner: PureInvestingEngineRunnerV1;
    maxRuns?: number;
    timeoutMs?: number;
    budget: InvestingOpsOperationBudgetV1;
  }>) {}

  async inspectScope(scope: ResolvedInvestingIdentityContextV1) {
    try {
      const budget = this.dependencies.budget;
      const reader = scopedReader(this.dependencies.pool, scope, budget);
      const replay = scopedReplay(
        this.dependencies.pool,
        scope,
        this.dependencies.pureRunner,
        budget,
      );
      const report = await new InvestingEnginePhase4CIntegrityScanner({
        pool: this.dependencies.pool,
        reader,
        replay,
        scope: {
          authenticatedUserId: scope.authenticatedUserId,
          ownerId: scope.ownerId,
          accountId: scope.accountId,
          maxRuns: this.dependencies.maxRuns ?? INVESTING_OPS_INTEGRITY_MAX_RUNS_V1,
          timeoutMs: this.dependencies.timeoutMs ?? INVESTING_OPS_INTEGRITY_TIMEOUT_MS_V1,
          remainingMs: budget.remainingMs,
        },
      }).scan();
      return report.status === "clean" ? "pass" as const : "blocked" as const;
    } catch {
      return "incomplete" as const;
    }
  }
}

function scopedReader(
  pool: Pool,
  scope: ResolvedInvestingIdentityContextV1,
  budget: InvestingOpsOperationBudgetV1,
): InvestingEnginePersistenceReaderV1 {
  return new InvestingEnginePersistenceReaderV1(
    new AuthenticatedInvestingPersistenceReadPortV1(
      pool,
      scope.authenticatedUserId,
      budget,
    ),
  );
}

function scopedReplay(
  pool: Pool,
  scope: ResolvedInvestingIdentityContextV1,
  pureRunner: PureInvestingEngineRunnerV1,
  budget: InvestingOpsOperationBudgetV1,
): InvestingEngineReplayServiceV1 {
  return new InvestingEngineReplayServiceV1(
    scopedReader(pool, scope, budget),
    pureRunner,
  );
}
