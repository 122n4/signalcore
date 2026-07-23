import { deepFreezeCanonical } from "@/lib/investing/engine/v1/canonical";
import {
  INVESTING_ENGINE_RESULT_CONTRACT_VERSION,
  type CanonicalInvestingInputV1,
  type InvestingEngineResultV1,
  type InvestingEngineStateV1,
  type InvestingQualityIssueV1,
} from "@/lib/investing/engine/v1/contracts";
import {
  assertCanonicalInvestingInputV1,
  assertInvestingEngineResultV1,
  hashInvestingEngineResultV1,
} from "@/lib/investing/engine/v1/validation";

function deriveState(input: CanonicalInvestingInputV1): InvestingEngineStateV1 {
  const hardBlocked = input.mandate.constraints.some(
    (constraint) => constraint.kind === "hard" && constraint.status !== "pass",
  );
  if (hardBlocked || input.quality.status === "insufficient") return "blocked";

  const softDegraded = input.mandate.constraints.some(
    (constraint) => constraint.kind === "soft" && constraint.status !== "pass",
  );
  if (softDegraded || input.quality.status === "degraded") return "degraded";

  // Construction/rebalance are intentionally absent in 3B. A valid input is
  // therefore a deterministic no-trade result, never an operational proposal.
  return "no_trade";
}

function collectWarnings(input: CanonicalInvestingInputV1): readonly InvestingQualityIssueV1[] {
  const seen = new Set<string>();
  const warnings: InvestingQualityIssueV1[] = [];
  for (const issue of [...input.warnings, ...input.quality.issues]) {
    const identity = `${issue.code}:${issue.domain}:${issue.observedAt ?? ""}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    warnings.push(issue);
  }
  return warnings;
}

export function orchestrateInvestingEngineV1(input: CanonicalInvestingInputV1): InvestingEngineResultV1 {
  assertCanonicalInvestingInputV1(input);

  const draft: Omit<InvestingEngineResultV1, "outputHash"> = {
    contractVersion: INVESTING_ENGINE_RESULT_CONTRACT_VERSION,
    runId: input.runId,
    inputSnapshotId: input.inputSnapshotId,
    inputHash: input.inputHash,
    asOf: input.asOf,
    versions: input.versions,
    state: deriveState(input),
    quality: input.quality.status,
    constraints: input.mandate.constraints,
    confidence: input.confidence,
    warnings: collectWarnings(input),
    targetPortfolio: [],
    rebalance: [],
    proposal: null,
  };
  const result = {
    ...draft,
    outputHash: hashInvestingEngineResultV1(draft),
  } satisfies InvestingEngineResultV1;
  assertInvestingEngineResultV1(result);
  return deepFreezeCanonical(result) as InvestingEngineResultV1;
}
