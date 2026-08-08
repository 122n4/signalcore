import { createInvestingFingerprint } from "@/lib/investing/persistence";
import type { InvestingEngineV1CustomerBridgeResult } from "@/lib/investing/engineV1CustomerBridge";
import type { InvestingExecutionPlan } from "@/lib/investing/types";
import type { InvestingRuntimeSnapshot } from "@/lib/investing/runtimeAdapter";

export const CUSTOMER_DECISION_PROJECTION_VERSION = "investing-customer-decision-projection/v1" as const;

export type CustomerDecisionState =
  | "setup_required"
  | "no_trade"
  | "paper_ready"
  | "review_required"
  | "blocked"
  | "degraded";

export type CustomerDecisionProjection = {
  contractVersion: typeof CUSTOMER_DECISION_PROJECTION_VERSION;
  projectionId: string;
  asOf: string;
  state: CustomerDecisionState;
  source: {
    primaryEngine: "runtime_adapter";
    primaryEngineVersion: "investing_runtime_adapter/v1";
    engineV1Bridge: {
      contractVersion: "investing-engine-v1-client-bridge/v1";
      status: "phase3f_shadow_connected" | "phase3f_unavailable";
      finalPhase3FConnected: boolean;
      operationalPrimary: false;
      reason: string;
      requiredBeforeActivation: string[];
      shadow: InvestingEngineV1CustomerBridgeResult | null;
    };
  };
  summary: {
    headline: string;
    detail: string;
    confidence: "low" | "medium" | "high";
  };
  action: {
    type: InvestingExecutionPlan["decision"] | "setup_required";
    approvalStatus: InvestingExecutionPlan["approvalStatus"] | "not_available";
    approvalRequired: boolean;
    expiresAt: string | null;
    allowedResponses: string[];
  };
  portfolio: {
    totalEur: number;
    cashEur: number;
    holdingsCount: number;
    targetAllocations: {
      symbol: string;
      assetClass: string;
      targetWeightPct: number;
      targetValueEur: number;
      rationale: string;
    }[];
    actions: {
      symbol: string;
      side: "buy" | "sell" | "hold";
      currentWeightPct: number;
      targetWeightPct: number;
      deltaWeightPct: number;
      deltaValueEur: number;
      rationale: string;
    }[];
  };
  risk: {
    objective: string | null;
    riskProfile: string | null;
    horizon: string | null;
    governanceStatus: string;
    executionClearance: string;
    turnoverBucket: string;
    taxFrictionBucket: string;
    blockers: string[];
    warnings: string[];
  };
  costs: {
    estimatedRoundTripCostEur: number;
    feeBudgetEur: number;
    estimatedSlippageBps: number;
  };
  dataQuality: {
    pricingCoveragePct: number;
    missingPriceSymbols: string[];
    valuationSource: "market_quotes" | "cost_basis_fallback" | "empty";
  };
  marketSnapshot: {
    snapshotId: string;
    asOf: string;
    hash: string;
    source: "volatile_provider_quotes" | "provider_quotes";
    immutableInDatabase: boolean;
    quotes: {
      symbol: string;
      price: number | null;
      source: string | null;
      asOf: string | null;
    }[];
  };
  researchPublication: {
    contractVersion: "investing-research-publication-boundary/v1";
    status: "heuristic_validation_only";
    publicationId: string;
    benchmarkId: string | null;
    benchmarkName: string | null;
    validationStatus: string;
    scorecardCount: number;
    warnings: string[];
    disclaimer: string;
  };
  performanceAttribution: {
    contractVersion: "investing-performance-attribution/v1";
    status: "position_level_unrealized_only" | "unavailable";
    totalUnrealizedPnlEur: number | null;
    positions: {
      symbol: string;
      marketValueEur: number;
      costBasisEur: number | null;
      unrealizedPnlEur: number | null;
    }[];
    limitations: string[];
  };
};

