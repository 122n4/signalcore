import { useMemo, useRef } from "react";

export type DecisionStabilitySource = "live" | "held";

export type DecisionStabilitySemantic = {
  action: string;
  stateReason: string;
  branch: string;
  allowExecution: boolean;
  hard: boolean;
  mode: string;
};

type DecisionStabilityFrame<T> = {
  mode: string;
  branch: string;
  semanticKey: string;
  semantic: DecisionStabilitySemantic;
  stableView: T;
  candidateKey: string | null;
  candidateSemantic: DecisionStabilitySemantic | null;
  candidateView: T | null;
  candidateHits: number;
};

type AdvanceDecisionStabilityResult<T> = {
  frame: DecisionStabilityFrame<T>;
  view: T & { stabilitySource: DecisionStabilitySource };
};

const sharedDecisionStabilityFrames = new Map<string, DecisionStabilityFrame<unknown>>();

function toSemanticKey(semantic: DecisionStabilitySemantic) {
  return `${semantic.action}|${semantic.stateReason}|${semantic.branch}|${semantic.allowExecution ? "1" : "0"}`;
}

function normalizeSoftAction(action: string) {
  const value = String(action || "").trim().toUpperCase();
  if (!value) return "HOLD";
  return value;
}

function shouldStabilizeActionFlip(prevAction: string, nextAction: string) {
  const prev = normalizeSoftAction(prevAction);
  const next = normalizeSoftAction(nextAction);
  if (prev === next) return false;

  const pair = [prev, next].sort().join("|");
  return pair === "BUY|HOLD" || pair === "BUY|WAIT" || pair === "FIX|HOLD";
}

function shouldStabilizeTransition(
  previous: DecisionStabilitySemantic,
  current: DecisionStabilitySemantic,
) {
  if (current.hard) return false;

  if (previous.hard) {
    return previous.stateReason === "starter_warmup" || previous.stateReason === "low_data_quality";
  }

  return shouldStabilizeActionFlip(previous.action, current.action);
}

export function advanceDecisionStability<T>(
  previous: DecisionStabilityFrame<T> | null,
  currentView: T,
  currentSemantic: DecisionStabilitySemantic,
): AdvanceDecisionStabilityResult<T> {
  const semanticKey = toSemanticKey(currentSemantic);

  if (
    !previous ||
    previous.mode !== currentSemantic.mode ||
    previous.branch !== currentSemantic.branch ||
    currentSemantic.hard
  ) {
    const nextFrame: DecisionStabilityFrame<T> = {
      mode: currentSemantic.mode,
      branch: currentSemantic.branch,
      semanticKey,
      semantic: currentSemantic,
      stableView: currentView,
      candidateKey: null,
      candidateSemantic: null,
      candidateView: null,
      candidateHits: 0,
    };
    return {
      frame: nextFrame,
      view: Object.assign({}, currentView, { stabilitySource: "live" as const }),
    };
  }

  if (previous.semanticKey === semanticKey) {
    const nextFrame: DecisionStabilityFrame<T> = {
      ...previous,
      mode: currentSemantic.mode,
      branch: currentSemantic.branch,
      semanticKey,
      semantic: currentSemantic,
      stableView: currentView,
      candidateKey: null,
      candidateSemantic: null,
      candidateView: null,
      candidateHits: 0,
    };
    return {
      frame: nextFrame,
      view: Object.assign({}, currentView, { stabilitySource: "live" as const }),
    };
  }

  if (!shouldStabilizeTransition(previous.semantic, currentSemantic)) {
    const nextFrame: DecisionStabilityFrame<T> = {
      mode: currentSemantic.mode,
      branch: currentSemantic.branch,
      semanticKey,
      semantic: currentSemantic,
      stableView: currentView,
      candidateKey: null,
      candidateSemantic: null,
      candidateView: null,
      candidateHits: 0,
    };
    return {
      frame: nextFrame,
      view: Object.assign({}, currentView, { stabilitySource: "live" as const }),
    };
  }

  const candidateHits = previous.candidateKey === semanticKey ? previous.candidateHits + 1 : 1;
  if (candidateHits >= 2) {
    const nextFrame: DecisionStabilityFrame<T> = {
      mode: currentSemantic.mode,
      branch: currentSemantic.branch,
      semanticKey,
      semantic: currentSemantic,
      stableView: currentView,
      candidateKey: null,
      candidateSemantic: null,
      candidateView: null,
      candidateHits: 0,
    };
    return {
      frame: nextFrame,
      view: Object.assign({}, currentView, { stabilitySource: "live" as const }),
    };
  }

  const heldView = Object.assign({}, previous.stableView, { stabilitySource: "held" as const });
  const nextFrame: DecisionStabilityFrame<T> = {
    ...previous,
    candidateKey: semanticKey,
    candidateSemantic: currentSemantic,
    candidateView: currentView,
    candidateHits,
  };

  return {
    frame: nextFrame,
    view: heldView,
  };
}

export function useDecisionStability<T>(
  currentView: T,
  currentSemantic: DecisionStabilitySemantic,
  options?: {
    sharedKey?: string | null;
  },
): T & { stabilitySource: DecisionStabilitySource } {
  const frameRef = useRef<DecisionStabilityFrame<T> | null>(null);

  // This hook intentionally keeps a tiny in-memory state machine per mounted tab
  // so soft semantic flips can be held for one render cycle. The ref is the
  // private store for that state machine and is updated atomically with the
  // derived view returned from the memoized computation below.
  /* eslint-disable react-hooks/refs */
  return useMemo(() => {
    const sharedKey = String(options?.sharedKey || "").trim();
    const previous = sharedKey
      ? ((sharedDecisionStabilityFrames.get(sharedKey) as DecisionStabilityFrame<T> | undefined) ?? null)
      : frameRef.current;
    const next = advanceDecisionStability(previous, currentView, currentSemantic);
    if (sharedKey) {
      sharedDecisionStabilityFrames.set(sharedKey, next.frame as DecisionStabilityFrame<unknown>);
    }
    frameRef.current = next.frame;
    return next.view;
  }, [
    currentView,
    currentSemantic,
    options?.sharedKey,
  ]);
  /* eslint-enable react-hooks/refs */
}
