function normalizeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function safeNumber(value: unknown, fallback = 0) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function incrementCounter(map: Record<string, number>, key: string, amount = 1) {
  if (!key) return;
  map[key] = (map[key] || 0) + amount;
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function maxValue(values: number[]) {
  if (!values.length) return 0;
  return Math.max(...values);
}

function toIsoOrNull(value: unknown) {
  const date = new Date(String(value || ""));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export type InvestingMandateSnapshotAuditRow = Record<string, any>;
export type InvestingRebalanceLedgerAuditRow = Record<string, any>;
export type InvestingResearchSnapshotAuditRow = Record<string, any>;

export function buildInvestingHistoricalAudit(args: {
  mandateSnapshots: InvestingMandateSnapshotAuditRow[];
  rebalanceLedger: InvestingRebalanceLedgerAuditRow[];
  researchSnapshots: InvestingResearchSnapshotAuditRow[];
}) {
  const mandateSnapshots = normalizeArray(args.mandateSnapshots);
  const rebalanceLedger = normalizeArray(args.rebalanceLedger);
  const researchSnapshots = normalizeArray(args.researchSnapshots);

  const mandateByFingerprint = new Map<string, Record<string, any>>();
  for (const row of mandateSnapshots) {
    const fingerprint = String(row?.mandate_fingerprint || "").trim();
    if (fingerprint) {
      mandateByFingerprint.set(fingerprint, row);
    }
  }

  const validationStatuses: Record<string, number> = {};
  const rebalanceStatuses: Record<string, number> = {};
  const objectiveCounts: Record<string, number> = {};
  const benchmarkCounts: Record<string, number> = {};
  const reasonCodeCounts: Record<string, number> = {};
  const warningCounts: Record<string, number> = {};
  const activeBetCounts: Record<string, number> = {};

  const overlapValues: number[] = [];
  const activeShareValues: number[] = [];
  const concentrationValues: number[] = [];
  const turnoverValues: number[] = [];

  let latestResearch: Record<string, any> | null = null;
  let latestRebalance: Record<string, any> | null = null;
  let latestMandate: Record<string, any> | null = null;

  for (const row of mandateSnapshots) {
    const objective = String(row?.objective || "").trim();
    if (objective) incrementCounter(objectiveCounts, objective);
    if (!latestMandate || String(row?.as_of || "") > String(latestMandate?.as_of || "")) {
      latestMandate = row;
    }
  }

  for (const row of rebalanceLedger) {
    incrementCounter(rebalanceStatuses, String(row?.status || "unknown").trim() || "unknown");
    const turnoverPct = safeNumber(row?.valuation_context?.gross_turnover_pct);
    if (turnoverPct > 0) turnoverValues.push(turnoverPct);
    for (const code of normalizeArray(row?.reason_codes).map((entry) => String(entry || "").trim()).filter(Boolean)) {
      incrementCounter(reasonCodeCounts, code);
    }
    if (!latestRebalance || String(row?.as_of || "") > String(latestRebalance?.as_of || "")) {
      latestRebalance = row;
    }
  }

  for (const row of researchSnapshots) {
    const status = String(row?.status || "unknown").trim() || "unknown";
    incrementCounter(validationStatuses, status);

    const summary = row?.summary ?? {};
    const benchmarkId = String(row?.benchmark_id || summary?.benchmarkId || "").trim();
    if (benchmarkId) incrementCounter(benchmarkCounts, benchmarkId);

    overlapValues.push(safeNumber(summary?.overlapWeightPct));
    activeShareValues.push(safeNumber(summary?.activeSharePct));
    concentrationValues.push(safeNumber(summary?.concentrationDriftPct));
    turnoverValues.push(safeNumber(summary?.turnoverPct));

    const instrumentScorecards = normalizeArray(row?.research_payload?.instrumentScorecards);
    for (const scorecard of instrumentScorecards as Record<string, any>[]) {
      const symbol = String(scorecard?.symbol || "").trim();
      for (const warning of normalizeArray(scorecard?.warnings).map((entry) => String(entry || "").trim()).filter(Boolean)) {
        incrementCounter(warningCounts, symbol ? `${symbol}:${warning}` : warning);
      }
    }

    const activeBets = normalizeArray(row?.research_payload?.benchmarkValidation?.activeBets);
    for (const bet of activeBets as Record<string, any>[]) {
      const symbol = String(bet?.symbol || "").trim();
      if (symbol) incrementCounter(activeBetCounts, symbol);
    }

    const linkedMandate = mandateByFingerprint.get(String(row?.mandate_fingerprint || "").trim());
    const objective =
      String(linkedMandate?.objective || linkedMandate?.inputs?.objective || "").trim();
    if (objective) incrementCounter(objectiveCounts, objective);

    if (!latestResearch || String(row?.as_of || "") > String(latestResearch?.as_of || "")) {
      latestResearch = row;
    }
  }

  const latestStatus = String(latestResearch?.status || "").trim() || "unknown";
  const maxTurnoverPct = maxValue(turnoverValues);
  const maxConcentrationDriftPct = maxValue(concentrationValues);
  const reviewCount = validationStatuses.review || 0;
  const blockedCount = rebalanceStatuses.blocked || 0;

  let stabilityStatus: "stable" | "watch" | "unstable" = "stable";
  if (latestStatus !== "pass" || reviewCount > 0 || maxTurnoverPct > 25 || maxConcentrationDriftPct > 20) {
    stabilityStatus = "watch";
  }
  if (blockedCount > 0 || validationStatuses.fail || maxTurnoverPct > 40 || maxConcentrationDriftPct > 30) {
    stabilityStatus = "unstable";
  }

  const topWarnings = Object.entries(warningCounts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 10)
    .map(([key, count]) => ({ key, count }));

  const topActiveBets = Object.entries(activeBetCounts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 10)
    .map(([symbol, count]) => ({ symbol, count }));

  return {
    generatedAt: new Date().toISOString(),
    coverage: {
      mandateSnapshots: mandateSnapshots.length,
      rebalanceLedger: rebalanceLedger.length,
      researchSnapshots: researchSnapshots.length,
    },
    latest: {
      mandateAsOf: toIsoOrNull(latestMandate?.as_of),
      rebalanceAsOf: toIsoOrNull(latestRebalance?.as_of),
      researchAsOf: toIsoOrNull(latestResearch?.as_of),
      researchStatus: latestStatus,
      benchmarkId: String(
        latestResearch?.benchmark_id || latestResearch?.summary?.benchmarkId || latestMandate?.inputs?.benchmarkId || "",
      ).trim() || null,
      objective:
        String(latestMandate?.objective || latestMandate?.inputs?.objective || "").trim() || null,
    },
    summary: {
      stabilityStatus,
      validationStatuses,
      rebalanceStatuses,
      objectiveCounts,
      benchmarkCounts,
      averageOverlapWeightPct: average(overlapValues),
      averageActiveSharePct: average(activeShareValues),
      averageConcentrationDriftPct: average(concentrationValues),
      averageTurnoverPct: average(turnoverValues),
      maxConcentrationDriftPct,
      maxTurnoverPct,
      distinctReasonCodes: Object.keys(reasonCodeCounts).length,
      distinctWarnings: Object.keys(warningCounts).length,
    },
    reasonCodeCounts,
    topWarnings,
    topActiveBets,
  };
}