function safeNumber(value: unknown, fallback = 0) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizeIso(value: unknown) {
  const date = new Date(String(value || ""));
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function buildMarketSnapshot(args: {
  asOf: string;
  quotes: Record<string, any> | null | undefined;
  symbols: string[];
}): CustomerDecisionProjection["marketSnapshot"] {
  const rows = Array.from(new Set(args.symbols.map((symbol) => String(symbol || "").trim().toUpperCase()).filter(Boolean)))
    .sort()
    .map((symbol) => {
      const quote = args.quotes?.[symbol] ?? {};
      const price = Number(quote?.price ?? Number.NaN);
      const quoteAsOf = quote?.asOf ?? quote?.timestamp ?? quote?.time ?? null;
      return {
        symbol,
        price: Number.isFinite(price) && price > 0 ? price : null,
        source: quote?.source ? String(quote.source) : null,
        asOf: quoteAsOf ? normalizeIso(quoteAsOf) : null,
      };
    });
  const hash = createInvestingFingerprint({ asOf: args.asOf, rows });
  return {
    snapshotId: `volatile_market_${hash.slice(0, 24)}`,
    asOf: args.asOf,
    hash,
    source: "volatile_provider_quotes",
    immutableInDatabase: false,
    quotes: rows,
  };
}

function deriveState(args: {
  hasPlan: boolean;
  runtime: InvestingRuntimeSnapshot | null;
  executionPlan: InvestingExecutionPlan | null;
  pricingCoveragePct: number;
}): CustomerDecisionState {
  if (!args.hasPlan || !args.runtime || !args.executionPlan) return "setup_required";
  if (args.executionPlan.decision === "blocked" || args.runtime.governancePolicy.executionClearance === "blocked") return "blocked";
  if (args.executionPlan.decision === "manual_execute" || args.executionPlan.approvalRequired) return "review_required";
  if (args.pricingCoveragePct < 80 || args.runtime.executionPolicy.governanceStatus === "review") return "degraded";
  if (args.executionPlan.decision === "paper_execute") return "paper_ready";
  return "no_trade";
}

function headlineFor(state: CustomerDecisionState) {
  if (state === "setup_required") return "Setup required";
  if (state === "blocked") return "Decision blocked";
  if (state === "review_required") return "Review required";
  if (state === "paper_ready") return "Paper proposal ready";
  if (state === "degraded") return "Decision available with data warnings";
  return "Hold";
}

function confidenceFor(args: { state: CustomerDecisionState; pricingCoveragePct: number }) {
  if (args.state === "blocked" || args.state === "setup_required" || args.pricingCoveragePct < 50) return "low";
  if (args.state === "degraded" || args.pricingCoveragePct < 90) return "medium";
  return "high";
}

function allowedResponsesFor(state: CustomerDecisionState) {
  if (state === "setup_required") return ["create_plan", "fund_paper_account", "refresh"];
  if (state === "blocked") return ["review_blockers", "refresh"];
  if (state === "review_required") return ["approve_paper", "reject", "refresh"];
  if (state === "paper_ready") return ["submit_paper_order", "review", "refresh"];
  if (state === "degraded") return ["review_data_quality", "refresh"];
  return ["acknowledge", "refresh"];
}

function buildAttribution(items: Record<string, any>[]): CustomerDecisionProjection["performanceAttribution"] {
  const positions = items.map((item) => {
    const symbol = String(item?.symbol || "").trim().toUpperCase();
    const marketValueEur = round2(Math.max(0, safeNumber(item?.valueEur ?? item?.value_eur)));
    const costBasisRaw = item?.costBasisEur ?? item?.cost_basis_eur ?? item?.costBasis ?? item?.cost_basis;
    const costBasisEur = costBasisRaw == null ? null : round2(Math.max(0, safeNumber(costBasisRaw)));
    return {
      symbol,
      marketValueEur,
      costBasisEur,
      unrealizedPnlEur: costBasisEur == null ? null : round2(marketValueEur - costBasisEur),
    };
  }).filter((item) => item.symbol);
  const known = positions.filter((item) => item.unrealizedPnlEur != null);
  return {
    contractVersion: "investing-performance-attribution/v1",
    status: known.length > 0 ? "position_level_unrealized_only" : "unavailable",
    totalUnrealizedPnlEur: known.length > 0 ? round2(known.reduce((sum, item) => sum + safeNumber(item.unrealizedPnlEur), 0)) : null,
    positions,
    limitations: [
      "Uses current position value and stored cost basis only.",
      "Does not yet compute time-weighted return, money-weighted return, dividends, fees or benchmark attribution.",
    ],
  };
}

export function buildCustomerDecisionProjection(args: {
  asOf: string;
  plan: Record<string, any> | null;
  runtime: InvestingRuntimeSnapshot | null;
  executionPlan: InvestingExecutionPlan | null;
  portfolio: {
    totalEur: number;
    cashEur: number;
    items: Record<string, any>[];
  };
  quotes: Record<string, any> | null | undefined;
  marketSnapshot?: CustomerDecisionProjection["marketSnapshot"] | null;
  engineV1Bridge?: InvestingEngineV1CustomerBridgeResult | null;
}): CustomerDecisionProjection {
  const asOf = normalizeIso(args.asOf);
  const items = Array.isArray(args.portfolio.items) ? args.portfolio.items : [];
  const symbols = Array.from(new Set([
    ...items.map((item) => String(item?.symbol || "").trim().toUpperCase()),
    ...(args.runtime?.construction.targetAllocations ?? []).map((item) => item.symbol),
  ].filter(Boolean)));
  const pricedSymbols = items.filter((item) => safeNumber(item?.price) > 0).map((item) => String(item.symbol).toUpperCase());
  const pricingCoveragePct = items.length ? Math.round((pricedSymbols.length / items.length) * 100) : 100;
  const missingPriceSymbols = items
    .filter((item) => safeNumber(item?.price) <= 0)
    .map((item) => String(item?.symbol || "").trim().toUpperCase())
    .filter(Boolean);
  const state = deriveState({
    hasPlan: Boolean(args.plan),
    runtime: args.runtime,
    executionPlan: args.executionPlan,
    pricingCoveragePct,
  });
  const marketSnapshot = args.marketSnapshot ?? buildMarketSnapshot({ asOf, quotes: args.quotes, symbols });
  const engineV1Bridge = args.engineV1Bridge ?? null;
  const targetAllocations = args.runtime?.construction.targetAllocations ?? [];
  const rebalanceActions = args.runtime?.rebalance.actions ?? [];
  const executionPlan = args.executionPlan;
  const runtime = args.runtime;
  const researchWarnings = [
    ...(runtime?.benchmarkValidation.notes ?? []),
    ...(runtime?.instrumentScorecards.flatMap((scorecard) => scorecard.warnings) ?? []),
  ];
  const projectionDraft = {
    contractVersion: CUSTOMER_DECISION_PROJECTION_VERSION,
    asOf,
    state,
    source: {
      primaryEngine: "runtime_adapter",
      primaryEngineVersion: "investing_runtime_adapter/v1",
      engineV1Bridge: {
        contractVersion: "investing-engine-v1-client-bridge/v1",
        status: engineV1Bridge?.status === "connected" ? "phase3f_shadow_connected" : "phase3f_unavailable",
        finalPhase3FConnected: engineV1Bridge?.finalPhase3FConnected === true,
        operationalPrimary: false,
        reason: engineV1Bridge?.status === "connected"
          ? "Phase3F is connected as an executable=false shadow/audit decision. Runtime adapter remains the operational Paper/manual proposal boundary until persistence replay and customer parity are promoted."
          : "Phase3F shadow could not be built from the current canonical read model; runtime adapter remains the operational Paper/manual proposal boundary.",
        requiredBeforeActivation: [
          "persist_phase3f_artifacts_for_customer_runs",
          "prove_runtime_phase3f_parity",
          "promote_phase3f_replay_to_customer_ops",
        ],
        shadow: engineV1Bridge,
      },
    },
    summary: {
      headline: headlineFor(state),
      detail: runtime
        ? `Objective ${runtime.objective}; governance ${runtime.governancePolicy.executionClearance}; pricing coverage ${pricingCoveragePct}%.`
        : "Create an active Investing plan and Paper account before a proposal can be generated.",
      confidence: confidenceFor({ state, pricingCoveragePct }),
    },
    action: {
      type: executionPlan?.decision ?? "setup_required",
      approvalStatus: executionPlan?.approvalStatus ?? "not_available",
      approvalRequired: Boolean(executionPlan?.approvalRequired),
      expiresAt: executionPlan?.expiresAt ?? null,
      allowedResponses: allowedResponsesFor(state),
    },
    portfolio: {
      totalEur: round2(Math.max(0, safeNumber(args.portfolio.totalEur))),
      cashEur: round2(Math.max(0, safeNumber(args.portfolio.cashEur))),
      holdingsCount: items.length,
      targetAllocations: targetAllocations.map((allocation) => ({
        symbol: allocation.symbol,
        assetClass: allocation.assetClass,
        targetWeightPct: round2(allocation.targetWeightPct),
        targetValueEur: round2(allocation.targetValueEur),
        rationale: allocation.rationale,
      })),
      actions: rebalanceActions.map((action) => ({
        symbol: action.symbol,
        side: action.action,
        currentWeightPct: round2(action.currentWeightPct),
        targetWeightPct: round2(action.targetWeightPct),
        deltaWeightPct: round2(action.deltaWeightPct),
        deltaValueEur: round2(action.deltaValueEur),
        rationale: action.rationale,
      })),
    },
    risk: {
      objective: runtime?.objective ?? null,
      riskProfile: runtime?.construction.mandate.riskProfile ?? null,
      horizon: runtime?.construction.mandate.horizon ?? null,
      governanceStatus: runtime?.executionPolicy.governanceStatus ?? "unknown",
      executionClearance: runtime?.governancePolicy.executionClearance ?? "unknown",
      turnoverBucket: runtime?.executionPolicy.turnoverBucket ?? "unknown",
      taxFrictionBucket: runtime?.executionPolicy.taxFrictionBucket ?? "unknown",
      blockers: executionPlan?.blockingReasons ?? [],
      warnings: [
        ...(runtime?.notes ?? []),
        ...missingPriceSymbols.map((symbol) => `missing_price:${symbol}`),
      ],
    },
    costs: {
      estimatedRoundTripCostEur: round2(safeNumber(runtime?.executionPolicy.estimatedRoundTripCostEur)),
      feeBudgetEur: round2(safeNumber(runtime?.executionPolicy.feeBudgetEur)),
      estimatedSlippageBps: round2(safeNumber(runtime?.executionPolicy.estimatedSlippageBps)),
    },
    dataQuality: {
      pricingCoveragePct,
      missingPriceSymbols,
      valuationSource: items.length === 0 ? "empty" : missingPriceSymbols.length > 0 ? "cost_basis_fallback" : "market_quotes",
    },
    marketSnapshot,
    researchPublication: {
      contractVersion: "investing-research-publication-boundary/v1",
      status: "heuristic_validation_only",
      publicationId: `research_${createInvestingFingerprint({
        asOf,
        scorecards: runtime?.instrumentScorecards ?? [],
        benchmark: runtime?.benchmarkValidation ?? null,
      }).slice(0, 24)}`,
      benchmarkId: runtime?.benchmarkValidation.benchmarkId ?? null,
      benchmarkName: runtime?.benchmarkValidation.benchmarkName ?? null,
      validationStatus: runtime?.benchmarkValidation.status ?? "unavailable",
      scorecardCount: runtime?.instrumentScorecards.length ?? 0,
      warnings: researchWarnings,
      disclaimer: "This is a product validation boundary, not published institutional research or personalized tax advice.",
    },
    performanceAttribution: buildAttribution(items),
  } satisfies Omit<CustomerDecisionProjection, "projectionId">;

  const projectionId = `customer_decision_${createInvestingFingerprint(projectionDraft).slice(0, 32)}`;
  return { ...projectionDraft, projectionId };
}
