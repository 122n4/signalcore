import "server-only";

import type { ResolvedInvestingIdentityContextV1 } from "@/lib/investing/identity";
import { aggregateCheck } from "@/lib/investing/ops/aggregation";
import type {
  InvestingOpsCheckStateV1,
  InvestingOpsRunV1,
} from "@/lib/investing/ops/contracts";
import type {
  InvestingOpsIntegrityProjectionPortV1,
  InvestingOpsReadDatasetV1,
  InvestingOpsReadModelPortV1,
  InvestingOpsReplayProjectionPortV1,
  InvestingOpsVerifierProjectionPortV1,
} from "@/lib/investing/ops/ports";

export type InvestingOpsOfficialServicesAdapterDependenciesV1 = Readonly<{
  readModel: InvestingOpsReadModelPortV1;
  integrity: InvestingOpsIntegrityProjectionPortV1;
  verifier: InvestingOpsVerifierProjectionPortV1;
  replay: InvestingOpsReplayProjectionPortV1;
}>;

export type InvestingOpsOperationBudgetV1 = Readonly<{
  remainingMs(): number;
  expired(): boolean;
}>;

const unboundedBudget: InvestingOpsOperationBudgetV1 = {
  remainingMs: () => Number.MAX_SAFE_INTEGER,
  expired: () => false,
};

export type InvestingOpsInspectedDatasetV1 = Readonly<{
  source: InvestingOpsReadDatasetV1;
  runs: readonly InvestingOpsRunV1[];
  integrity: InvestingOpsCheckStateV1;
  verifier: InvestingOpsCheckStateV1;
  replay: InvestingOpsCheckStateV1;
}>;

function assertScope(
  scope: ResolvedInvestingIdentityContextV1,
  dataset: InvestingOpsReadDatasetV1,
): void {
  const mismatchedRun = dataset.runs.some((run) =>
    run.ownerId !== scope.ownerId
    || run.tenantId !== scope.tenantId
    || run.portfolioId !== scope.portfolioId
    || run.accountId !== scope.accountId);
  const mismatchedFailure = dataset.failures?.some((failure) =>
    failure.scope?.ownerId !== scope.ownerId
    || failure.scope?.tenantId !== scope.tenantId
    || failure.scope?.portfolioId !== scope.portfolioId
    || failure.scope?.accountId !== scope.accountId) ?? false;
  if (mismatchedRun || mismatchedFailure) {
    throw new Error("ops_scope_projection_mismatch");
  }
}

export class InvestingOpsOfficialServicesAdapterV1 {
  constructor(
    private readonly dependencies: InvestingOpsOfficialServicesAdapterDependenciesV1,
    private readonly budget: InvestingOpsOperationBudgetV1 = unboundedBudget,
  ) {}

  private assertBudget(): void {
    if (this.budget.expired()) throw new Error("investing_ops_budget_expired");
  }

  async inspect(
    scope: ResolvedInvestingIdentityContextV1,
  ): Promise<InvestingOpsInspectedDatasetV1> {
    this.assertBudget();
    const source = await this.dependencies.readModel.readScope(scope);
    this.assertBudget();
    assertScope(scope, source);
    const ordered = [...source.runs].sort((left, right) =>
      right.asOf.localeCompare(left.asOf) || left.runId.localeCompare(right.runId));
    this.assertBudget();
    const integrity = await this.dependencies.integrity.inspectScope(scope);
    this.assertBudget();
    const runs: InvestingOpsRunV1[] = [];
    for (const run of ordered) {
      this.assertBudget();
      const verifier = await this.dependencies.verifier.inspectRun({
        scope,
        runId: run.runId,
      });
      this.assertBudget();
      const replay = await this.dependencies.replay.inspectRun({
        scope,
        runId: run.runId,
      });
      this.assertBudget();
      runs.push({
        runId: run.runId,
        asOf: run.asOf,
        state: run.state,
        quality: run.quality,
        requestOutcome: run.requestOutcome,
        reasonCode: run.reasonCode,
        integrity,
        verifier,
        replay,
        idempotencyConflict: run.idempotencyConflict,
        ambiguousCommitRecovery: run.ambiguousCommitRecovery,
      });
    }
    return {
      source,
      runs,
      integrity,
      verifier: aggregateCheck(runs.map((run) => run.verifier)),
      replay: aggregateCheck(runs.map((run) => run.replay)),
    };
  }
}
