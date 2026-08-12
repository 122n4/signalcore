export type FinancialAvailability = "REAL" | "STALE" | "ESTIMATED" | "UNAVAILABLE";

export type InvestingExperienceScreen = "overview" | "portfolio" | "plan" | "insights";

export type ValueDisplay = {
  kind: "value" | "unavailable";
  text: string;
  label: string;
  tone: "good" | "info" | "warn" | "bad";
};

export type InvestingDashboardPayload = {
  ok?: boolean;
  asOf?: string | null;
  plan?: Record<string, any> | null;
  portfolio?: {
    accountId?: string | null;
    environment?: string | null;
    accountStatus?: string | null;
    cashEur?: number | null;
    totalEur?: number | null;
    cash?: {
      amountEur?: number | null;
      availability?: FinancialAvailability | string | null;
      asOf?: string | null;
    } | null;
    items?: Array<Record<string, any>> | null;
    valuation?: {
      cashEur?: number | null;
      totalEur?: number | null;
      coveragePct?: number | null;
      source?: string | null;
      availability?: FinancialAvailability | string | null;
      provenance?: {
        status?: FinancialAvailability | string | null;
        source?: string | null;
        unavailableMessage?: string | null;
      } | null;
      missingPriceSymbols?: string[] | null;
    } | null;
  } | null;
  daily?: {
    customerDecision?: Record<string, any> | null;
    execution?: Record<string, any> | null;
    lastSnapshotAt?: string | null;
  } | null;
  derived?: {
    hasPlan?: boolean;
    hasHoldings?: boolean;
    decisionAvailability?: FinancialAvailability | string | null;
    decisionProvenance?: {
      status?: FinancialAvailability | string | null;
      source?: string | null;
      unavailableMessage?: string | null;
    } | null;
    customerDecision?: Record<string, any> | null;
    performanceAttribution?: Record<string, any> | null;
  } | null;
};

const UNAVAILABLE_TEXT = "Dados indisponiveis neste momento";
const PERFORMANCE_UNAVAILABLE = "Performance not yet available";
const PLAN_TARGET_UNAVAILABLE = "Plan target not yet available";

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function normalizeFinancialAvailability(value: unknown): FinancialAvailability {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "REAL" || normalized === "STALE" || normalized === "ESTIMATED" || normalized === "UNAVAILABLE") {
    return normalized;
  }
  return "UNAVAILABLE";
}

export function formatEur(value: number): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function availabilityLabel(availability: FinancialAvailability, source?: string | null) {
  if (availability === "REAL" && source === "cash_only") return "Real - cash only";
  if (availability === "REAL") return "Real";
  if (availability === "STALE") return "Stale";
  if (availability === "ESTIMATED") return "Estimated";
  return "Unavailable";
}

function availabilityTone(availability: FinancialAvailability): ValueDisplay["tone"] {
  if (availability === "REAL") return "good";
  if (availability === "STALE" || availability === "ESTIMATED") return "warn";
  return "bad";
}

export function buildFinancialDisplay(args: {
  value: unknown;
  availability: unknown;
  source?: string | null;
}): ValueDisplay {
  const availability = normalizeFinancialAvailability(args.availability);
  const value = finiteNumber(args.value);
  const label = availabilityLabel(availability, args.source);

  if (availability === "UNAVAILABLE" || value === null) {
    return {
      kind: "unavailable",
      text: UNAVAILABLE_TEXT,
      label,
      tone: "bad",
    };
  }

  return {
    kind: "value",
    text: formatEur(value),
    label,
    tone: availabilityTone(availability),
  };
}

export function environmentLabel(environment: unknown, hasAccount: boolean) {
  if (!hasAccount) return "No active account";
  const normalized = String(environment ?? "").trim().toLowerCase();
  if (normalized === "paper") return "Paper";
  if (normalized === "simulation") return "Simulation";
  if (normalized === "live") return "Live";
  return "Environment unavailable";
}

