export type FinancialAvailability = "REAL" | "STALE" | "ESTIMATED" | "UNAVAILABLE";
export type PlanAvailability = "AVAILABLE" | "UNAVAILABLE";

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
  plan?: {
    availability?: PlanAvailability | string | null;
    reason?: string | null;
    value?: {
      id?: string;
      mode?: "investing" | string;
      status?: "active" | string;
      version?: number | null;
      label?: string | null;
      intent?: string | null;
      summary?: string | null;
      structured?: {
        availability?: PlanAvailability | string | null;
        schemaVersion?: number | null;
        reason?: string | null;
        objective?: {
          type?: string;
          targetAmount?: { amount?: number | null; currency?: string | null };
          timeframeMonths?: number | null;
          monthlyContribution?: { amount?: number | null; currency?: string | null };
        } | null;
        risk?: { profile?: string | null } | null;
        guardrails?: { maxSinglePositionPct?: number | null; maxTop5Pct?: number | null } | null;
      } | null;
    } | null;
  } | null;
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
    customerDecisionSource?: string | null;
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

export function normalizePlanAvailability(value: unknown): PlanAvailability {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized === "AVAILABLE" ? "AVAILABLE" : "UNAVAILABLE";
}

function hasAcceptedDecisionAuthority(source: unknown, decision: unknown) {
  void source;
  void decision;
  // R3 has no accepted server decision-authority source yet. Plan display is
  // separate from customer-facing mandate guidance.
  return false;
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
  const rawDecisionAvailability = normalizeFinancialAvailability(
    payload?.derived?.decisionAvailability ?? payload?.derived?.decisionProvenance?.status,
  );
  const planEnvelope = payload?.plan ?? null;
  const planAvailability = normalizePlanAvailability(planEnvelope?.availability);
  const planValue = planAvailability === "AVAILABLE" ? planEnvelope?.value ?? null : null;
  const hasPlan = Boolean(planValue);
  const rawDecision = payload?.derived?.customerDecision ?? payload?.daily?.customerDecision ?? null;
  const decisionSource = payload?.derived?.customerDecisionSource ?? payload?.derived?.decisionProvenance?.source;
  const hasDecisionAuthority = hasPlan && hasAcceptedDecisionAuthority(decisionSource, rawDecision);
  const decisionAvailability = hasDecisionAuthority ? rawDecisionAvailability : "UNAVAILABLE";
  const decision = hasDecisionAuthority ? rawDecision : null;
  const planStructured = planValue?.structured ?? null;
  const structuredAvailability = normalizePlanAvailability(planStructured?.availability);
  const rawPlanTarget = planStructured?.objective?.targetAmount?.amount;
  const planTarget = structuredAvailability === "AVAILABLE" ? finiteNumber(rawPlanTarget) : null;
  const planCurrency = typeof planStructured?.objective?.targetAmount?.currency === "string" ? planStructured.objective.targetAmount.currency : "EUR";
  const planDetails: Array<{ label: string; value: string }> = [];
  if (hasPlan && typeof planValue?.version === "number") planDetails.push({ label: "Version", value: String(planValue.version) });
  if (structuredAvailability === "AVAILABLE") {
    if (planStructured?.objective?.type) planDetails.push({ label: "Objective", value: String(planStructured.objective.type) });
    if (planStructured?.objective?.timeframeMonths) {
      planDetails.push({ label: "Timeframe", value: `${planStructured.objective.timeframeMonths} months` });
    }
    if (planStructured?.objective?.monthlyContribution?.amount !== undefined) {
      const contribution = finiteNumber(planStructured.objective.monthlyContribution.amount);
      const currency = String(planStructured.objective.monthlyContribution.currency || "EUR");
      if (contribution !== null) planDetails.push({ label: "Monthly contribution", value: `${currency} ${contribution}` });
    }
    if (planStructured?.risk?.profile) planDetails.push({ label: "Risk", value: String(planStructured.risk.profile) });
    if (planStructured?.guardrails?.maxSinglePositionPct !== undefined) {
      planDetails.push({ label: "Max single position", value: `${planStructured.guardrails.maxSinglePositionPct}%` });
    }
    if (planStructured?.guardrails?.maxTop5Pct !== undefined) {
      planDetails.push({ label: "Max top 5", value: `${planStructured.guardrails.maxTop5Pct}%` });
    }
  }

  return {
    asOf: payload?.asOf ?? null,
    hasAccount,
    environment: environmentLabel(portfolio?.environment, hasAccount),
    accountStatus: portfolio?.accountStatus ? String(portfolio.accountStatus) : hasAccount ? "active" : "unavailable",
    hasPlan,
    planAvailability,
    planUnavailableReason: planEnvelope?.reason ?? null,
    planName: hasPlan
      ? String(planValue?.summary ?? planValue?.label ?? planValue?.intent ?? `Plan v${planValue?.version ?? ""}`).trim()
      : planEnvelope?.reason === "investing_plan_ambiguous"
        ? "Plan unavailable"
        : "Plan not available",
    planStructuredAvailability: structuredAvailability,
    planStructuredReason: planStructured?.reason ?? null,
    planTarget:
      planTarget === null
        ? PLAN_TARGET_UNAVAILABLE
        : planCurrency === "EUR"
          ? formatEur(planTarget)
          : `${planCurrency} ${planTarget}`,
    planTargetAvailable: planTarget !== null,
    planDetails,
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
        : !hasPlan
          ? "Plan not available"
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
