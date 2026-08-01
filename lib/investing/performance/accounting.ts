export type InvestingCashMovementForPerformance = {
  id?: string | null;
  movement_type?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  reversal_of?: string | null;
};

export type InvestingFillForPerformance = {
  fee_amount?: number | string | null;
  tax_amount?: number | string | null;
  currency?: string | null;
};

function money(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

export function buildInvestingAccountingPerformance(args: {
  currentTotalEur: number;
  movements: InvestingCashMovementForPerformance[];
  fills?: InvestingFillForPerformance[];
}) {
  const eurMovements = (args.movements || []).filter((row) => String(row.currency || "EUR").toUpperCase() === "EUR");
  const reversedIds = new Set(
    eurMovements
      .filter((row) => String(row.movement_type || "").toLowerCase() === "reversal" && row.reversal_of)
      .map((row) => String(row.reversal_of)),
  );
  const effective = eurMovements.filter((row) => {
    const type = String(row.movement_type || "").toLowerCase();
    if (type === "reversal") return false;
    return !reversedIds.has(String(row.id || ""));
  });

  const sumType = (type: string) => money(effective
    .filter((row) => String(row.movement_type || "").toLowerCase() === type)
    .reduce((sum, row) => sum + money(row.amount), 0));

  const depositsEur = Math.max(0, sumType("deposit"));
  const withdrawalsEur = Math.abs(Math.min(0, sumType("withdrawal")));
  const dividendsEur = Math.max(0, sumType("dividend"));
  const interestEur = Math.max(0, sumType("interest"));
  const standaloneFeesEur = Math.abs(sumType("fee"));
  const standaloneTaxesEur = Math.abs(sumType("tax"));
  const eurFills = (args.fills || []).filter((row) => String(row.currency || "EUR").toUpperCase() === "EUR");
  const feesEur = money(standaloneFeesEur + eurFills.reduce((sum, row) => sum + Math.abs(money(row.fee_amount)), 0));
  const taxesEur = money(standaloneTaxesEur + eurFills.reduce((sum, row) => sum + Math.abs(money(row.tax_amount)), 0));
  const netContributionsEur = money(depositsEur - withdrawalsEur);
  const currentTotalEur = money(Math.max(0, Number(args.currentTotalEur) || 0));
  const totalResultEur = money(currentTotalEur - netContributionsEur);
  const totalResultPct = netContributionsEur > 0 ? money((totalResultEur / netContributionsEur) * 100) : null;
  const hasFundingHistory = effective.some((row) => ["deposit", "withdrawal"].includes(String(row.movement_type || "").toLowerCase()));

  return {
    status: hasFundingHistory ? (netContributionsEur > 0 ? "ready" : "unavailable") : "building_history",
    methodology: "net_external_cash_flow_v1",
    currency: "EUR",
    currentTotalEur,
    depositsEur,
    withdrawalsEur,
    netContributionsEur,
    totalResultEur: hasFundingHistory ? totalResultEur : null,
    totalResultPct: hasFundingHistory ? totalResultPct : null,
    incomeEur: money(dividendsEur + interestEur),
    dividendsEur,
    interestEur,
    feesEur,
    taxesEur,
    cashFlowAdjusted: hasFundingHistory,
  } as const;
}
