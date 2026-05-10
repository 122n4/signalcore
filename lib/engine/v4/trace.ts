import type { DecisionTraceItem } from "./types";

export const V4_TRACE_LIMIT = 10;

export function createTraceItem(step: string, outcome: string, detail?: string | null): DecisionTraceItem {
  return {
    step: String(step || "unknown"),
    outcome: String(outcome || "unknown"),
    detail: detail ? String(detail) : null,
  };
}

export function pushTrace(
  current: DecisionTraceItem[],
  step: string,
  outcome: string,
  detail?: string | null,
) {
  return [...(Array.isArray(current) ? current : []), createTraceItem(step, outcome, detail)].slice(-V4_TRACE_LIMIT);
}

export function capTrace(current: DecisionTraceItem[]) {
  return (Array.isArray(current) ? current : []).slice(0, V4_TRACE_LIMIT);
}
