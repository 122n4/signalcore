import { buildMandatePolicy } from "@/lib/investing/mandate";
import type {
  InvestingGovernancePolicy,
  InvestingInstrument,
  MandateInput,
  RebalanceResult,
} from "@/lib/investing/types";

export function buildInvestingGovernancePolicy(args: {
  mandate: MandateInput;
  rebalance: RebalanceResult;
  instruments: InvestingInstrument[];
}): InvestingGovernancePolicy {
  const mandate = buildMandatePolicy(args.mandate);
  const instrumentMap = new Map(
    args.instruments.map((instrument) => [instrument.symbol.toUpperCase(), instrument] as const),
  );
  const activeActions = args.rebalance.actions.filter((action) => action.action !== "hold");
  const isInitialAllocation =
    activeActions.length > 0 &&
    activeActions.every((action) => action.action === "buy" && action.currentWeightPct === 0);
  const targetedSymbols = Array.from(new Set(activeActions.map((action) => action.symbol.toUpperCase())));
  const blockedSymbols = targetedSymbols.filter((symbol) => {
    const instrument = instrumentMap.get(symbol);
    return instrument?.enabled === false || instrument?.qualityStatus === "blocked";
  });
  const approvedSymbols = targetedSymbols.filter((symbol) => !blockedSymbols.includes(symbol));

  const taxRiskScore =
    activeActions.length === 0
      ? 0
      : activeActions.reduce((sum, action) => {
          const treatment = instrumentMap.get(action.symbol)?.taxTreatment ?? "ucits_accumulating";
          if (treatment === "commodity_grantor_trust") return sum + 3;
          if (treatment === "us_distributing" || treatment === "bond_fund") return sum + 2;
          if (treatment === "cash_equivalent") return sum + 1;
          return sum;
        }, 0) / activeActions.length;

  const taxDragBucket = taxRiskScore >= 2.5 ? "high" : taxRiskScore >= 1.5 ? "medium" : "low";
  const turnoverStatus = !args.rebalance.withinPolicy
    ? "outside_policy"
    : args.rebalance.grossTurnoverPct >= mandate.maxTurnoverPct * 0.75
      ? "review"
      : "inside_policy";
  const manualReviewReasons: string[] = [];

  if (blockedSymbols.length > 0) {
    manualReviewReasons.push("blocked_instrument_in_execution_set");
  }
  if (turnoverStatus === "review") {
    manualReviewReasons.push("turnover_near_policy_cap");
  }
  if (turnoverStatus === "outside_policy") {
    manualReviewReasons.push("turnover_outside_policy_cap");
  }
  if (taxDragBucket === "high") {
    manualReviewReasons.push("high_tax_drag");
  }
  if (mandate.horizon === "Short") {
    manualReviewReasons.push("short_horizon_requires_human_review");
  }
  if (approvedSymbols.length === 0 && activeActions.length > 0) {
    manualReviewReasons.push("no_clear_approved_execution_set");
  }

  const suitabilityStatus =
    blockedSymbols.length > 0
      ? "blocked"
      : turnoverStatus !== "inside_policy" || taxDragBucket === "high"
        ? "review"
        : "ok";

  const autonomyStatus =
    suitabilityStatus === "blocked"
      ? "manual_only"
      : suitabilityStatus === "review" || mandate.horizon === "Short"
        ? "supervised"
        : "eligible";
  const executionClearance =
    suitabilityStatus === "blocked"
      ? "blocked"
      : autonomyStatus === "eligible" && manualReviewReasons.length === 0
        ? "cleared"
        : "review";
  const killSwitchActive =
    suitabilityStatus === "blocked" ||
    (turnoverStatus === "outside_policy" && !isInitialAllocation);
  const approvalRequired = executionClearance !== "cleared";
  const overrideAllowed = suitabilityStatus !== "blocked";
  const maxDeployablePct =
    suitabilityStatus === "blocked"
      ? 0
      : autonomyStatus === "eligible"
        ? 100
        : turnoverStatus === "review" || taxDragBucket === "high"
          ? 25
          : 50;

  const notes: string[] = [];
  if (blockedSymbols.length > 0) {
    notes.push(`Blocked instruments detected in target execution set: ${blockedSymbols.join(", ")}.`);
  }
  if (turnoverStatus === "review") {
    notes.push("Turnover is near the mandate cap and should be reviewed before automatic execution.");
  }
  if (turnoverStatus === "outside_policy") {
    notes.push("Turnover exceeds the mandate cap, so the rebalance must remain supervised.");
  }
  if (taxDragBucket === "high") {
    notes.push("High tax-drag configuration detected for the current rebalance set.");
  }
  if (notes.length === 0) {
    notes.push("Execution set is inside the current investing governance envelope.");
  }

  return {
    suitabilityStatus,
    autonomyStatus,
    turnoverStatus,
    taxDragBucket,
    executionClearance,
    approvalRequired,
    killSwitchActive,
    overrideAllowed,
    maxDeployablePct,
    approvedSymbols,
    blockedSymbols,
    manualReviewReasons,
    notes,
  };
}
