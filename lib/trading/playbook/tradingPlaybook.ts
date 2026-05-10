import type {
  ResolvedTradingPlaybookRules,
  TradingBehaviorGuards,
  TradingBehaviorSnapshot,
  TradingPlaybook,
  TradingPlaybookRules,
} from "./types";
import type { SessionState } from "@/lib/trading/market";

function mergeBehaviorGuards(
  base: TradingBehaviorGuards,
  override?: Partial<TradingBehaviorGuards>,
): TradingBehaviorGuards {
  return {
    ...base,
    ...override,
  };
}

function mergeRules(
  base: TradingPlaybookRules,
  override?: Partial<TradingPlaybookRules>,
): TradingPlaybookRules {
  if (!override) {
    return base;
  }

  return {
    ...base,
    ...override,
    allowedSetups: override.allowedSetups ?? base.allowedSetups,
    blockedSetups: override.blockedSetups ?? base.blockedSetups,
    blockedTradeValidContexts: override.blockedTradeValidContexts ?? base.blockedTradeValidContexts,
    preferredRegimes: override.preferredRegimes ?? base.preferredRegimes,
    blockedRegimes: override.blockedRegimes ?? base.blockedRegimes,
    noTradeIf: override.noTradeIf ?? base.noTradeIf,
    behaviorGuards: mergeBehaviorGuards(base.behaviorGuards, override.behaviorGuards),
  };
}

export function resolveTradingPlaybookRules(
  playbook: TradingPlaybook,
  activeSession: SessionState,
): ResolvedTradingPlaybookRules {
  const sessionOverride = playbook.sessionOverrides?.[activeSession];

  return {
    ...mergeRules(playbook.baseRules, sessionOverride),
    activeSession,
  };
}

export function createDefaultTradingPlaybook(
  overrides: Partial<TradingPlaybook> = {},
): TradingPlaybook {
  const defaultBaseRules: TradingPlaybookRules = {
    allowedSetups: [
      "breakout_continuation",
      "trend_pullback",
      "liquidity_sweep_reversal",
      "range_reclaim",
      "failed_breakout",
    ],
    blockedSetups: ["none"],
    blockedTradeValidContexts: [
      {
        instrument: "NAS100",
        sessions: ["pre_market"],
        reason: "NAS100 is blocked during pre-market in the current playbook calibration.",
      },
      {
        instrument: "US500",
        sessions: ["london_ny_overlap"],
        reason: "US500 is blocked during London/New York overlap in the current playbook calibration.",
      },
      {
        instrument: "EURUSD",
        sessions: ["london_session"],
        reason: "EURUSD is blocked during London session in the current playbook calibration.",
      },
      {
        instrument: "USDJPY",
        sessions: ["london_open"],
        reason: "USDJPY is blocked during London open in the current playbook calibration.",
      },
    ],
    preferredRegimes: ["trending", "expansion", "compression", "ranging"],
    blockedRegimes: ["noisy", "low_participation"],
    riskPerTradePct: 0.5,
    maxDailyLossPct: 2,
    maxOpenRiskPct: 1.5,
    maxTrades: 4,
    maxConsecutiveLosses: 2,
    chasePolicy: "never",
    invalidationPolicy: "strict",
    noTradeIf: [
      "low_clarity",
      "unfavorable_environment",
      "late_setup",
      "degrading_window",
      "spike_volatility",
      "noisy_regime",
      "mixed_bias",
    ],
    behaviorGuards: {
      blockChasing: true,
      blockRevengeTrading: true,
      cautionDailyLossPct: 1.2,
      cautionOpenRiskPct: 1,
      cautionConsecutiveLosses: 1,
      maxInvalidationBreaches: 1,
    },
  };

  return {
    id: overrides.id ?? "core-playbook",
    name: overrides.name ?? "Core Trading Playbook",
    baseRules: mergeRules(defaultBaseRules, overrides.baseRules),
    sessionOverrides: overrides.sessionOverrides ?? {},
  };
}

export function createClearBehaviorSnapshot(
  overrides: Partial<TradingBehaviorSnapshot> = {},
): TradingBehaviorSnapshot {
  return {
    tradesTaken: 0,
    dailyLossPct: 0,
    openRiskPct: 0,
    consecutiveLosses: 0,
    chasingActive: false,
    revengeTradingActive: false,
    invalidationBreaches: 0,
    ...overrides,
  };
}
