import type { AutopilotMode } from "@/lib/signalcore/modes";
import {
  extractMarketFeatures,
  extractMarketFeaturesBatch,
  type CandleLike,
  type MarketFeatureInput,
  type MarketFeatures,
  type VolatilityRegime,
} from "@/lib/engine/features";
import { computeProbabilitiesBatch } from "@/lib/engine/probabilityEngine";
import { rankOpportunities, type RankedOpportunity } from "@/lib/engine/opportunityRanking";
import { computePortfolioRisk, type PortfolioRiskOutput } from "@/lib/engine/portfolioRisk";
import { computeCapitalProtection, type CapitalProtectionOutput } from "@/lib/engine/capitalProtection";
import { detectMarketRegime, type MarketRegime } from "@/lib/engine/regimeDetection";
import { estimateExpectedMove } from "@/lib/engine/expectedMove";
import { computeProbabilityDistribution } from "@/lib/engine/probabilityDistribution";
import { recommendPositionSize } from "@/lib/engine/positionSizing";
import { computeOpportunityScore, sortScoredOpportunities } from "@/lib/engine/opportunityScore";

export type GovernanceDecision = "BUY" | "REDUCE" | "HOLD" | "AVOID";

export type GovernanceAssetInput = {
  asset: string;
  value_eur?: number | null;
  exposure_pct?: number | null;
  asset_class?: string | null;
  sector?: string | null;
  volatility_pct?: number | null;
  atr_pct?: number | null;
  marketData?: {
    price?: number | null;
    prevClose?: number | null;
    bid?: number | null;
    ask?: number | null;
    volume?: number | null;
    avgVolume?: number | null;
  } | null;
  historicalCandles?: CandleLike[] | null;
};

export type DecisionGovernanceInput = {
  enabled: boolean;
  probabilistic_enabled?: boolean;
  mode: AutopilotMode;
  asOf: string;
  assets: GovernanceAssetInput[];
  portfolio_total_eur?: number | null;
  drawdown_pct?: number | null;
  execution_quality_score?: number | null;
  coverage_pct?: number | null;
  max_single_position_pct?: number | null;
  action_gate?: { status?: string | null; allowExecution?: boolean | null } | null;
  risk_policy_eval?: { blocked?: boolean | null; status?: string | null } | null;
};

export type GovernanceDailyDecision = {
  asset: string | null;
  decision: GovernanceDecision;
  legacy_action_type: "ADD" | "REDUCE" | "HOLD" | "PAUSE";
  confidence: number;
  confidence_pct: number;
  expected_move: number;
  expected_value: number;
  recommended_position_pct: number;
  score: number;
  regime: MarketRegime | null;
  risk_level: PortfolioRiskOutput["risk_level"];
  reason_codes: string[];
};

export type OpportunityDashboardItem = {
  asset: string;
  score: number;
  probability_up: number;
  probability_down: number;
  expected_move: number;
  expected_value: number;
  recommended_position_pct: number;
  regime: MarketRegime;
  confidence: number;
  exposure_pct: number;
};

export type DecisionGovernanceOutput = {
  enabled: boolean;
  top_opportunities: RankedOpportunity[];
  opportunities: OpportunityDashboardItem[];
  portfolio_risk: PortfolioRiskOutput;
  daily_decision: GovernanceDailyDecision;
  decision_confidence: number;
  capital_protection: CapitalProtectionOutput;
  metadata: {
    precedence: string[];
    override: string | null;
    volatility_regime: VolatilityRegime;
    probabilistic_layer_enabled: boolean;
  };
};

type SharedState = {
  normalizedAssets: Array<GovernanceAssetInput & { asset: string; value_eur: number }>;
  portfolioTotal: number;
  maxSingle: number;
  exposureByAssetPct: Record<string, number>;
  featuresByAsset: Record<string, MarketFeatures>;
  portfolioRisk: PortfolioRiskOutput;
  actionGateStatus: string;
  gateBlocked: boolean;
  riskBlocked: boolean;
};

function clamp(x: number, min: number, max: number) {
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function round2(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

function round3(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 1000) / 1000;
}

function round4(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 10_000) / 10_000;
}

