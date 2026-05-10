import type { ResearchTaskStatus } from "./types";

const VALID_TRANSITIONS: Record<ResearchTaskStatus, ResearchTaskStatus[]> = {
  pending: ["running", "blocked", "cancelled"],
  running: ["awaiting_decision", "failed"],
  awaiting_decision: ["completed", "failed"],
  completed: [],
  failed: ["pending", "cancelled"],
  blocked: ["pending", "cancelled"],
  cancelled: [],
};

export function canTransitionResearchTaskStatus(
  from: ResearchTaskStatus,
  to: ResearchTaskStatus,
): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

export function assertResearchTaskStatusTransition(
  from: ResearchTaskStatus,
  to: ResearchTaskStatus,
): void {
  if (!canTransitionResearchTaskStatus(from, to)) {
    throw new Error(`Invalid research task transition '${from}' -> '${to}'.`);
  }
}