export function buildInvestingExperienceModel(payload: InvestingDashboardPayload | null) {
  const portfolio = payload?.portfolio ?? null;
  const valuation = portfolio?.valuation ?? null;
  const valuationAvailability = normalizeFinancialAvailability(valuation?.availability ?? valuation?.provenance?.status);
  const valuationSource = valuation?.source ?? valuation?.provenance?.source ?? null;
  const cashAvailability = normalizeFinancialAvailability(portfolio?.cash?.availability);
  const hasAccount = Boolean(portfolio?.accountId);
  const items = Array.isArray(portfolio?.items) ? portfolio.items : [];
  const activeItems = items.filter((item) => {
    const quantity = finiteNumber(item.quantity ?? item.qty);
    return quantity !== null && quantity > 0;
  });
  const decisionAvailability = normalizeFinancialAvailability(
    payload?.derived?.decisionAvailability ?? payload?.derived?.decisionProvenance?.status,
  );
  const decision = payload?.derived?.customerDecision ?? payload?.daily?.customerDecision ?? null;
  const hasPlan = Boolean(payload?.plan || payload?.derived?.hasPlan);
  const rawPlanTarget = payload?.plan?.targetAmountEur ?? payload?.plan?.goal_target_value ?? payload?.plan?.goal_amount;
  const planTarget = finiteNumber(rawPlanTarget);

  return {
    asOf: payload?.asOf ?? null,
    hasAccount,
    environment: environmentLabel(portfolio?.environment, hasAccount),
    accountStatus: portfolio?.accountStatus ? String(portfolio.accountStatus) : hasAccount ? "active" : "unavailable",
    hasPlan,
    planName: payload?.plan?.goal ? String(payload.plan.goal) : hasPlan ? "Plan available" : "Plan not available",
    planTarget: planTarget === null ? PLAN_TARGET_UNAVAILABLE : formatEur(planTarget),
    planTargetAvailable: planTarget !== null,
    performanceText: PERFORMANCE_UNAVAILABLE,
    portfolioValue: buildFinancialDisplay({
      value: portfolio?.totalEur ?? valuation?.totalEur,
      availability: valuationAvailability,
      source: valuationSource,
    }),
    cash: buildFinancialDisplay({
      value: portfolio?.cash?.amountEur,
      availability: cashAvailability,
      source: "cash_balance",
    }),
    valuationAvailability,
    valuationSource,
    coveragePct: finiteNumber(valuation?.coveragePct),
    coverageTone: valuationAvailability === "REAL" ? "good" : valuationAvailability === "UNAVAILABLE" ? "bad" : "warn",
    items: activeItems.map((item) => {
      const itemAvailability = normalizeFinancialAvailability(item.valuationAvailability ?? item.valuation_availability);
      return {
        symbol: String(item.symbol ?? "").toUpperCase(),
        name: String(item.name ?? item.symbol ?? ""),
        quantity: finiteNumber(item.quantity ?? item.qty),
        valuation: buildFinancialDisplay({
          value: item.valueEur ?? item.value_eur,
          availability: itemAvailability,
          source: item.valuationSource ?? null,
        }),
        priceAvailability: normalizeFinancialAvailability(item.priceAvailability ?? item.price_availability),
      };
    }),
    decision: {
      availability: decisionAvailability,
      label: availabilityLabel(decisionAvailability),
      tone: availabilityTone(decisionAvailability),
      text:
        decisionAvailability === "UNAVAILABLE"
          ? "Decision data unavailable. Refresh required."
          : decisionAvailability === "ESTIMATED"
            ? "Estimated guidance only"
            : decisionAvailability === "STALE"
              ? "Stale decision evidence"
              : String(decision?.summary?.title ?? decision?.state ?? "Decision available"),
      actionable: decisionAvailability === "REAL" || decisionAvailability === "STALE" || decisionAvailability === "ESTIMATED",
    },
    nextStep:
      !hasAccount
        ? "No active account"
        : valuationAvailability === "UNAVAILABLE" || decisionAvailability === "UNAVAILABLE"
          ? "Refresh required"
          : hasPlan
            ? "Review insights"
            : "Plan not available",
  };
}

export const investingExperienceCopy = {
  unavailable: UNAVAILABLE_TEXT,
  performanceUnavailable: PERFORMANCE_UNAVAILABLE,
  planTargetUnavailable: PLAN_TARGET_UNAVAILABLE,
};