function safeNum(x: unknown, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function normalizedAsset(x: unknown) {
  return String(x || "").trim().toUpperCase();
}

function defaultPortfolioRisk(): PortfolioRiskOutput {
  return {
    risk_level: "low",
    concentration_warning: false,
    diversification_score: 100,
    concentration_top1_pct: 0,
    concentration_top3_pct: 0,
    volatility_exposure_pct: 0,
    exposure_by_asset_class: {},
    exposure_by_sector: {},
    correlation_clusters: [],
  };
}

function defaultDecision(reason = "governance_disabled"): GovernanceDailyDecision {
  return {
    asset: null,
    decision: "HOLD",
    legacy_action_type: "HOLD",
    confidence: 0.5,
    confidence_pct: 50,
    expected_move: 0,
    expected_value: 0,
    recommended_position_pct: 0,
    score: 0,
    regime: null,
    risk_level: "low",
    reason_codes: [reason],
  };
}

function legacyActionFromDecision(decision: GovernanceDecision) {
  if (decision === "BUY") return "ADD" as const;
  if (decision === "REDUCE") return "REDUCE" as const;
  if (decision === "AVOID") return "PAUSE" as const;
  return "HOLD" as const;
}

function weightedVolRegimeLegacy(ranked: RankedOpportunity[], featureRegimes: Record<string, VolatilityRegime>) {
  if (!ranked.length) return "medium" as VolatilityRegime;
  let low = 0;
  let medium = 0;
  let high = 0;
  for (const row of ranked) {
    const regime = featureRegimes[row.asset] || "medium";
    const weight = Math.max(0.001, Math.abs(row.expected_value) + 0.01);
    if (regime === "low") low += weight;
    else if (regime === "high") high += weight;
    else medium += weight;
  }
  if (high >= Math.max(low, medium)) return "high";
  if (low >= Math.max(medium, high)) return "low";
  return "medium";
}

function toVolatilityRegime(regime: MarketRegime): VolatilityRegime {
  if (regime === "high_volatility" || regime === "expansion") return "high";
  if (regime === "compression") return "low";
  return "medium";
}

function weightedVolRegimeFromProbRows(rows: OpportunityDashboardItem[]) {
  if (!rows.length) return "medium" as VolatilityRegime;
  let low = 0;
  let medium = 0;
  let high = 0;
  for (const row of rows) {
    const weight = Math.max(0.001, Math.abs(row.score) + 0.01);
    const mapped = toVolatilityRegime(row.regime);
    if (mapped === "low") low += weight;
    else if (mapped === "high") high += weight;
    else medium += weight;
  }
  if (high >= Math.max(low, medium)) return "high";
  if (low >= Math.max(medium, high)) return "low";
  return "medium";
}

function topCorrelationExposurePct(portfolioRisk: PortfolioRiskOutput) {
  const rows = Array.isArray(portfolioRisk.correlation_clusters) ? portfolioRisk.correlation_clusters : [];
  const top = rows[0];
  return Number.isFinite(Number(top?.exposure_pct)) ? Number(top?.exposure_pct) : 0;
}

function correlationRiskHigh(portfolioRisk: PortfolioRiskOutput) {
  return portfolioRisk.concentration_warning || topCorrelationExposurePct(portfolioRisk) >= 65;
}

function buildSharedState(input: DecisionGovernanceInput): SharedState {
  const assets = Array.isArray(input.assets) ? input.assets : [];
  const normalizedAssets = assets
    .map((a) => ({
      ...a,
      asset: normalizedAsset(a.asset),
      value_eur: safeNum(a.value_eur, 0),
    }))
    .filter((a) => a.asset.length > 0);
  const portfolioTotal =
    safeNum(input.portfolio_total_eur, NaN) > 0
      ? safeNum(input.portfolio_total_eur, 0)
      : normalizedAssets.reduce((acc, a) => acc + Math.max(0, safeNum(a.value_eur, 0)), 0);
  const maxSingle = clamp(safeNum(input.max_single_position_pct, 22), 5, 80);

  const exposureByAssetPct: Record<string, number> = {};
  for (const asset of normalizedAssets) {
    const explicit = Number(asset.exposure_pct);
    const inferred = portfolioTotal > 0 ? (Math.max(0, safeNum(asset.value_eur, 0)) / portfolioTotal) * 100 : 0;
    exposureByAssetPct[asset.asset] = clamp(Number.isFinite(explicit) ? explicit : inferred, 0, 100);
  }

  const featureInputs: MarketFeatureInput[] = normalizedAssets.map((asset) => ({
    asset: asset.asset,
    marketData: asset.marketData ?? null,
    historicalCandles: asset.historicalCandles ?? null,
    volatilityMeasures: {
      realizedVol: asset.volatility_pct != null ? Number(asset.volatility_pct) / 100 : null,
      atrPct: asset.atr_pct ?? null,
    },
  }));

  const featuresByAsset = extractMarketFeaturesBatch(featureInputs);
  for (const asset of normalizedAssets) {
    if (!featuresByAsset[asset.asset]) {
      featuresByAsset[asset.asset] = extractMarketFeatures({
        asset: asset.asset,
        marketData: asset.marketData ?? null,
        historicalCandles: asset.historicalCandles ?? null,
        volatilityMeasures: {
          realizedVol: asset.volatility_pct != null ? Number(asset.volatility_pct) / 100 : null,
          atrPct: asset.atr_pct ?? null,
        },
      });
    }
  }

  const portfolioRisk = normalizedAssets.length
    ? computePortfolioRisk({
        holdings: normalizedAssets.map((asset) => ({
          asset: asset.asset,
          value_eur: safeNum(asset.value_eur, 0),
          asset_class: asset.asset_class ?? null,
          sector: asset.sector ?? null,
          volatility_pct: asset.volatility_pct ?? null,
        })),
        total_value_eur: portfolioTotal,
      })
    : defaultPortfolioRisk();

  const actionGateStatus = String(input.action_gate?.status || "").trim().toLowerCase();
  const gateBlocked = actionGateStatus === "blocked" || input.action_gate?.allowExecution === false;
  const riskBlocked =
    Boolean(input.risk_policy_eval?.blocked) ||
    String(input.risk_policy_eval?.status || "").trim().toLowerCase() === "block";

  return {
    normalizedAssets,
    portfolioTotal,
    maxSingle,
    exposureByAssetPct,
    featuresByAsset,
    portfolioRisk,
    actionGateStatus,
    gateBlocked,
    riskBlocked,
  };
}

function buildLegacyPath(input: DecisionGovernanceInput, state: SharedState): DecisionGovernanceOutput {
  const probabilityInputs = state.normalizedAssets.map((asset) => ({
    asset: asset.asset,
    features: state.featuresByAsset[asset.asset],
    volatilityPct: asset.volatility_pct ?? null,
  }));
  const probabilities = computeProbabilitiesBatch(probabilityInputs);
  const ranked = rankOpportunities({
    probabilities,
    exposureByAssetPct: state.exposureByAssetPct,
    maxSinglePositionPct: state.maxSingle,
  }).slice(0, 8);

  const regimeByAsset: Record<string, VolatilityRegime> = {};
  for (const [asset, f] of Object.entries(state.featuresByAsset)) {
    regimeByAsset[asset] = f.volatility_regime;
  }
  const globalRegime = weightedVolRegimeLegacy(ranked, regimeByAsset);
  const protection = computeCapitalProtection({
    drawdown_pct: input.drawdown_pct,
    volatility_regime: globalRegime,
    execution_quality_score: input.execution_quality_score,
    action_gate_status: state.actionGateStatus,
    risk_policy_blocked: state.riskBlocked,
    correlation_risk_high: correlationRiskHigh(state.portfolioRisk),
  });

  const precedence = [
    "RiskPolicy hard-stop",
    "ActionGate hard-stop",
    "CapitalProtection bias",
    "Probability and opportunity ranking",
  ];

  if (!input.enabled) {
    return {
      enabled: false,
      top_opportunities: ranked.slice(0, 5),
      opportunities: [],
      portfolio_risk: state.portfolioRisk,
      daily_decision: defaultDecision("governance_disabled"),
      decision_confidence: 0.5,
      capital_protection: protection,
      metadata: {
        precedence,
        override: "disabled_by_feature_flag",
        volatility_regime: globalRegime,
        probabilistic_layer_enabled: false,
      },
    };
  }

  let decision: GovernanceDecision = "HOLD";
  let decisionAsset: string | null = ranked[0]?.asset ?? null;
  let reasonCodes: string[] = [];
  let override: string | null = null;

  if (state.riskBlocked) {
    decision = "AVOID";
    decisionAsset = null;
    reasonCodes = ["risk_policy_blocked"];
    override = "risk_policy";
  } else if (state.gateBlocked) {
    decision = "AVOID";
    decisionAsset = null;
    reasonCodes = ["action_gate_blocked"];
    override = "action_gate";
  } else if (!ranked.length) {
    decision = "HOLD";
    decisionAsset = null;
    reasonCodes = ["no_ranked_opportunity"];
  } else {
    const top = ranked[0];
    const expectedValue = Number(top.expected_value);
    const overConcentration = Number(top.exposure_pct) > state.maxSingle * 1.05;

    if (protection.protection_mode) {
      if (expectedValue < -0.18 || overConcentration || state.portfolioRisk.concentration_warning) {
        decision = "REDUCE";
        reasonCodes = ["capital_protection_reduce"];
      } else {
        decision = "HOLD";
        reasonCodes = ["capital_protection_hold"];
      }
      override = "capital_protection";
    } else if (expectedValue >= 0.22 && Number(top.prob_up) >= 0.56 && !overConcentration) {
      decision = "BUY";
      reasonCodes = ["expected_value_positive", "prob_up_high"];
    } else if (expectedValue <= -0.2 || overConcentration) {
      decision = "REDUCE";
      reasonCodes = overConcentration ? ["concentration_over_limit"] : ["expected_value_negative"];
    } else if (Number(top.prob_up) <= 0.46 && Number(top.expected_move) < 0) {
      decision = "AVOID";
      reasonCodes = ["downside_probability_bias"];
    } else {
      decision = "HOLD";
      reasonCodes = ["edge_not_strong_enough"];
    }
  }

  const top = ranked[0];
  let confidence = top ? Number(top.confidence) : 0.5;
  if (override === "risk_policy" || override === "action_gate") confidence = 0.9;
  if (state.portfolioRisk.risk_level === "high") confidence -= 0.12;
  else if (state.portfolioRisk.risk_level === "moderate") confidence -= 0.06;
  confidence = clamp(confidence, 0.05, 0.99);
  const confidencePct = Math.round(confidence * 100);

  const opportunitiesLegacy = sortScoredOpportunities(
    ranked.map((row) => {
      const feature = state.featuresByAsset[row.asset];
      const regime = (feature?.volatility_regime === "high"
        ? "high_volatility"
        : feature?.volatility_regime === "low"
          ? "compression"
          : "range") as MarketRegime;
      const posSize = recommendPositionSize({
        portfolio_risk_level: state.portfolioRisk.risk_level,
        expected_value: Number(row.expected_value),
        volatility_pct: Number(feature?.volatility_score ?? 0) * 100,
        capital_protection_multiplier: protection.position_size_multiplier,
        max_single_position_pct: state.maxSingle,
      }).recommended_position_pct;
      return {
        asset: row.asset,
        score: round4(Number(row.expected_value)),
        probability_up: round4(Number(row.prob_up)),
        probability_down: round4(Number(row.prob_down)),
        expected_move: round4(Number(row.expected_move)),
        expected_value: round4(Number(row.expected_value)),
        recommended_position_pct: round3(state.riskBlocked || state.gateBlocked ? 0 : posSize),
        regime,
        confidence: round4(Number(row.confidence)),
        exposure_pct: round2(Number(row.exposure_pct)),
      } satisfies OpportunityDashboardItem;
    }),
  ).slice(0, 8);

  const dailyDecision: GovernanceDailyDecision = {
    asset: decisionAsset,
    decision,
    legacy_action_type: legacyActionFromDecision(decision),
    confidence: round3(confidence),
    confidence_pct: confidencePct,
    expected_move: round3(Number(top?.expected_move || 0)),
    expected_value: round3(Number(top?.expected_value || 0)),
    recommended_position_pct:
      decision === "BUY" || decision === "REDUCE"
        ? round3(opportunitiesLegacy[0]?.recommended_position_pct || 0)
        : 0,
    score: round4(Number(opportunitiesLegacy[0]?.score || 0)),
    regime: opportunitiesLegacy[0]?.regime ?? null,
    risk_level: state.portfolioRisk.risk_level,
    reason_codes: reasonCodes,
  };

  return {
    enabled: true,
    top_opportunities: ranked.slice(0, 5),
    opportunities: opportunitiesLegacy.slice(0, 5),
    portfolio_risk: state.portfolioRisk,
    daily_decision: dailyDecision,
    decision_confidence: dailyDecision.confidence,
    capital_protection: protection,
    metadata: {
      precedence,
      override,
      volatility_regime: globalRegime,
      probabilistic_layer_enabled: false,
    },
  };
}

function normalizedVolatilityPct(asset: GovernanceAssetInput & { asset: string; value_eur: number }, feature: MarketFeatures) {
  const vol = Number(asset.volatility_pct);
  if (Number.isFinite(vol) && vol >= 0) return clamp(vol, 0, 200);
  return clamp(Number(feature.volatility_score) * 70, 1, 200);
}

function normalizedAtrPct(
  asset: GovernanceAssetInput & { asset: string; value_eur: number },
  volatilityPct: number,
  feature: MarketFeatures,
) {
  const atrRaw = Number(asset.atr_pct);
  if (Number.isFinite(atrRaw) && atrRaw > 0) return clamp(atrRaw, 0.01, 50);
  // Deterministic fallback from realized volatility and structure.
  const compressionAdj = 1 - clamp(Number(feature.range_compression), 0, 1) * 0.3;
  return clamp(volatilityPct * 0.11 * compressionAdj, 0.4, 12);
}

function buildProbabilisticPath(input: DecisionGovernanceInput, state: SharedState): DecisionGovernanceOutput {
  const baseRows = state.normalizedAssets.map((asset) => {
    const feature = state.featuresByAsset[asset.asset];
    const volatilityPct = normalizedVolatilityPct(asset, feature);
    const atrPct = normalizedAtrPct(asset, volatilityPct, feature);
    const regime = detectMarketRegime({
      trend_score: feature.trend_score,
      momentum: feature.momentum,
      volatility_pct: volatilityPct,
      atr_pct: atrPct,
      compression_score: feature.range_compression,
    });
    const move = estimateExpectedMove({
      atr_pct: atrPct,
      volatility_regime: feature.volatility_regime,
      compression_score: feature.range_compression,
      momentum: feature.momentum,
    });
    const distribution = computeProbabilityDistribution({
      trend_score: feature.trend_score,
      momentum: feature.momentum,
      regime: regime.regime,
      volatility_pct: volatilityPct,
      liquidity_pressure: feature.liquidity_pressure,
    });
    const edge = distribution.prob_up - distribution.prob_down;
    const expectedValueRaw =
      move.expected_move_pct * edge * (1 - clamp(Number(feature.liquidity_pressure), 0, 1) * 0.45);
    const expectedValue = round4(expectedValueRaw);
    const exposure = clamp(Number(state.exposureByAssetPct[asset.asset] || 0), 0, 100);
    const overflow = Math.max(0, exposure - state.maxSingle);
    const score = computeOpportunityScore({
      prob_up: distribution.prob_up,
      prob_down: distribution.prob_down,
      expected_move_pct: move.expected_move_pct,
      portfolio_risk_level: state.portfolioRisk.risk_level,
      concentration_overflow_pct: overflow,
    }).score;
    const confidence = round4(
      clamp(Math.abs(edge) * 0.72 + Number(regime.confidence) * 0.28, 0.05, 0.99),
    );

    return {
      asset: asset.asset,
      score,
      probability_up: distribution.prob_up,
      probability_down: distribution.prob_down,
      expected_move: move.expected_move_pct,
      expected_value: expectedValue,
      recommended_position_pct: 0,
      regime: regime.regime,
      confidence,
      exposure_pct: round2(exposure),
      volatility_pct: round4(volatilityPct),
      over_concentration: overflow > 0,
    };
  });

  const globalRegime = weightedVolRegimeFromProbRows(baseRows);
  const protection = computeCapitalProtection({
    drawdown_pct: input.drawdown_pct,
    volatility_regime: globalRegime,
    execution_quality_score: input.execution_quality_score,
    action_gate_status: state.actionGateStatus,
    risk_policy_blocked: state.riskBlocked,
    correlation_risk_high: correlationRiskHigh(state.portfolioRisk),
  });

  const opportunities = sortScoredOpportunities(
    baseRows.map((row) => {
      const position = recommendPositionSize({
        portfolio_risk_level: state.portfolioRisk.risk_level,
        expected_value: row.expected_value,
        volatility_pct: row.volatility_pct,
        capital_protection_multiplier: protection.position_size_multiplier,
        max_single_position_pct: state.maxSingle,
      }).recommended_position_pct;
      return {
        ...row,
        recommended_position_pct: round3(state.riskBlocked || state.gateBlocked ? 0 : position),
      } satisfies OpportunityDashboardItem & { over_concentration: boolean; volatility_pct: number };
    }),
  ).slice(0, 8);

  const topOpportunities: RankedOpportunity[] = opportunities.slice(0, 5).map((row) => ({
    asset: row.asset,
    expected_value: round4(row.expected_value),
    expected_move: round4(row.expected_move),
    confidence: round4(row.confidence),
    prob_up: round4(row.probability_up),
    prob_down: round4(row.probability_down),
    exposure_pct: round4(row.exposure_pct),
  }));

  const precedence = [
    "RiskPolicy hard-stop",
    "ActionGate hard-stop",
    "CapitalProtection bias",
    "Opportunity score and probabilistic ranking",
  ];

  if (!input.enabled) {
    return {
      enabled: false,
      top_opportunities: topOpportunities,
      opportunities: opportunities.slice(0, 5),
      portfolio_risk: state.portfolioRisk,
      daily_decision: defaultDecision("governance_disabled"),
      decision_confidence: 0.5,
      capital_protection: protection,
      metadata: {
        precedence,
        override: "disabled_by_feature_flag",
        volatility_regime: globalRegime,
        probabilistic_layer_enabled: true,
      },
    };
  }

  let decision: GovernanceDecision = "HOLD";
  let decisionAsset: string | null = opportunities[0]?.asset ?? null;
  let reasonCodes: string[] = [];
  let override: string | null = null;

  if (state.riskBlocked) {
    decision = "AVOID";
    decisionAsset = null;
    reasonCodes = ["risk_policy_blocked"];
    override = "risk_policy";
  } else if (state.gateBlocked) {
    decision = "AVOID";
    decisionAsset = null;
    reasonCodes = ["action_gate_blocked"];
    override = "action_gate";
  } else if (!opportunities.length) {
    decision = "HOLD";
    decisionAsset = null;
    reasonCodes = ["no_ranked_opportunity"];
  } else {
    const top = opportunities[0] as OpportunityDashboardItem & { over_concentration?: boolean };
    const overConcentration = Boolean(top.over_concentration) || Number(top.exposure_pct) > state.maxSingle;

    if (protection.protection_mode) {
      if (Number(top.score) <= -0.2 || overConcentration || state.portfolioRisk.concentration_warning) {
        decision = "REDUCE";
        reasonCodes = ["capital_protection_reduce"];
      } else {
        decision = "HOLD";
        reasonCodes = ["capital_protection_hold"];
      }
      override = "capital_protection";
    } else if (Number(top.score) >= 0.22 && Number(top.probability_up) >= 0.56 && !overConcentration) {
      decision = "BUY";
      reasonCodes = ["opportunity_score_high", "probability_up_high"];
    } else if (Number(top.score) <= -0.2 || overConcentration) {
      decision = "REDUCE";
      reasonCodes = overConcentration ? ["concentration_over_limit"] : ["opportunity_score_negative"];
    } else {
      decision = "HOLD";
      reasonCodes = ["edge_not_strong_enough"];
    }
  }

  const top = opportunities[0];
  let confidence = top ? Number(top.confidence) : 0.5;
  if (override === "risk_policy" || override === "action_gate") confidence = 0.9;
  if (state.portfolioRisk.risk_level === "high") confidence -= 0.12;
  else if (state.portfolioRisk.risk_level === "moderate") confidence -= 0.06;
  confidence = clamp(confidence, 0.05, 0.99);
  const confidencePct = Math.round(confidence * 100);

  const dailyDecision: GovernanceDailyDecision = {
    asset: decisionAsset,
    decision,
    legacy_action_type: legacyActionFromDecision(decision),
    confidence: round3(confidence),
    confidence_pct: confidencePct,
    expected_move: round3(Number(top?.expected_move || 0)),
    expected_value: round3(Number(top?.expected_value || 0)),
    recommended_position_pct:
      decision === "BUY" || decision === "REDUCE"
        ? round3(Number(top?.recommended_position_pct || 0))
        : 0,
    score: round4(Number(top?.score || 0)),
    regime: top?.regime ?? null,
    risk_level: state.portfolioRisk.risk_level,
    reason_codes: reasonCodes,
  };

  return {
    enabled: true,
    top_opportunities: topOpportunities,
    opportunities: opportunities.slice(0, 5),
    portfolio_risk: state.portfolioRisk,
    daily_decision: dailyDecision,
    decision_confidence: dailyDecision.confidence,
    capital_protection: protection,
    metadata: {
      precedence,
      override,
      volatility_regime: globalRegime,
      probabilistic_layer_enabled: true,
    },
  };
}

export function computeDecisionGovernance(input: DecisionGovernanceInput): DecisionGovernanceOutput {
  const shared = buildSharedState(input);
  const probabilisticEnabled = Boolean(input.probabilistic_enabled);
  if (!probabilisticEnabled) {
    return buildLegacyPath(input, shared);
  }
  return buildProbabilisticPath(input, shared);
}
