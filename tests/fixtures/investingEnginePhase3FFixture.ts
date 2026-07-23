import {
  INVESTING_ENGINE_INPUT_CONTRACT_VERSION,
  canonicalDecimalFromString,
  createStaticPilotInstrumentCatalogAdapter,
  sealMarketSnapshotV1,
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
  ZERO,
  add,
  hashConstraintEvaluationSetV1,
  hashPortfolioStateDerivationV1,
  sealInvestingEngineRunContextV1,
  sealInvestingEngineRunRequestV1,
  type InvestingEnginePhase3FSourcesV1,
} from "@/lib/investing/engine/v1/phase3f";

export const PHASE3F_AS_OF = "2026-07-20T10:00:00.000Z";
export const d = canonicalDecimalFromString;
const catalog = createStaticPilotInstrumentCatalogAdapter().snapshot();

export function constraint(args: { id: string; kind?: "hard" | "soft"; status?: "pass" | "fail" | "unknown"; limit?: string | null }): InvestingConstraintEvaluationV1 {
  return {
    id: args.id,
    kind: args.kind ?? "hard",
    status: args.status ?? "pass",
    reasonCode: `rule_${args.id.replaceAll(":", "_")}`,
    observed: null,
    limit: args.limit === undefined || args.limit === null ? null : d(args.limit),
    evidenceRefs: ["mandate_phase3f_1"],
  };
}

export function phase3fPosition(overrides: Partial<InvestingPositionSourceV1> = {}): InvestingPositionSourceV1 {
  return {
    accountId: "account_phase3f_1",
    symbol: "AGGH",
    quantity: "2",
    reservedQuantity: "0",
    costBasis: "45",
    currency: "EUR",
    ...overrides,
  };
}

export function phase3fOrder(overrides: Partial<InvestingOrderSourceV1> = {}): InvestingOrderSourceV1 {
  return {
    orderId: "order_phase3f_1",
    semanticOrderId: "semantic_order_phase3f_1",
    accountId: "account_phase3f_1",
    userId: "user_phase3f_1",
    portfolioId: "primary",
    symbol: "AGGH",
    currency: "EUR",
    side: "buy",
    status: "approved",
    quantity: "2",
    cumulativeFilledQuantity: "0",
    unitPrice: "50",
    persistedReservedCash: "100",
    persistedReservedQuantity: "0",
    estimatedFeeRemaining: "0",
    updatedAt: PHASE3F_AS_OF,
    ...overrides,
  };
}

function market(omit: readonly string[] = []) {
  const omitted = new Set(omit);
  const prices: Record<string, string> = { VWCE: "100", SPY: "200", AGGH: "50", GLD: "150" };
  return sealMarketSnapshotV1({
    contractVersion: "investing-market-snapshot/v1",
    marketSnapshotId: "market_phase3f_1",
    asOf: PHASE3F_AS_OF,
    schemaVersion: "market-phase3f/v1",
    points: [
      ...catalog.instruments.filter((instrument) => !omitted.has(instrument.symbol)).map((instrument) => ({
        symbol: instrument.symbol,
        price: d(prices[instrument.symbol]),
        currency: instrument.currency,
        provider: "phase3f_fixture",
        providerAsOf: PHASE3F_AS_OF,
        receivedAt: PHASE3F_AS_OF,
        quality: "good" as const,
      })),
      ...(!omitted.has("USDEUR") ? [{
        symbol: "USDEUR",
        price: d("0.9"),
        currency: "EUR",
        provider: "phase3f_fixture",
        providerAsOf: PHASE3F_AS_OF,
        receivedAt: PHASE3F_AS_OF,
        quality: "good" as const,
      }] : []),
    ],
    issues: [],
  });
}

function instrumentModel(symbol: string, overrides: Partial<ConstructionInstrumentModelV1> = {}): ConstructionInstrumentModelV1 {
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
    liquidityAsOf: PHASE3F_AS_OF,
    taxLotAvailability: "available",
    ...overrides,
  };
}

export type Phase3FFixtureArgs = {
  userId?: string;
  accountId?: string;
  runId?: string;
  cash?: string;
  positions?: readonly InvestingPositionSourceV1[];
  orders?: readonly InvestingOrderSourceV1[];
  constraints?: readonly InvestingConstraintEvaluationV1[];
  omitMarket?: readonly string[];
  modelOverrides?: Readonly<Record<string, Partial<ConstructionInstrumentModelV1>>>;
};

