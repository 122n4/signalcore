export type InvestingOperationalExecutionState =
  | "proposed"
  | "awaiting_approval"
  | "approved"
  | "submitting"
  | "submitted"
  | "partially_filled"
  | "filled"
  | "reconciling"
  | "reconciled"
  | "rejected"
  | "cancelled"
  | "expired"
  | "blocked"
  | "submission_failed"
  | "reconciliation_failed";

export type InvestingExecutionTransition =
  | "create_proposal"
  | "require_approval"
  | "approve"
  | "reject"
  | "block"
  | "start_submission"
  | "mark_submitted"
  | "record_partial_fill"
  | "record_fill"
  | "start_reconciliation"
  | "mark_reconciled"
  | "fail_submission"
  | "fail_reconciliation"
  | "cancel"
  | "expire"
  | "retry_submission";

const TRANSITIONS: Record<InvestingExecutionTransition, InvestingOperationalExecutionState[]> = {
  create_proposal: ["proposed"],
  require_approval: ["proposed"],
  approve: ["awaiting_approval"],
  reject: ["awaiting_approval", "proposed"],
  block: ["proposed", "awaiting_approval", "approved", "submission_failed", "reconciliation_failed"],
  start_submission: ["approved", "submission_failed"],
  mark_submitted: ["submitting"],
  record_partial_fill: ["submitted", "partially_filled"],
  record_fill: ["submitted", "partially_filled"],
  start_reconciliation: ["filled"],
  mark_reconciled: ["reconciling"],
  fail_submission: ["submitting"],
  fail_reconciliation: ["reconciling"],
  cancel: ["proposed", "awaiting_approval", "approved", "submitted", "partially_filled"],
  expire: ["proposed", "awaiting_approval", "approved", "submitted"],
  retry_submission: ["submission_failed"],
};

const TARGETS: Record<InvestingExecutionTransition, InvestingOperationalExecutionState> = {
  create_proposal: "proposed",
  require_approval: "awaiting_approval",
  approve: "approved",
  reject: "rejected",
  block: "blocked",
  start_submission: "submitting",
  mark_submitted: "submitted",
  record_partial_fill: "partially_filled",
  record_fill: "filled",
  start_reconciliation: "reconciling",
  mark_reconciled: "reconciled",
  fail_submission: "submission_failed",
  fail_reconciliation: "reconciliation_failed",
  cancel: "cancelled",
  expire: "expired",
  retry_submission: "submitting",
};

export function transitionInvestingExecutionState(args: {
  current: InvestingOperationalExecutionState;
  transition: InvestingExecutionTransition;
  environment: InvestingExecutionEnvironment;
}) {
  if (args.environment === "live") throw new InvestingLiveExecutionBlockedError();
  const allowed = TRANSITIONS[args.transition] ?? [];
  const next = TARGETS[args.transition];
  if (args.current === next) {
    return { state: next, idempotent: true };
  }
  if (!allowed.includes(args.current)) {
    throw new Error(`illegal_investing_execution_transition:${args.current}->${args.transition}`);
  }
  return { state: next, idempotent: false };
}

export function canSubmitInvestingExecution(state: InvestingOperationalExecutionState) {
  return state === "approved" || state === "submission_failed";
}

export function isTerminalInvestingExecutionState(state: InvestingOperationalExecutionState) {
  return ["reconciled", "rejected", "cancelled", "expired", "blocked"].includes(state);
}
import { InvestingLiveExecutionBlockedError, type InvestingExecutionEnvironment } from "@/lib/investing/broker/types";
