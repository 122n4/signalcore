import {
  INVESTING_ENGINE_INPUT_CONTRACT_VERSION,
  canonicalDecimalFromString,
  createStaticPilotInstrumentCatalogAdapter,
  sealMarketSnapshotV1,
  type CanonicalMandateV1,
  type CanonicalMarketSnapshotV1,
  type InvestingConstraintEvaluationV1,
} from "@/lib/investing/engine/v1";
import {
  buildCanonicalInvestingInputFromSourcesV1,
  type InvestingFinancialReadModelV1,
  type InvestingOrderSourceV1,
  type InvestingPositionSourceV1,
} from "@/lib/investing/engine/v1/phase3c";
import { evaluateInvestingRiskPolicyV1 } from "@/lib/investing/engine/v1/phase3d";
import {
  constructPreliminaryInvestingProposalV1,
  sealConstructionModelSnapshotV1,
  type ConstructionInstrumentModelV1,
} from "@/lib/investing/engine/v1/phase3e";
import {
  FINAL_RUN_CONTEXT_VERSION,
  FINAL_RUN_REQUEST_VERSION,
  hashConstraintEvaluationSetV1,
  hashPortfolioStateDerivationV1,
  runInvestingEngineV1Final,
  sealInvestingEngineRunContextV1,
  sealInvestingEngineRunRequestV1,
  type InvestingEnginePhase3FSourcesV1,
  type InvestingEngineResultV1Final,
} from "@/lib/investing/engine/v1/phase3f";
import type { InvestingRuntimeSnapshot } from "@/lib/investing/runtimeAdapter";

export type InvestingEngineV1CustomerBridgeResult = {
  contractVersion: "investing-engine-v1-customer-bridge/v1";
  status: "connected" | "unavailable";
  finalPhase3FConnected: boolean;
  executable: false;
  source: "phase3c_d_e_f_shadow" | "not_available";
  state: InvestingEngineResultV1Final["state"] | "unavailable";
  quality: InvestingEngineResultV1Final["quality"] | "unavailable";
  confidence: string | null;
  finalResultHash: string | null;
  finalDecisionHash: string | null;
  auditBundleHash: string | null;
  shadowPackageHash: string | null;
  phaseSummaries: InvestingEngineResultV1Final["phaseSummaries"];
  blockers: string[];
  warnings: string[];
  reasonCodes: string[];
  errorCode: string | null;
};

const catalog = createStaticPilotInstrumentCatalogAdapter().snapshot();

function d(value: unknown) {
  const raw = String(value ?? "0").trim();
  try {
    return canonicalDecimalFromString(raw && Number.isFinite(Number(raw)) ? raw : "0");
  } catch {
    return canonicalDecimalFromString("0");
  }
}

function idPart(value: unknown, fallback: string) {
  return String(value || fallback).replace(/[^A-Za-z0-9._:-]/g, "_").slice(0, 120) || fallback;
}

function ratio(valuePct: number) {
  const value = Number.isFinite(valuePct) ? Math.max(0, valuePct) / 100 : 0;
  return d(value.toFixed(6));
}

function mandateConstraint(args: {
  id: string;
  kind?: "hard" | "soft";
  status?: "pass" | "fail" | "unknown";
  limit?: ReturnType<typeof d> | null;
}): InvestingConstraintEvaluationV1 {
  return {
    id: args.id,
    kind: args.kind ?? "hard",
    status: args.status ?? "pass",
    reasonCode: `rule_${args.id.replace(/[^A-Za-z0-9_]/g, "_")}`,
    observed: null,
    limit: args.limit ?? null,
    evidenceRefs: ["runtime_adapter_mandate"],
  };
}

function buildMandate(runtime: InvestingRuntimeSnapshot, accountId: string): CanonicalMandateV1 {
  const mandate = runtime.construction.mandate;
  return {
    mandateSnapshotId: `mandate_${idPart(accountId, "account")}_${idPart(runtime.objective, "objective")}`,
    objective: mandate.objective,
    riskProfile: mandate.riskProfile,
    horizon: mandate.horizon,
    baseCurrency: mandate.baseCurrency,
    constraints: [
      mandateConstraint({ id: "paper_environment_only" }),
      mandateConstraint({ id: "maximum_instrument_weight", limit: ratio(mandate.maxSinglePositionPct) }),
      mandateConstraint({ id: "minimum_cash_weight", limit: ratio(mandate.cashReservePct) }),
      mandateConstraint({ id: "maximum_total_exposure", limit: d("0.98") }),
      mandateConstraint({ id: "prohibited_instrument:BTC", status: mandate.allowsCrypto ? "pass" : "fail", limit: d("0") }),
      mandateConstraint({ id: "suitability_asset_class:commodity", status: mandate.allowsGold ? "pass" : "fail" }),
    ],
  };
}

function buildMarketSnapshot(snapshot: CanonicalMarketSnapshotV1): CanonicalMarketSnapshotV1 {
  return sealMarketSnapshotV1({
    contractVersion: "investing-market-snapshot/v1",
    marketSnapshotId: snapshot.marketSnapshotId,
    asOf: snapshot.asOf,
    schemaVersion: snapshot.schemaVersion,
    points: snapshot.points,
    issues: snapshot.issues,
  });
}

