import { buildEngineContext } from "@/lib/engine/v4/context";
import { computeDailyBundleV4 } from "@/lib/engine/v4";

/**
 * Canonical engine entrypoint for runtime consumers.
 * The current implementation is still backed by v4, but callers should depend
 * on this module instead of importing `lib/engine/v4` directly.
 */
export { buildEngineContext };

export {
  computeDecisionGovernance,
  type DecisionGovernanceInput,
  type GovernanceAssetInput,
  type GovernanceDailyDecision,
  type OpportunityDashboardItem,
} from "@/lib/engine/decisionGovernance";
export {
  buildDailyBriefingFromDecisionGovernance,
  type DailyBriefingInput,
  type DailyBriefingOutput,
} from "@/lib/engine/dailyBriefing";
export {
  buildPortfolioHealth,
  type PortfolioHealthOutput,
  type PortfolioHealthRiskInput,
} from "@/lib/engine/portfolioHealth";
export {
  computePortfolioRisk,
  type PortfolioRiskOutput,
} from "@/lib/engine/portfolioRisk";
export { recommendPositionSize } from "@/lib/engine/positionSizing";
export {
  deriveRiskPolicy,
  evaluateRiskPolicy,
  type RiskPolicy,
  type RiskPolicyEvaluation,
} from "@/lib/signalcore/riskPolicy";
export {
  buildCashDeploymentPolicy,
  buildOpportunityQueue,
  buildPreTradeSafetyCheck,
  buildPriorityNotifications,
  buildWeeklyPremiumReport,
  computeAntiChurnState,
  computeDecisionSourceTransparency,
  computeGrowthReadiness,
  computeKillSwitchState,
  computeOperationalAction,
  computePreExecutionSimulation,
  computeRiskEnvelope,
  computeWeeklyValueMetrics,
  enforceActionGateWithPreTrade,
  isRiskEscalationAction,
} from "@/lib/signalcore/dailyEnhancements";

export function computeDailyBundle(...args: Parameters<typeof computeDailyBundleV4>) {
  return computeDailyBundleV4(...args);
}

export type { DailyBundleV4 as CanonicalDailyBundle } from "@/lib/engine/v4";
