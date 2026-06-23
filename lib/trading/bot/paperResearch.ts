import type { PaperTradeHistoryRow } from "@/lib/trading/bot/paperPerformance";

export type PaperResearchBucket = {
  key: string;
  label: string;
  total: number;
  closed: number;
  wins: number;
  losses: number;
  open: number;
  ambiguous: number;
  retryable: number;
  unavailable: number;
  rejected: number;
  winRate: number | null;
  netR: number;
  averageR: number | null;
  profitFactor: number | null;
};

export type PaperResearchReport = {
  generatedAt: string;
  sample: {
    total: number;
    closed: number;
    quality: "too_small" | "building" | "useful" | "strong";
    note: string;
  };
  overall: PaperResearchBucket;
  byInstrument: PaperResearchBucket[];
  bySetup: PaperResearchBucket[];
  bySession: PaperResearchBucket[];
  byTimeframe: PaperResearchBucket[];
  insights: string[];
};

type BucketAccumulator = {
  key: string;
  label: string;
  total: number;
  closed: number;
  wins: number;
  losses: number;
  open: number;
  ambiguous: number;
  retryable: number;
  unavailable: number;
  rejected: number;
  netR: number;
  grossWinR: number;
  grossLossR: number;
};

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function readable(value: unknown, fallback = "Unknown") {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  return raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function outcomeStatus(details: Record<string, any>) {
  return String(asObject(details.paperOutcome).status || "open");
}

function outcomeR(details: Record<string, any>) {
  const value = Number(asObject(details.paperOutcome).resultR);
  return Number.isFinite(value) ? value : null;
}

function isExecutablePaperTrade(row: PaperTradeHistoryRow) {
  const details = asObject(row.details);
  return Boolean(
    details.intent &&
      details.planned?.action === "ready" &&
      ["accepted", "paper_queued", "paper_filled"].includes(String(details.execution?.status || "")),
  );
}

function candidate(details: Record<string, any>) {
  return asObject(details.candidate);
}

function researchContext(details: Record<string, any>) {
  const stored = asObject(details.paperResearchContext);
  if (Object.keys(stored).length > 0) return stored;

  const rawCandidate = candidate(details);
  const rawScannerContext = asObject(details.scannerContext);
  const setupCore = asObject(rawScannerContext.setupCore ?? rawCandidate.setupCore);
  const market = asObject(rawScannerContext.market ?? rawCandidate.market);
  const session = asObject(market.session);
  const chart = asObject(rawScannerContext.chart ?? rawCandidate.chart);
  const snapshot = asObject(rawScannerContext.snapshot ?? rawCandidate.snapshot);
  const contextSummary = asObject(rawScannerContext.contextSummary ?? rawCandidate.contextSummary);
  const executionPlan = asObject(rawScannerContext.executionPlan ?? rawCandidate.executionPlan);

  return {
    instrument: details.intent?.instrument ?? rawCandidate.snapshot?.instrument ?? snapshot.instrument,
    side: details.intent?.side ?? rawCandidate.side,
    setupType: setupCore.setup?.type,
    setupGrade: setupCore.quality?.grade,
    setupQuality: setupCore.quality?.score,
    maturityState: setupCore.maturity?.state,
    maturityScore: setupCore.maturity?.score,
    opportunityWindow: setupCore.opportunityWindow?.state,
    session: session.session,
    sessionLabel: contextSummary.sessionLabel,
    timeframe: chart.timeframe ?? market.timeframes?.[0],
    marketOpen: session.marketOpen,
    executionStatus: executionPlan.executionStatus?.executionStatus,
    snapshotAt: snapshot.snapshotAt,
  };
}

function createAccumulator(key: string, label: string): BucketAccumulator {
  return {
    key,
    label,
    total: 0,
    closed: 0,
    wins: 0,
    losses: 0,
    open: 0,
    ambiguous: 0,
    retryable: 0,
    unavailable: 0,
    rejected: 0,
    netR: 0,
    grossWinR: 0,
    grossLossR: 0,
  };
}

function addRow(bucket: BucketAccumulator, row: PaperTradeHistoryRow) {
  const details = asObject(row.details);
  const status = outcomeStatus(details);
  const resultR = outcomeR(details);
  bucket.total += 1;

  if (status === "won") {
    bucket.closed += 1;
    bucket.wins += 1;
    bucket.netR += resultR ?? 0;
    bucket.grossWinR += Math.max(0, resultR ?? 0);
  } else if (status === "lost") {
    bucket.closed += 1;
    bucket.losses += 1;
    bucket.netR += resultR ?? -1;
    bucket.grossLossR += Math.abs(Math.min(0, resultR ?? -1));
  } else if (status === "ambiguous") {
    bucket.ambiguous += 1;
  } else if (status === "unavailable_retryable") {
    bucket.retryable += 1;
  } else if (status === "unavailable") {
    bucket.unavailable += 1;
  } else if (status === "rejected") {
    bucket.rejected += 1;
  } else {
    bucket.open += 1;
  }
}

function finalize(bucket: BucketAccumulator): PaperResearchBucket {
  return {
    key: bucket.key,
    label: bucket.label,
    total: bucket.total,
    closed: bucket.closed,
    wins: bucket.wins,
    losses: bucket.losses,
    open: bucket.open,
    ambiguous: bucket.ambiguous,
    retryable: bucket.retryable,
    unavailable: bucket.unavailable,
    rejected: bucket.rejected,
    winRate: bucket.closed > 0 ? round2((bucket.wins / bucket.closed) * 100) : null,
    netR: round2(bucket.netR),
    averageR: bucket.closed > 0 ? round2(bucket.netR / bucket.closed) : null,
    profitFactor:
      bucket.grossLossR > 0
        ? round2(bucket.grossWinR / bucket.grossLossR)
        : bucket.grossWinR > 0
          ? null
          : null,
  };
}

function groupBy(
  rows: PaperTradeHistoryRow[],
  getKey: (details: Record<string, any>) => { key: string; label: string },
) {
  const buckets = new Map<string, BucketAccumulator>();
  for (const row of rows) {
    const details = asObject(row.details);
    const { key, label } = getKey(details);
    const bucket = buckets.get(key) ?? createAccumulator(key, label);
    addRow(bucket, row);
    buckets.set(key, bucket);
  }

  return [...buckets.values()]
    .map(finalize)
    .sort((left, right) => {
      if (right.closed !== left.closed) return right.closed - left.closed;
      return right.netR - left.netR;
    });
}

function sampleQuality(closed: number): PaperResearchReport["sample"]["quality"] {
  if (closed < 10) return "too_small";
  if (closed < 30) return "building";
  if (closed < 100) return "useful";
  return "strong";
}

function sampleNote(quality: PaperResearchReport["sample"]["quality"]) {
  if (quality === "too_small") return "Paper sample is still too small. Use it as live telemetry, not as a trading conclusion.";
  if (quality === "building") return "Paper sample is building. Early patterns can guide research, but need more closed trades.";
  if (quality === "useful") return "Paper sample is useful enough to compare markets, sessions, and setup filters.";
  return "Paper sample is strong enough to influence research gates when aligned with backtest and crisis validation.";
}

function insightFor(label: string, buckets: PaperResearchBucket[], minClosed: number) {
  const qualified = buckets.filter((bucket) => bucket.closed >= minClosed && bucket.key !== "unknown");
  if (qualified.length === 0) return null;
  const best = [...qualified].sort((left, right) => right.netR - left.netR)[0];
  const worst = [...qualified].sort((left, right) => left.netR - right.netR)[0];
  if (!best || !worst) return null;
  if (best.key === worst.key) {
    return `${label}: ${best.label} is the only qualified bucket so far (${best.closed} closed, ${best.netR}R).`;
  }
  return `${label}: strongest ${best.label} (${best.closed} closed, ${best.netR}R); weakest ${worst.label} (${worst.closed} closed, ${worst.netR}R).`;
}

export function buildPaperResearchContext(details: Record<string, any>) {
  return researchContext(details);
}

export function buildPaperResearchReport(rows: PaperTradeHistoryRow[], now = new Date()): PaperResearchReport {
  const tradeRows = rows.filter(isExecutablePaperTrade);
  const overallAccumulator = createAccumulator("overall", "Overall");
  for (const row of tradeRows) addRow(overallAccumulator, row);
  const overall = finalize(overallAccumulator);
  const quality = sampleQuality(overall.closed);

  const byInstrument = groupBy(tradeRows, (details) => {
    const context = researchContext(details);
    const instrument = String(context.instrument || details.intent?.instrument || "unknown").toUpperCase();
    return { key: instrument, label: instrument };
  });
  const bySetup = groupBy(tradeRows, (details) => {
    const context = researchContext(details);
    const setup = String(context.setupType || "unknown");
    return { key: setup, label: readable(setup) };
  });
  const bySession = groupBy(tradeRows, (details) => {
    const context = researchContext(details);
    const session = String(context.session || context.sessionLabel || "unknown");
    return { key: session, label: readable(context.sessionLabel || session) };
  });
  const byTimeframe = groupBy(tradeRows, (details) => {
    const context = researchContext(details);
    const timeframe = String(context.timeframe || "unknown");
    return { key: timeframe, label: timeframe };
  });

  const minClosed = overall.closed >= 30 ? 5 : 2;
  const insights = [
    sampleNote(quality),
    insightFor("Markets", byInstrument, minClosed),
    insightFor("Setups", bySetup, minClosed),
    insightFor("Sessions", bySession, minClosed),
    overall.unavailable > 0
      ? `${overall.unavailable} paper trades still have unavailable settlement data; improve candle coverage before trusting the full paper score.`
      : null,
    overall.retryable > 0
      ? `${overall.retryable} paper trades are waiting for retryable candle/provider settlement and are excluded from WR/PF.`
      : null,
    overall.open > 0
      ? `${overall.open} paper trades are still open; win rate will change as target/stop resolves.`
      : null,
    rows.length > tradeRows.length
      ? `${rows.length - tradeRows.length} recorded paper cycles were ignored by research because they were blocked, rejected, or not executable.`
      : null,
  ].filter((item): item is string => Boolean(item));

  return {
    generatedAt: now.toISOString(),
    sample: {
      total: overall.total,
      closed: overall.closed,
      quality,
      note: sampleNote(quality),
    },
    overall,
    byInstrument,
    bySetup,
    bySession,
    byTimeframe,
    insights,
  };
}
