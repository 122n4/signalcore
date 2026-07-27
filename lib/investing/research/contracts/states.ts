export const RESEARCH_HYPOTHESIS_STATES =
  ["draft", "active", "retired"] as const;
export type ResearchHypothesisState =
  (typeof RESEARCH_HYPOTHESIS_STATES)[number];

export const STRATEGY_CANDIDATE_STATES = [
  "draft",
  "ready",
  "testing",
  "rejected",
  "inconclusive",
  "validated",
  "promotion_eligible",
  "promoted",
  "retired",
] as const;
export type StrategyCandidateState =
  (typeof STRATEGY_CANDIDATE_STATES)[number];

export const EXPERIMENT_RUN_STATES = [
  "defined",
  "queued",
  "leased",
  "running",
  "completed",
  "failed",
  "blocked",
  "cancelled",
] as const;
export type ExperimentRunState = (typeof EXPERIMENT_RUN_STATES)[number];

const HYPOTHESIS_TRANSITIONS: Readonly<Record<ResearchHypothesisState, readonly ResearchHypothesisState[]>> = {
  draft: ["active", "retired"],
  active: ["retired"],
  retired: [],
};

const CANDIDATE_TRANSITIONS: Readonly<Record<StrategyCandidateState, readonly StrategyCandidateState[]>> = {
  draft: ["ready", "retired"],
  ready: ["testing", "retired"],
  testing: ["rejected", "inconclusive", "validated"],
  rejected: ["retired"],
  inconclusive: ["ready", "retired"],
  validated: ["promotion_eligible", "retired"],
  promotion_eligible: ["promoted", "retired"],
  promoted: ["retired"],
  retired: [],
};

const RUN_TRANSITIONS: Readonly<Record<ExperimentRunState, readonly ExperimentRunState[]>> = {
  defined: ["queued", "cancelled"],
  queued: ["leased", "cancelled", "blocked"],
  leased: ["running", "queued", "cancelled", "blocked"],
  running: ["completed", "failed", "blocked", "cancelled"],
  completed: [],
  failed: [],
  blocked: [],
  cancelled: [],
};

export type StateTransitionResult<T extends string> =
  | Readonly<{ ok: true; from: T; to: T }>
  | Readonly<{
    ok: false;
    from: T;
    to: T;
    reasonCode: "research.execution.transition_not_allowed";
  }>;

function transition<T extends string>(
  graph: Readonly<Record<T, readonly T[]>>,
  from: T,
  to: T,
): StateTransitionResult<T> {
  return graph[from]?.includes(to)
    ? { ok: true, from, to }
    : {
        ok: false,
        from,
        to,
        reasonCode: "research.execution.transition_not_allowed",
      };
}

export function transitionResearchHypothesis(
  from: ResearchHypothesisState,
  to: ResearchHypothesisState,
) {
  return transition(HYPOTHESIS_TRANSITIONS, from, to);
}

export function transitionStrategyCandidate(
  from: StrategyCandidateState,
  to: StrategyCandidateState,
) {
  return transition(CANDIDATE_TRANSITIONS, from, to);
}

export function transitionExperimentRun(
  from: ExperimentRunState,
  to: ExperimentRunState,
) {
  return transition(RUN_TRANSITIONS, from, to);
}
