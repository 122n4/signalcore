import { loadBrokerConnection } from "@/lib/broker/store";
import {
  evaluateResearchPaperPromotionApproval,
  resolveResearchPaperPromotionApproval,
} from "@/lib/trading/research/paperPromotion";
import { readResearchLabRemoteSnapshot } from "@/lib/trading/research/supabaseSync";
import type {
  ResearchPaperPromotionApproval,
  ResearchPaperPromotionSnapshot,
} from "@/lib/trading/research/types";
import { readLatestTradingScannerSnapshots } from "@/lib/trading/scannerSnapshotStore";
import type { ComposeTradingLiveDecisionInput } from "@/lib/trading/state";

import {
  buildPaperOnlyBotConfig,
  buildRealMoneyWhenArmedBotConfig,
  planAutonomousBotCycle,
} from "./policy";
import type { BotAutonomyOption, BotMarketDecision } from "./types";

export type BotSnapshotPlan = {
  option: BotAutonomyOption;
  armed: boolean;
  generatedAt: string;
  candidate: ComposeTradingLiveDecisionInput | null;
  decision: BotMarketDecision | null;
  account: {
    equity: number;
    currency: string;
    openPositions: number;
    openRiskPct: number;
    dailyLossPct: number;
    tradesToday: number;
    consecutiveLosses: number;
  } | null;
  plan: ReturnType<typeof planAutonomousBotCycle> | null;
  researchApproval: ResearchPaperPromotionApproval | null;
  readError: string | null;
};

export function parseBotOption(value: string | null): BotAutonomyOption {
  return value === "real_money_when_armed" ? "real_money_when_armed" : "paper_only";
}

export function parseLiveAcknowledgement(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

function parseTargetZone(value: string | null | undefined) {
  const raw = String(value || "");
  const numbers = raw.match(/-?\d+(?:\.\d+)?/g)?.map((item) => Number(item)) ?? [];
  const valid = numbers.filter((item) => Number.isFinite(item) && item > 0);
  if (!valid.length) return null;
  if (valid.length === 1) return valid[0];
  return (valid[0] + valid[1]) / 2;
}

function buildResearchBlockedPlan(args: {
  option: BotAutonomyOption;
  instrument: string;
  reason: string;
}) {
  return {
    action: "blocked" as const,
    mode: args.option === "real_money_when_armed" ? "live" as const : "paper" as const,
    instrument: args.instrument,
    reasons: [args.reason],
    intent: null,
  };
}

function candidateScore(input: ComposeTradingLiveDecisionInput) {
  const isTradeValid = input.decisionCore.decision.currentState === "TRADE_VALID" ? 1000 : 0;
  const isAllowed = input.executionPlan.executionStatus.executionStatus === "allowed" ? 250 : 0;
  const isCaution = input.executionPlan.executionStatus.executionStatus === "caution" ? 100 : 0;
  const isFresh = input.scannerSnapshot?.actionableFreshness ? 180 : 0;
  const isOpen = input.market.session.marketOpen ? 120 : 0;
  const confidence = Number(input.decisionCore.decision.confidence || 0);
  const setupQuality = Number(input.setupCore.quality.score || 0);
  return isTradeValid + isAllowed + isCaution + isFresh + isOpen + confidence + setupQuality;
}

export function selectBotCandidate(inputs: ComposeTradingLiveDecisionInput[]) {
  if (!inputs.length) return null;
  return inputs.slice().sort((left, right) => candidateScore(right) - candidateScore(left))[0] ?? null;
}

export function toBotDecision(input: ComposeTradingLiveDecisionInput): BotMarketDecision {
  const entry = input.executionPlan.entryZone;
  const invalidation = input.executionPlan.invalidation;
  const path = input.executionPlan.tradePath;
  const setup = input.setupCore.setup;
  const decision = input.decisionCore.decision;
  const side = setup.direction === "short" ? "sell" : "buy";

  return {
    instrument: input.snapshot.instrument,
    side,
    tradeValid: decision.currentState === "TRADE_VALID",
    executionStatus: input.executionPlan.executionStatus.executionStatus,
    marketOpen: input.market.session.marketOpen,
    snapshotFresh: Boolean(input.scannerSnapshot?.actionableFreshness),
    snapshotAt: input.snapshot.snapshotAt,
    trigger: entry.triggerLevel ?? setup.triggerLevel ?? null,
    entryLow: entry.entryZoneLow ?? null,
    entryHigh: entry.entryZoneHigh ?? null,
    invalidation: invalidation.invalidationLevel ?? setup.invalidationLevel ?? null,
    target: parseTargetZone(path.targetZone),
    confidence: decision.confidence,
    riskReward: path.riskRewardEstimate ?? null,
    reason: decision.reasons[0] ?? decision.primaryMessage ?? null,
  };
}

export async function buildBotAccountState(userId: string) {
  const fallback = {
    equity: 10000,
    currency: "EUR",
    openPositions: 0,
    openRiskPct: 0,
    dailyLossPct: 0,
    tradesToday: 0,
    consecutiveLosses: 0,
  };

  try {
    const connection = await loadBrokerConnection(userId);
    const equity = Number(connection.snapshot?.totalEur);
    return {
      ...fallback,
      equity: Number.isFinite(equity) && equity > 0 ? Math.round(equity * 100) / 100 : fallback.equity,
      openPositions: connection.snapshot?.positions?.length ?? 0,
    };
  } catch {
    return fallback;
  }
}

export async function buildBotSnapshotPlan(args: {
  userId: string;
  option: BotAutonomyOption;
  armedAt: string | null;
  asOf?: string;
}): Promise<BotSnapshotPlan> {
  const generatedAt = args.asOf ?? new Date().toISOString();
  const stored = await readLatestTradingScannerSnapshots({ asOf: generatedAt });
  const candidate = selectBotCandidate(stored.inputs);

  if (!candidate) {
    return {
      option: args.option,
      armed: Boolean(args.armedAt),
      generatedAt,
      candidate: null,
      decision: null,
      account: null,
      plan: null,
      researchApproval: null,
      readError: stored.error ?? null,
    };
  }

  const account = await buildBotAccountState(args.userId);
  const config =
    args.option === "real_money_when_armed" && args.armedAt
      ? buildRealMoneyWhenArmedBotConfig({ ownerUserId: args.userId, operatorAcknowledgedAt: args.armedAt })
      : buildPaperOnlyBotConfig(args.userId);
  const decision = toBotDecision(candidate);
  let researchApproval = await resolveResearchPaperPromotionApproval({ candidate });
  if (researchApproval.source === "missing") {
    const remote = await readResearchLabRemoteSnapshot({ runLimit: 20, decisionLimit: 40 });
    const remoteSnapshot = (remote.state?.payload?.paperPromotion ?? null) as ResearchPaperPromotionSnapshot | null;
    if (remoteSnapshot) {
      researchApproval = evaluateResearchPaperPromotionApproval({
        candidate,
        snapshot: remoteSnapshot,
        source: "remote_state",
      });
    }
  }
  const policyPlan = planAutonomousBotCycle({ config, account, decision });
  const plan =
    args.option === "real_money_when_armed" && !researchApproval.approved
      ? buildResearchBlockedPlan({
          option: args.option,
          instrument: decision.instrument,
          reason: researchApproval.reason,
        })
      : policyPlan;

  return {
    option: args.option,
    armed: Boolean(args.armedAt),
    generatedAt,
    candidate,
    decision,
    account,
    plan,
    researchApproval,
    readError: stored.error ?? null,
  };
}
