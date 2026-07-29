import "server-only";

import {
  EXPERIMENT_RESULT_ENVELOPE_VERSION,
  validateExperimentDefinition,
  validateExperimentResultEnvelope,
  type ExperimentDefinition,
  type ExperimentMetric,
  type ExperimentResultEnvelope,
  type InvestingResearchScientificScope,
  type ResearchArtifactRef,
} from "../contracts";
import { hashCanonicalResearchMaterial } from "../reproducibility/hashing.server";
import { ARTIFACT_IDENTITY_DOMAIN } from "../reproducibility/versions";
import type { BacktestResult } from "./types";

const sameScope = (
  scope: InvestingResearchScientificScope,
  experiment: ExperimentDefinition,
) => scope.tenantId === experiment.scope.tenantId
  && scope.ownerId === experiment.scope.ownerId
  && scope.portfolioId === experiment.scope.portfolioId
  && scope.accountId === experiment.scope.accountId;

export function buildExperimentResultEnvelope(input: Readonly<{
  experiment: unknown;
  leaseScope: InvestingResearchScientificScope;
  experimentId: string;
  runId: string;
  backtest: BacktestResult;
  artifact: ResearchArtifactRef;
}>): Readonly<{ ok: true; envelope: ExperimentResultEnvelope; resultHash: string }>
  | Readonly<{ ok: false; reason: string }> {
  const parsed = validateExperimentDefinition(input.experiment);
  if (!parsed.ok) return { ok: false, reason: "backtest_experiment_invalid" };
  const experiment = parsed.value;
  if (
    experiment.experimentId !== input.experimentId
    || input.backtest.experimentId !== input.experimentId
    || input.backtest.datasetVersionId !== experiment.dataset.datasetVersionId
    || !sameScope(input.leaseScope, experiment)
  ) return { ok: false, reason: "backtest_experiment_reference_mismatch" };

  const metric = (name: string, value: number, unit: string): ExperimentMetric => ({
    name,
    value: { availability: "available", value, unit },
  });
  const envelope: ExperimentResultEnvelope = {
    contractVersion: EXPERIMENT_RESULT_ENVELOPE_VERSION,
    experimentId: experiment.experimentId,
    runId: input.runId,
    candidateId: experiment.candidate.candidateId,
    candidateVersion: experiment.candidate.candidateVersion,
    hypothesisId: experiment.candidate.hypothesisId,
    hypothesisVersion: experiment.candidate.hypothesisVersion,
    scope: experiment.scope,
    dataset: experiment.dataset,
    validationProfile: experiment.validationProfile,
    benchmark: experiment.benchmark,
    completionStatus: "completed",
    summary: "Deterministic Phase 6I backtest execution completed.",
    metrics: [
      metric("initial_capital", input.backtest.metrics.initialCapital, "currency"),
      metric("final_equity", input.backtest.metrics.finalEquity, "currency"),
      metric("total_return", input.backtest.metrics.totalReturn, "ratio"),
      metric("maximum_drawdown", input.backtest.metrics.maximumDrawdown, "ratio"),
      metric("turnover", input.backtest.metrics.turnover, "ratio"),
      metric("total_costs", input.backtest.metrics.totalCosts, "currency"),
    ],
    benchmarkComparison: [],
    warnings: [],
    qualityFlags: [],
    validationInputRefs: [],
    artifacts: [input.artifact],
  };
  const validated = validateExperimentResultEnvelope(envelope);
  if (!validated.ok) return { ok: false, reason: "backtest_result_envelope_invalid" };
  const hashed = hashCanonicalResearchMaterial(ARTIFACT_IDENTITY_DOMAIN, validated.value);
  if (!hashed.ok) return { ok: false, reason: "backtest_result_hash_failed" };
  return { ok: true, envelope: validated.value, resultHash: hashed.value.digest };
}
