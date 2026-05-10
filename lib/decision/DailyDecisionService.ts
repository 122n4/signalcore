import { attachDecisionEnvelopeToDailyBundle } from "./adapters/toLegacyDailyBundle";
import { composeDecisionEnvelope } from "./composeDecisionEnvelope";
import type { ComposeTradingLiveDecisionInput } from "@/lib/trading/state";
import { projectLegacyDecisionFields } from "./projectors/toLegacyDecisionFields";
import type { DecisionEnvelope, DecisionEnvelopeBranch } from "./types";
import type { AutopilotMode } from "@/lib/signalcore/modes";

export type DailyDecisionServiceResponseLike = {
  mode: AutopilotMode;
  asOf: string;
  daily: Record<string, any>;
  derived?: Record<string, any>;
};

export type BuildDailyDecisionPayloadInput<T extends DailyDecisionServiceResponseLike> = {
  response: T;
  branch: DecisionEnvelopeBranch;
  branchReason: string | null;
  tradingLiveInput?: ComposeTradingLiveDecisionInput | null;
  tradingWatchlistInputs?: ComposeTradingLiveDecisionInput[] | null;
};

export type BuildDailyDecisionPayloadOutput<T extends DailyDecisionServiceResponseLike> = {
  response: T & {
    daily: T["daily"] & {
      decisionEnvelope: DecisionEnvelope;
    };
  };
  decisionEnvelope: DecisionEnvelope;
  daily: Record<string, any>;
  derived: Record<string, any> | null;
};

function safeObj<T = Record<string, any>>(x: any): T | Record<string, never> {
  return x && typeof x === "object" ? (x as T) : {};
}

function objOrNull<T = Record<string, any>>(x: any): T | null {
  return x && typeof x === "object" ? (x as T) : null;
}

export function buildDailyDecisionPayload<T extends DailyDecisionServiceResponseLike>(
  args: BuildDailyDecisionPayloadInput<T>,
): BuildDailyDecisionPayloadOutput<T> {
  const dailyNode = safeObj<Record<string, any>>(args.response.daily);
  const hasDerivedNode = Object.prototype.hasOwnProperty.call(args.response, "derived");
  const rawDerivedNode = hasDerivedNode ? (args.response as any).derived : null;
  const derivedNode = safeObj<Record<string, any>>(rawDerivedNode);
  const riskPolicyNode = safeObj<Record<string, any>>((dailyNode as any).riskPolicy || (derivedNode as any).riskPolicy);

  const envelope = composeDecisionEnvelope({
    mode: args.response.mode,
    asOf: args.response.asOf,
    branch: args.branch,
    branchReason: args.branchReason,
    nextBestAction: objOrNull((dailyNode as any).nextBestAction),
    whyNow: objOrNull((dailyNode as any).whyNow || (derivedNode as any).whyNow),
    operationalAction: objOrNull((dailyNode as any).operationalAction || (derivedNode as any).operationalAction),
    decisionGovernance: objOrNull((dailyNode as any).decisionGovernance || (derivedNode as any).decisionGovernance),
    actionGate: objOrNull((dailyNode as any).actionGate || (derivedNode as any).actionGate),
    riskPolicyEval: objOrNull((riskPolicyNode as any).evaluation),
    capitalStatus: objOrNull((dailyNode as any).capitalStatus),
    decisionScores: objOrNull((dailyNode as any).scores),
    performance: objOrNull((dailyNode as any).performance),
    profileBenchmark: objOrNull((dailyNode as any).profileBenchmark),
    executionCoach: objOrNull((dailyNode as any).executionCoach),
    executionScore: objOrNull((dailyNode as any).executionScore),
    diagnostics: objOrNull((derivedNode as any).diagnostics),
    engineV4: objOrNull((dailyNode as any).engineV4),
    tradingLiveInput: args.tradingLiveInput ?? null,
    tradingWatchlistInputs: args.tradingWatchlistInputs ?? null,
  });

  const projectedLegacyFields = projectLegacyDecisionFields({
    envelope,
    daily: dailyNode,
    derived: hasDerivedNode ? rawDerivedNode : null,
    includeNextBestAction: true,
    includeScores: true,
  });

  const responseWithProjectedLegacyFields = {
    ...args.response,
    daily: projectedLegacyFields.daily,
    ...(hasDerivedNode ? { derived: projectedLegacyFields.derived ?? derivedNode } : {}),
  } as T;

  const finalizedResponse = attachDecisionEnvelopeToDailyBundle({
    response: responseWithProjectedLegacyFields,
    envelope,
  });

  return {
    response: finalizedResponse,
    decisionEnvelope: envelope,
    daily: finalizedResponse.daily,
    derived: hasDerivedNode ? ((finalizedResponse as any).derived ?? null) : null,
  };
}