function mapPositions(rows: readonly Record<string, any>[], accountId: string): InvestingPositionSourceV1[] {
  return rows
    .map((row) => ({
      accountId,
      symbol: String(row.symbol || "").trim().toUpperCase(),
      quantity: String(row.quantity ?? row.qty ?? "0"),
      reservedQuantity: String(row.reserved_quantity ?? row.reservedQuantity ?? "0"),
      costBasis: String(row.cost_basis ?? row.costBasis ?? row.costBasisEur ?? "0"),
      currency: String(row.currency || "EUR").trim().toUpperCase(),
    }))
    .filter((row) => row.symbol && Number(row.quantity) > 0);
}

function mapOrders(rows: readonly Record<string, any>[], accountId: string, userId: string, portfolioId: string): InvestingOrderSourceV1[] {
  return rows
    .map((row, index) => {
      const symbol = String(row.symbol || row.instrument_symbol || "").trim().toUpperCase();
      const side: "buy" | "sell" = String(row.side || row.action || "").toLowerCase() === "sell" ? "sell" : "buy";
      return {
        orderId: idPart(row.id ?? row.order_id, `order_${index}`),
        semanticOrderId: idPart(row.semantic_order_id ?? row.client_request_id ?? row.id, `semantic_order_${index}`),
        accountId,
        userId,
        portfolioId,
        symbol,
        currency: String(row.currency || "EUR").trim().toUpperCase(),
        side,
        status: String(row.status || row.operational_state || "submitted"),
        quantity: String(row.quantity ?? row.qty ?? "0"),
        cumulativeFilledQuantity: String(row.cumulative_filled_quantity ?? row.filled_quantity ?? "0"),
        unitPrice: row.unit_price == null && row.price == null ? null : String(row.unit_price ?? row.price),
        persistedReservedCash: String(row.reserved_cash ?? row.persisted_reserved_cash ?? "0"),
        persistedReservedQuantity: String(row.reserved_quantity ?? row.persisted_reserved_quantity ?? "0"),
        estimatedFeeRemaining: row.estimated_fee_remaining == null ? "0" : String(row.estimated_fee_remaining),
        updatedAt: new Date(String(row.updated_at || row.created_at || new Date().toISOString())).toISOString(),
      };
    })
    .filter((row) => row.symbol && Number(row.quantity) > 0);
}

function modelForInstrument(symbol: string, asOf: string): ConstructionInstrumentModelV1 {
  return {
    symbol,
    fractionalShares: false,
    minimumQuantity: d("1"),
    quantityIncrement: d("1"),
    priceIncrement: d("0.01"),
    commissionBps: d("5"),
    spreadBps: d("10"),
    slippageBps: d("5"),
    fxCostBps: d("10"),
    minimumFee: d("1"),
    averageDailyVolume: d("100000"),
    maxParticipation: d("0.1"),
    liquidityTier: "high",
    marketImpactBps: d("2"),
    liquidityAsOf: asOf,
    taxLotAvailability: "available",
  };
}

function unavailable(error: unknown): InvestingEngineV1CustomerBridgeResult {
  const code = error instanceof Error ? error.message.split(":")[0] : "phase3f_bridge_unavailable";
  return {
    contractVersion: "investing-engine-v1-customer-bridge/v1",
    status: "unavailable",
    finalPhase3FConnected: false,
    executable: false,
    source: "not_available",
    state: "unavailable",
    quality: "unavailable",
    confidence: null,
    finalResultHash: null,
    finalDecisionHash: null,
    auditBundleHash: null,
    shadowPackageHash: null,
    phaseSummaries: [],
    blockers: [code],
    warnings: [],
    reasonCodes: [],
    errorCode: code,
  };
}

