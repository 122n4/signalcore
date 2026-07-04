import type {
  AutonomousBotConfig,
  BotAccountState,
  BotCycleResult,
  BotMarketDecision,
  BotOrderIntent,
  BotRiskConfig,
  BotSafetyConfig,
} from "./types";

export const DEFAULT_PRIVATE_BOT_RISK: BotRiskConfig = {
  maxRiskPerTradePct: 0.25,
  maxDailyLossPct: 1,
  maxOpenRiskPct: 1,
  maxTradesPerDay: 3,
  maxConsecutiveLosses: 2,
  minRiskReward: 1.8,
  minConfidence: 65,
  allowCautionWithReducedRisk: true,
};

export const DEFAULT_PRIVATE_BOT_SAFETY: BotSafetyConfig = {
  executionMode: "paper",
  autonomyOption: "paper_only",
  allowLiveTrading: false,
  liveEnvironmentConfirmed: false,
  killSwitch: false,
  requireFreshSnapshot: true,
  requireMarketOpen: true,
  operatorAcknowledgedAt: null,
};

export function buildPrivateBotConfig(
  overrides: Partial<AutonomousBotConfig> & { ownerUserId: string },
): AutonomousBotConfig {
  return {
    ownerUserId: overrides.ownerUserId,
    risk: {
      ...DEFAULT_PRIVATE_BOT_RISK,
      ...(overrides.risk || {}),
    },
    safety: {
      ...DEFAULT_PRIVATE_BOT_SAFETY,
      ...(overrides.safety || {}),
    },
  };
}

export function buildPaperOnlyBotConfig(ownerUserId: string): AutonomousBotConfig {
  return buildPrivateBotConfig({
    ownerUserId,
    safety: {
      ...DEFAULT_PRIVATE_BOT_SAFETY,
      executionMode: "paper",
      autonomyOption: "paper_only",
      allowLiveTrading: false,
      liveEnvironmentConfirmed: false,
      operatorAcknowledgedAt: null,
    },
  });
}

export function buildRealMoneyWhenArmedBotConfig(args: {
  ownerUserId: string;
  operatorAcknowledgedAt: string;
}): AutonomousBotConfig {
  return buildPrivateBotConfig({
    ownerUserId: args.ownerUserId,
    risk: {
      ...DEFAULT_PRIVATE_BOT_RISK,
      maxRiskPerTradePct: 0.1,
      maxDailyLossPct: 0.5,
      maxOpenRiskPct: 0.5,
      maxTradesPerDay: 1,
      maxConsecutiveLosses: 1,
      minRiskReward: 2,
      minConfidence: 70,
      allowCautionWithReducedRisk: false,
    },
    safety: {
      ...DEFAULT_PRIVATE_BOT_SAFETY,
      executionMode: "live",
      autonomyOption: "real_money_when_armed",
      allowLiveTrading: true,
      liveEnvironmentConfirmed: true,
      operatorAcknowledgedAt: args.operatorAcknowledgedAt,
    },
  });
}

