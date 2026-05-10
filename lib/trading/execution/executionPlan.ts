import type { ExecutionPlanOutput, ExecutionPlanningInput } from "./types";
import { buildEntryZone } from "./entryZone";
import { buildInvalidation } from "./invalidation";
import { buildTradePath } from "./tradePath";
import { buildRiskFraming } from "./riskFraming";
import { resolveExecutionStatus } from "./executionStatus";

export function createExecutionPlan(input: ExecutionPlanningInput): ExecutionPlanOutput {
  const entryZone = buildEntryZone(input);
  const invalidation = buildInvalidation(input);
  const tradePath = buildTradePath(input, invalidation);
  const riskFraming = buildRiskFraming(input);
  const executionStatus = resolveExecutionStatus(input);

  return {
    entryZone,
    invalidation,
    tradePath,
    riskFraming,
    executionStatus,
  };
}