export function resealPhase3FRequest(
  sources: Omit<InvestingEnginePhase3FSourcesV1, "request"> & { request: InvestingEnginePhase3FSourcesV1["request"] },
  overrides: Partial<Omit<InvestingEnginePhase3FSourcesV1["request"], "requestHash" | "sourceHashes">> = {},
) {
  return sealInvestingEngineRunRequestV1({
    contractVersion: FINAL_RUN_REQUEST_VERSION,
    runId: sources.canonicalInput.runId,
    requestedUserId: sources.context.expectedUserId,
    accountId: sources.context.expectedAccountId,
    asOf: sources.canonicalInput.asOf,
    inputSnapshotId: sources.canonicalInput.inputSnapshotId,
    marketSnapshotId: sources.canonicalInput.market.marketSnapshotId,
    mandateSnapshotId: sources.canonicalInput.mandate.mandateSnapshotId,
    constructionModelSnapshotId: "construction_model_phase3f_1",
    versions: sources.canonicalInput.versions,
    ...overrides,
    sourceHashes: {
      canonicalInputHash: sources.canonicalInput.inputHash,
      portfolioStateDerivationHash: hashPortfolioStateDerivationV1(sources.portfolioState),
      riskAssessmentHash: sources.risk.assessmentHash,
      policyEvaluationHash: sources.policy.policyHash,
      constraintEvaluationHash: hashConstraintEvaluationSetV1(sources.constraints),
      feasibleDecisionEnvelopeHash: sources.envelope.envelopeHash,
      constructionModelHash: sources.constructionModel.snapshotHash,
      preliminaryProposalHash: sources.preliminaryProposal.proposalHash,
    },
  });
}

export function buildPhase3FSources(args: Phase3FFixtureArgs = {}): InvestingEnginePhase3FSourcesV1 {
  const userId = args.userId ?? "user_phase3f_1";
  const accountId = args.accountId ?? "account_phase3f_1";
  const runId = args.runId ?? "run_phase3f_1";
  const snapshot = market(args.omitMarket);
  const cash = args.cash ?? "1000";
  const activeOrders = args.orders ?? [];
  const reservedCash = activeOrders
    .filter((order) => order.side === "buy" && !["filled", "cancelled", "rejected", "expired"].includes(order.status))
    .map((order) => d(order.persistedReservedCash))
    .reduce(add, ZERO);
  const financial: InvestingFinancialReadModelV1 = {
    identity: { requestedUserId: userId, ownerUserId: userId },
    accounts: [{
      accountId,
      userId,
      portfolioId: "primary",
      environment: "paper",
      status: "active",
      baseCurrency: "EUR",
    }],
    cashBalances: [{ accountId, currency: "EUR", available: cash, settled: cash, reserved: reservedCash }],
    positions: args.positions ?? [],
    orders: activeOrders,
    fills: [],
    mandateSnapshot: {
      userId,
      accountId,
      mandate: {
        mandateSnapshotId: "mandate_phase3f_1",
        objective: "balanced",
        riskProfile: "Balanced",
        horizon: "Long",
        baseCurrency: "EUR",
        constraints: args.constraints ?? [constraint({ id: "paper_environment_only" })],
      },
    },
    authoring: {
      plan: { objective: "balanced", riskProfile: "Balanced", horizon: "Long" },
      settings: { marketDataMaxAgeSeconds: "900", orderStaleAfterSeconds: "86400" },
    },
  };
  const built = buildCanonicalInvestingInputFromSourcesV1({
    request: {
      requestedUserId: userId,
      requestedAccountId: accountId,
      inputSnapshotId: "input_phase3f_1",
      runId,
      asOf: PHASE3F_AS_OF,
      marketSnapshotId: snapshot.marketSnapshotId,
      versions: {
        contractVersion: INVESTING_ENGINE_INPUT_CONTRACT_VERSION,
        engineVersion: "engine/v1.3.0-phase3f",
        policyVersion: "risk-policy/v1",
        modelVersion: "construction-model/v1",
        instrumentCatalogVersion: catalog.version,
        marketDataSchemaVersion: snapshot.schemaVersion,
      },
    },
    financial,
    instrumentCatalog: catalog,
    market: snapshot,
  });
  const envelope = evaluateInvestingRiskPolicyV1(built.input, {
    expectedUserId: userId,
    expectedAccountId: accountId,
    environment: "paper",
  });
  const constructionModel = sealConstructionModelSnapshotV1({
    contractVersion: "investing-construction-model/v1",
    version: "construction-model/v1",
    asOf: PHASE3F_AS_OF,
    costBenefitThreshold: d("0.05"),
    minimumTradeBenefit: d("1"),
    liquidityMaxAgeSeconds: d("900"),
    instruments: catalog.instruments.map((instrument) => instrumentModel(
      instrument.symbol,
      args.modelOverrides?.[instrument.symbol],
    )),
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
    ownerId: userId,
    expectedUserId: userId,
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
  const request = resealPhase3FRequest(partial as InvestingEnginePhase3FSourcesV1);
  return { ...partial, request };
}

export function withResealedRequest(
  sources: InvestingEnginePhase3FSourcesV1,
  changes: Partial<InvestingEnginePhase3FSourcesV1>,
  requestOverrides: Parameters<typeof resealPhase3FRequest>[1] = {},
): InvestingEnginePhase3FSourcesV1 {
  const changed = { ...sources, ...changes };
  return { ...changed, request: resealPhase3FRequest(changed, requestOverrides) };
}