function finitePositive(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function midpoint(low?: number | null, high?: number | null, fallback?: number | null) {
  const a = finitePositive(low);
  const b = finitePositive(high);
  if (a != null && b != null) return (a + b) / 2;
  return finitePositive(fallback);
}

function deriveRiskReward(decision: BotMarketDecision, entry: number, stop: number, target: number) {
  const explicit = finitePositive(decision.riskReward);
  if (explicit != null) return explicit;
  const risk = Math.abs(entry - stop);
  if (risk <= 0) return null;
  return Math.abs(target - entry) / risk;
}

function buildIdempotencyKey(args: {
  ownerUserId: string;
  decision: BotMarketDecision;
  entry: number;
  stop: number;
  target: number;
}) {
  if (args.decision.signalId) {
    return [args.ownerUserId, args.decision.signalId].join(":").replace(/[^a-zA-Z0-9:._-]/g, "_");
  }

  const raw = [
    args.ownerUserId,
    args.decision.instrument,
    args.decision.side,
    args.decision.snapshotAt,
    args.entry.toFixed(5),
    args.stop.toFixed(5),
    args.target.toFixed(5),
  ].join(":");
  return raw.replace(/[^a-zA-Z0-9:._-]/g, "_");
}

function validateSafety(config: AutonomousBotConfig) {
  const reasons: string[] = [];
  const safety = config.safety;

  if (safety.killSwitch) reasons.push("Bot kill switch is enabled.");
  if (safety.autonomyOption === "paper_only" && safety.executionMode !== "paper") {
    reasons.push("Paper-only option cannot run live orders.");
  }
  if (safety.autonomyOption === "real_money_when_armed" && safety.executionMode !== "live") {
    reasons.push("Real-money option must use live execution mode.");
  }
  if (safety.executionMode === "live") {
    if (!safety.allowLiveTrading) reasons.push("Live trading is disabled by configuration.");
    if (!safety.liveEnvironmentConfirmed) reasons.push("Live environment has not been explicitly confirmed.");
    if (!safety.operatorAcknowledgedAt) reasons.push("Live trading requires an operator acknowledgement timestamp.");
  }

  return reasons;
}

function validateMarketDecision(config: AutonomousBotConfig, decision: BotMarketDecision) {
  const reasons: string[] = [];
  const risk = config.risk;
  const safety = config.safety;

  if (!decision.tradeValid) reasons.push("Decision is not Trade Valid.");
  if (decision.executionStatus === "restricted") reasons.push("Execution status is restricted.");
  if (decision.executionStatus === "caution" && !risk.allowCautionWithReducedRisk) {
    reasons.push("Caution trades are disabled.");
  }
  if (safety.requireMarketOpen && !decision.marketOpen) reasons.push("Market is closed.");
  if (safety.requireFreshSnapshot && !decision.snapshotFresh) reasons.push("Snapshot is not fresh.");

  const confidence = finitePositive(decision.confidence);
  if (confidence != null && confidence < risk.minConfidence) {
    reasons.push(`Confidence ${confidence} is below minimum ${risk.minConfidence}.`);
  }

  return reasons;
}

function validateAccount(config: AutonomousBotConfig, account: BotAccountState) {
  const reasons: string[] = [];
  const risk = config.risk;

  if (account.equity <= 0) reasons.push("Account equity is not positive.");
  if (account.dailyLossPct >= risk.maxDailyLossPct) reasons.push("Daily loss limit reached.");
  if (account.openRiskPct >= risk.maxOpenRiskPct) reasons.push("Open risk limit reached.");
  if (account.tradesToday >= risk.maxTradesPerDay) reasons.push("Daily trade count limit reached.");
  if (account.consecutiveLosses >= risk.maxConsecutiveLosses) {
    reasons.push("Consecutive loss limit reached.");
  }

  return reasons;
}

function createOrderIntent(args: {
  config: AutonomousBotConfig;
  account: BotAccountState;
  decision: BotMarketDecision;
}): { intent: BotOrderIntent | null; reasons: string[] } {
  const { config, account, decision } = args;
  const entry = midpoint(decision.entryLow, decision.entryHigh, decision.trigger);
  const stop = finitePositive(decision.invalidation);
  const target = finitePositive(decision.target);
  const reasons: string[] = [];

  if (entry == null) reasons.push("No executable entry price was provided.");
  if (stop == null) reasons.push("No stop-loss/invalidation level was provided.");
  if (target == null) reasons.push("No take-profit target was provided.");
  if (entry == null || stop == null || target == null) return { intent: null, reasons };

  const riskPerUnit = Math.abs(entry - stop);
  if (riskPerUnit <= 0) reasons.push("Entry and stop-loss do not create positive risk.");

  const rr = deriveRiskReward(decision, entry, stop, target);
  if (rr == null || rr < config.risk.minRiskReward) {
    reasons.push(`Risk/reward is below minimum ${config.risk.minRiskReward}.`);
  }

  if (riskPerUnit <= 0 || reasons.length) return { intent: null, reasons };

  const baseRiskPct = decision.executionStatus === "caution"
    ? config.risk.maxRiskPerTradePct / 2
    : config.risk.maxRiskPerTradePct;
  const remainingOpenRiskPct = Math.max(0, config.risk.maxOpenRiskPct - account.openRiskPct);
  const riskPct = Math.max(0, Math.min(baseRiskPct, remainingOpenRiskPct));
  const riskAmount = account.equity * (riskPct / 100);
  const quantity = Math.floor((riskAmount / riskPerUnit) * 100000) / 100000;
  const notional = Math.round(quantity * entry * 100) / 100;

  if (riskPct <= 0 || riskAmount <= 0 || quantity <= 0 || notional <= 0) {
    return { intent: null, reasons: ["Calculated order size is zero."] };
  }

  return {
    reasons: [],
    intent: {
      signalId: decision.signalId ?? null,
      idempotencyKey: buildIdempotencyKey({
        ownerUserId: config.ownerUserId,
        decision,
        entry,
        stop,
        target,
      }),
      mode: config.safety.executionMode,
      instrument: decision.instrument,
      side: decision.side,
      orderType: "limit",
      timeInForce: "day",
      quantity,
      notional,
      estimatedEntry: entry,
      stopLoss: stop,
      takeProfit: target,
      riskPct,
      riskAmount: Math.round(riskAmount * 100) / 100,
      createdAt: new Date().toISOString(),
      rationale: [
        decision.reason || "Syntrake decision passed bot policy.",
        `Risk ${riskPct}% with RR ${Number(rr.toFixed(2))}.`,
      ],
    },
  };
}

export function planAutonomousBotCycle(args: {
  config: AutonomousBotConfig;
  account: BotAccountState;
  decision: BotMarketDecision;
}): BotCycleResult {
  const reasons = [
    ...validateSafety(args.config),
    ...validateMarketDecision(args.config, args.decision),
    ...validateAccount(args.config, args.account),
  ];

  if (reasons.length) {
    return {
      action: "blocked",
      mode: args.config.safety.executionMode,
      instrument: args.decision.instrument,
      reasons,
      intent: null,
    };
  }

  const order = createOrderIntent(args);
  if (!order.intent) {
    return {
      action: "blocked",
      mode: args.config.safety.executionMode,
      instrument: args.decision.instrument,
      reasons: order.reasons,
      intent: null,
    };
  }

  return {
    action: "ready",
    mode: args.config.safety.executionMode,
    instrument: args.decision.instrument,
    reasons: ["Bot policy passed. Order intent is ready."],
    intent: order.intent,
  };
}
