import type { BehaviorGuardOutput, TradingOperationalInput } from "./types";
import { resolveTradingPlaybookRules } from "./tradingPlaybook";

function buildOutput(
  state: BehaviorGuardOutput["state"],
  score: number,
  reasons: string[],
): BehaviorGuardOutput {
  return {
    state,
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons,
  };
}

export function runBehaviorGuard(input: TradingOperationalInput): BehaviorGuardOutput {
  const rules = resolveTradingPlaybookRules(input.playbook, input.market.session.session);
  const reasons: string[] = [];
  const cautionReasons: string[] = [];
  const { behavior } = input;

  if (behavior.tradesTaken >= rules.maxTrades) {
    reasons.push("Maximum trade count reached for the session plan.");
  }

  if (behavior.dailyLossPct >= rules.maxDailyLossPct) {
    reasons.push("Daily loss limit breached.");
  }

  if (behavior.openRiskPct >= rules.maxOpenRiskPct) {
    reasons.push("Open risk is above the playbook maximum.");
  }

  if (behavior.consecutiveLosses >= rules.maxConsecutiveLosses) {
    reasons.push("Consecutive loss limit breached.");
  }

  if (rules.chasePolicy === "never" && rules.behaviorGuards.blockChasing && behavior.chasingActive) {
    reasons.push("Chasing behavior is blocked by the playbook.");
  }

  if (rules.behaviorGuards.blockRevengeTrading && behavior.revengeTradingActive) {
    reasons.push("Revenge trading behavior is blocked.");
  }

  if (
    typeof rules.behaviorGuards.maxInvalidationBreaches === "number" &&
    behavior.invalidationBreaches > rules.behaviorGuards.maxInvalidationBreaches
  ) {
    reasons.push("Invalidation discipline breached too many times.");
  }

  if (reasons.length > 0) {
    return buildOutput("restricted", 18, reasons);
  }

  if (behavior.tradesTaken >= Math.max(1, rules.maxTrades - 1)) {
    cautionReasons.push("Approaching the maximum trade count.");
  }

  if (
    typeof rules.behaviorGuards.cautionDailyLossPct === "number" &&
    behavior.dailyLossPct >= rules.behaviorGuards.cautionDailyLossPct
  ) {
    cautionReasons.push("Daily drawdown is approaching the session limit.");
  }

  if (
    typeof rules.behaviorGuards.cautionOpenRiskPct === "number" &&
    behavior.openRiskPct >= rules.behaviorGuards.cautionOpenRiskPct
  ) {
    cautionReasons.push("Open risk is elevated relative to the playbook limit.");
  }

  if (
    typeof rules.behaviorGuards.cautionConsecutiveLosses === "number" &&
    behavior.consecutiveLosses >= rules.behaviorGuards.cautionConsecutiveLosses
  ) {
    cautionReasons.push("Loss streak is elevated. Reduce discretion.");
  }

  if (rules.chasePolicy === "controlled" && behavior.chasingActive) {
    cautionReasons.push("Price extension is elevated. Avoid chasing weak continuation.");
  }

  if (cautionReasons.length > 0) {
    return buildOutput("caution", 56, cautionReasons);
  }

  return buildOutput("clear", 88, []);
}
