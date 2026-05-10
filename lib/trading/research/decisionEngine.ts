import { classifyResearchFailure } from "./forensics";
import { rankResearchOpportunity } from "./ranking";
import type { ResearchDecision, ResearchGateEvaluation, ResearchRunComparison, ResearchRunDecision } from "./types";

export function decideResearchRun(args: {
  runId: string;
  taskId: string;
  gates: ResearchGateEvaluation;
  hardFailureReason?: string | null;
  promotedMetrics?: Record<string, number | null>;
  comparison?: ResearchRunComparison | null;
}): ResearchRunDecision {
  let decision: ResearchDecision;
  let reason: string;

  if (args.hardFailureReason) {
    decision = "reject";
    reason = args.hardFailureReason;
  } else if (!args.gates.allHardGatesPass) {
    decision = "reject";
    reason = "One or more hard validation gates failed.";
  } else if (args.gates.promotionThresholdMet) {
    decision = "promote";
    reason = "All hard validation gates passed and promotion thresholds were met.";
  } else {
    decision = "candidate";
    reason = "Hard validation gates passed but promotion thresholds were not met.";
  }

  const failureForensics =
    decision === "reject"
      ? classifyResearchFailure({
          reason,
          error: args.hardFailureReason ?? null,
        })
      : null;
  const ranking = args.comparison ? rankResearchOpportunity(args.comparison) : null;

  return {
    run_id: args.runId,
    task_id: args.taskId,
    decision,
    reason,
    gates: args.gates,
    promoted_metrics: args.promotedMetrics ?? {},
    ranking,
    failure_forensics: failureForensics,
  };
}