export function buildInvestingEngineV1CustomerBridge(args: {
  userId: string;
  portfolioId: string;
  asOf: string;
  account: Record<string, any> | null;
  settings: Record<string, any> | null;
  plan: Record<string, any> | null;
  cash: readonly Record<string, any>[];
  positions: readonly Record<string, any>[];
  orders: readonly Record<string, any>[];
  runtime: InvestingRuntimeSnapshot | null;
  marketSnapshot: CanonicalMarketSnapshotV1;
}): InvestingEngineV1CustomerBridgeResult {
  try {
    if (!args.runtime || !args.account?.id) throw new Error("phase3f_runtime_or_account_missing");
    const accountId = String(args.account.id);
    const asOf = new Date(args.asOf).toISOString();
    const inputSnapshotId = `input_${idPart(accountId, "account")}_${idPart(args.marketSnapshot.marketSnapshotId, "market")}`;
    const runId = `run_${idPart(accountId, "account")}_${idPart(args.marketSnapshot.snapshotHash.slice(0, 24), "snapshot")}`;
    const market = buildMarketSnapshot(args.marketSnapshot);
    const mandate = buildMandate(args.runtime, accountId);
    const financial: InvestingFinancialReadModelV1 = {
      identity: { requestedUserId: args.userId, ownerUserId: args.userId },
      accounts: [{
        accountId,
        userId: args.userId,
        portfolioId: args.portfolioId,
        environment: "paper",
        status: "active",
        baseCurrency: mandate.baseCurrency,
      }],
      cashBalances: args.cash.map((row) => ({
        accountId,
        currency: String(row.currency || "EUR").trim().toUpperCase(),
        available: String(row.available_amount ?? row.available ?? "0"),
        settled: String(row.settled_amount ?? row.settled ?? row.available_amount ?? "0"),
        reserved: String(row.reserved_amount ?? row.reserved ?? "0"),
      })),
      positions: mapPositions(args.positions, accountId),
      orders: mapOrders(args.orders, accountId, args.userId, args.portfolioId),
      fills: [],
      mandateSnapshot: {
        userId: args.userId,
        accountId,
        mandate,
      },
      authoring: {
        plan: args.plan ?? {},
        settings: args.settings ?? {},
      },
    };
    const built = buildCanonicalInvestingInputFromSourcesV1({
      request: {
        requestedUserId: args.userId,
        requestedAccountId: accountId,
        inputSnapshotId,
        runId,
        asOf,
        marketSnapshotId: market.marketSnapshotId,
        versions: {
          contractVersion: INVESTING_ENGINE_INPUT_CONTRACT_VERSION,
          engineVersion: "engine/v1.3.0-phase3f",
          policyVersion: "risk-policy/v1",
          modelVersion: "construction-model/v1",
          instrumentCatalogVersion: catalog.version,
          marketDataSchemaVersion: market.schemaVersion,
        },
      },
      financial,
      instrumentCatalog: catalog,
      market,
    });
    const envelope = evaluateInvestingRiskPolicyV1(built.input, {
      expectedUserId: args.userId,
      expectedAccountId: accountId,
      environment: "paper",
    });
    const constructionModel = sealConstructionModelSnapshotV1({
      contractVersion: "investing-construction-model/v1",
      version: "construction-model/v1",
      asOf,
      costBenefitThreshold: d("0.05"),
      minimumTradeBenefit: d("1"),
      liquidityMaxAgeSeconds: d("900"),
      instruments: catalog.instruments.map((instrument) => modelForInstrument(instrument.symbol, asOf)),
    });
    const preliminaryProposal = constructPreliminaryInvestingProposalV1({
      canonicalInput: built.input,
      portfolioState: built.portfolioState,
      risk: envelope.risk,
      policy: envelope.policy,
      constraints: envelope.constraints,
      envelope,
      model: constructionModel,
    });
    const context = sealInvestingEngineRunContextV1({
      contractVersion: FINAL_RUN_CONTEXT_VERSION,
      ownerId: args.userId,
      expectedUserId: args.userId,
      expectedAccountId: accountId,
      accountMode: "paper",
    });
    const partial = {
      request: null as never,
      context,
      canonicalInput: built.input,
      portfolioState: built.portfolioState,
      risk: envelope.risk,
      policy: envelope.policy,
      constraints: envelope.constraints,
      envelope,
      constructionModel,
      preliminaryProposal,
    };
    const request = sealInvestingEngineRunRequestV1({
      contractVersion: FINAL_RUN_REQUEST_VERSION,
      runId: built.input.runId,
      requestedUserId: args.userId,
      accountId,
      asOf,
      inputSnapshotId: built.input.inputSnapshotId,
      marketSnapshotId: built.input.market.marketSnapshotId,
      mandateSnapshotId: built.input.mandate.mandateSnapshotId,
      constructionModelSnapshotId: constructionModel.snapshotHash.slice(0, 32),
      versions: built.input.versions,
      sourceHashes: {
        canonicalInputHash: built.input.inputHash,
        portfolioStateDerivationHash: hashPortfolioStateDerivationV1(built.portfolioState),
        riskAssessmentHash: envelope.risk.assessmentHash,
        policyEvaluationHash: envelope.policy.policyHash,
        constraintEvaluationHash: hashConstraintEvaluationSetV1(envelope.constraints),
        feasibleDecisionEnvelopeHash: envelope.envelopeHash,
        constructionModelHash: constructionModel.snapshotHash,
        preliminaryProposalHash: preliminaryProposal.proposalHash,
      },
    });
    const result = runInvestingEngineV1Final({ ...partial, request } satisfies InvestingEnginePhase3FSourcesV1);
    return {
      contractVersion: "investing-engine-v1-customer-bridge/v1",
      status: "connected",
      finalPhase3FConnected: true,
      executable: false,
      source: "phase3c_d_e_f_shadow",
      state: result.state,
      quality: result.quality,
      confidence: result.confidence.value,
      finalResultHash: result.finalResultHash,
      finalDecisionHash: result.hashes.finalDecisionHash,
      auditBundleHash: result.hashes.auditBundleHash,
      shadowPackageHash: result.hashes.shadowPackageHash,
      phaseSummaries: result.phaseSummaries,
      blockers: [...result.blockers],
      warnings: result.warnings.map((warning) => warning.code),
      reasonCodes: [...result.reasonCodes],
      errorCode: null,
    };
  } catch (error) {
    return unavailable(error);
  }
}
