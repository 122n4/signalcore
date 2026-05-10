import type { ExecutionPlanningInput, ExecutionStatusOutput } from "./types";

function uniqueReasons(reasons: string[]): string[] {
  return Array.from(new Set(reasons));
}

function nextStep(input: ExecutionPlanningInput, reasons: string[]): string | null {
  if (input.behaviorGuard.state === "restricted") {
    return "Stand down until behavior and risk discipline reset.";
  }

  if (!input.playbookCheck.executionAllowed) {
    return input.playbookCheck.nextDisciplineStep ?? "Wait for the setup to align with the playbook.";
  }

  if (reasons.some((reason) => reason.includes("technical state"))) {
    return "Wait for the technical state to become trade-valid.";
  }

  return null;
}

export function resolveExecutionStatus(
  input: ExecutionPlanningInput,
): ExecutionStatusOutput {
  const reasons: string[] = [];

  if (input.playbookCheck.hardBlock === true) {
    reasons.push(...input.playbookCheck.reasons);

    return {
      executionStatus: "restricted",
      reasons: uniqueReasons(reasons),
      nextDisciplineStep: nextStep(input, reasons),
    };
  }

  if (input.behaviorGuard.state === "restricted") {
    reasons.push(...input.behaviorGuard.reasons);

    return {
      executionStatus: "restricted",
      reasons: uniqueReasons(reasons),
      nextDisciplineStep: nextStep(input, reasons),
    };
  }

  if (input.decisionCore.decision.currentState === "TRADE_VALID") {
    if (!input.playbookCheck.executionAllowed) {
      reasons.push(...input.playbookCheck.reasons);

      return {
        executionStatus: "restricted",
        reasons: uniqueReasons(reasons),
        nextDisciplineStep: nextStep(input, reasons),
      };
    }

    if (input.behaviorGuard.state === "caution") {
      reasons.push(...input.behaviorGuard.reasons);

      return {
        executionStatus: "caution",
        reasons: uniqueReasons(reasons),
        nextDisciplineStep: nextStep(input, reasons),
      };
    }

    return {
      executionStatus: "allowed",
      reasons: ["Decision, playbook, and behavior are aligned for execution."],
      nextDisciplineStep: null,
    };
  }

  if (["SESSION_OPEN", "WAIT", "SETUP_FORMING"].includes(input.decisionCore.decision.currentState)) {
    reasons.push("Technical state is not trade-valid yet.");

    return {
      executionStatus: "caution",
      reasons,
      nextDisciplineStep: nextStep(input, reasons),
    };
  }

  reasons.push("Technical state does not support execution.");

  return {
    executionStatus: "restricted",
    reasons,
    nextDisciplineStep: nextStep(input, reasons),
  };
}
