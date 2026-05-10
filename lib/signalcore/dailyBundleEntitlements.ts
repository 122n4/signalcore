import type { DecisionEnvelope } from "@/lib/decision/types";
import type {
  AccessEntitlements,
  AccessTier,
  EntitledViewKey,
} from "@/lib/signalcore/entitlements";
import type { AutopilotMode } from "@/lib/signalcore/modes";
import type {
  TradingChartSnapshot,
  TradingFeedEvent,
  TradingLiveDecision,
  TradingWatchlistEntry,
  TradingWatchlistFocus,
  TradingWatchlistSection,
} from "@/lib/trading/state";
import { summarizeTradingWatchlistCoverage } from "@/lib/trading/state";

const DAY_MS = 24 * 60 * 60 * 1000;

type DailyBundleLike = {
  daily?: Record<string, any>;
  derived?: Record<string, any> | null;
};

export type DailyBundleTradingAccessSnapshot = {
  tier: AccessTier;
  mode: AutopilotMode;
  marketCoverage: AccessEntitlements["trading"]["marketCoverage"];
  discoveryInstrumentLimit: number | null;
  visibleHistoryDays: number | null;
  weeklyOpportunityBudget: number | null;
  executionEnabled: boolean;
  riskEnabled: boolean;
  journalEnabled: boolean;
  alertsEnabled: boolean;
  tradingViews: EntitledViewKey[];
  lockedTradingViews: EntitledViewKey[];
  discoveryApplied: boolean;
};

function safeObj<T extends Record<string, any>>(value: unknown): T | null {
  return value && typeof value === "object" ? (value as T) : null;
}

function asList<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function parseMs(value: unknown): number | null {
  const date = new Date(String(value || ""));
  const ms = date.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function keepWithinWindow(timestamp: unknown, asOf: string, visibleHistoryDays: number | null): boolean {
  if (!visibleHistoryDays || visibleHistoryDays < 1) return true;
  const eventMs = parseMs(timestamp);
  const asOfMs = parseMs(asOf);
  if (eventMs == null || asOfMs == null) return true;
  return eventMs >= asOfMs - visibleHistoryDays * DAY_MS;
}

function trimFeed(feed: TradingFeedEvent[], asOf: string, visibleHistoryDays: number | null) {
  if (!visibleHistoryDays || visibleHistoryDays < 1) return feed;
  return feed.filter((event) => keepWithinWindow(event.timestamp, asOf, visibleHistoryDays));
}

function trimChart(
  chart: TradingChartSnapshot | null | undefined,
  asOf: string,
  visibleHistoryDays: number | null,
): TradingChartSnapshot | null {
  if (!chart) return null;
  if (!visibleHistoryDays || visibleHistoryDays < 1) return chart;
  return {
    ...chart,
    candles: chart.candles.filter((candle) =>
      keepWithinWindow(candle.timestamp, asOf, visibleHistoryDays),
    ),
  };
}

function trimLiveDecision(
  liveDecision: TradingLiveDecision | null | undefined,
  asOf: string,
  visibleHistoryDays: number | null,
): TradingLiveDecision | null {
  if (!liveDecision) return null;
  if (!visibleHistoryDays || visibleHistoryDays < 1) return liveDecision;
  return {
    ...liveDecision,
    feed: trimFeed(liveDecision.feed ?? [], asOf, visibleHistoryDays),
  };
}

function trimWatchlistEntry(
  entry: TradingWatchlistEntry,
  asOf: string,
  visibleHistoryDays: number | null,
): TradingWatchlistEntry {
  return {
    ...entry,
    chart: trimChart(entry.chart, asOf, visibleHistoryDays),
    liveDecision: (trimLiveDecision(entry.liveDecision, asOf, visibleHistoryDays) ??
      entry.liveDecision) as TradingLiveDecision,
  };
}

function limitSectionsForDiscovery(
  sections: TradingWatchlistSection[],
  limit: number | null | undefined,
  asOf: string,
  visibleHistoryDays: number | null,
): TradingWatchlistSection[] {
  const normalizedSections = sections.map((section) => ({
    ...section,
    entries: section.entries.map((entry) => trimWatchlistEntry(entry, asOf, visibleHistoryDays)),
  }));

  if (!limit || limit < 1) {
    return normalizedSections.map((section) => ({
      ...section,
      marketOpenCount: section.entries.filter((entry) => entry.contextSummary.marketOpen).length,
    }));
  }

  let remaining = limit;
  const limited: TradingWatchlistSection[] = [];

  for (const section of normalizedSections) {
    if (remaining <= 0) break;
    const entries = section.entries.slice(0, remaining);
    if (!entries.length) continue;
    limited.push({
      ...section,
      entries,
      marketOpenCount: entries.filter((entry) => entry.contextSummary.marketOpen).length,
    });
    remaining -= entries.length;
  }

  return limited;
}

function buildFocusFromEntry(entry: TradingWatchlistEntry): TradingWatchlistFocus {
  return {
    anchorInstrument: entry.instrument,
    sessionLabel: entry.contextSummary.sessionLabel,
    marketOpen: entry.contextSummary.marketOpen,
    contextLabel: entry.contextSummary.contextLabel,
    priorityReason: entry.contextSummary.priorityReason ?? null,
    coverageStatus: entry.contextSummary.coverageStatus,
    coverageLabel: entry.contextSummary.coverageLabel,
    sectionKey: entry.watchlistPlacement?.sectionKey ?? null,
    sectionTitle: entry.watchlistPlacement?.sectionTitle ?? null,
  };
}

function limitArray<T>(rows: T[], limit: number | null | undefined): T[] {
  if (!limit || limit < 1) return rows;
  return rows.slice(0, limit);
}

function trimOpportunityQueue(
  value: unknown,
  limit: number | null | undefined,
) {
  const queue = safeObj<Record<string, any>>(value);
  if (!queue) return value;
  return {
    ...queue,
    items: limitArray(asList(queue.items), limit),
  };
}

function trimDecisionEnvelopeTrading(args: {
  envelope: DecisionEnvelope;
  asOf: string;
  discoveryInstrumentLimit: number | null;
  visibleHistoryDays: number | null;
}): DecisionEnvelope {
  const trading = args.envelope.support.trading;
  if (!trading) return args.envelope;

  const watchlistSections = limitSectionsForDiscovery(
    trading.watchlistSections ?? [],
    args.discoveryInstrumentLimit,
    args.asOf,
    args.visibleHistoryDays,
  );
  const watchlist = watchlistSections.flatMap((section) => section.entries);
  const allowedInstruments = new Set(watchlist.map((entry) => entry.instrument));
  const watchlistFocus =
    trading.watchlistFocus && allowedInstruments.has(trading.watchlistFocus.anchorInstrument)
      ? trading.watchlistFocus
      : watchlist[0]
        ? buildFocusFromEntry(watchlist[0])
        : null;
  const leadEntry = watchlist[0] ?? null;

  return {
    ...args.envelope,
    support: {
      ...args.envelope.support,
      trading: {
        ...trading,
        snapshotAt:
          leadEntry?.chart?.snapshotAt ??
          trimChart(trading.chart, args.asOf, args.visibleHistoryDays)?.snapshotAt ??
          trading.snapshotAt ??
          null,
        liveDecision:
          leadEntry?.liveDecision ??
          trimLiveDecision(trading.liveDecision, args.asOf, args.visibleHistoryDays) ??
          trading.liveDecision,
        chart:
          leadEntry?.chart ??
          trimChart(trading.chart, args.asOf, args.visibleHistoryDays) ??
          trading.chart,
        watchlist,
        watchlistFocus,
        watchlistSections,
        marketCoverageSummary: summarizeTradingWatchlistCoverage(watchlist),
      },
    },
  };
}

export function buildDailyBundleTradingAccessSnapshot(args: {
  tier: AccessTier;
  mode: AutopilotMode;
  entitlements: AccessEntitlements;
  discoveryApplied: boolean;
}): DailyBundleTradingAccessSnapshot {
  return {
    tier: args.tier,
    mode: args.mode,
    marketCoverage: args.entitlements.trading.marketCoverage,
    discoveryInstrumentLimit: args.entitlements.trading.discoveryInstrumentLimit,
    visibleHistoryDays: args.entitlements.trading.visibleHistoryDays,
    weeklyOpportunityBudget: args.entitlements.trading.weeklyOpportunityBudget,
    executionEnabled: args.entitlements.trading.executionEnabled,
    riskEnabled: args.entitlements.trading.riskEnabled,
    journalEnabled: args.entitlements.trading.journalEnabled,
    alertsEnabled: args.entitlements.trading.alertsEnabled,
    tradingViews: [...args.entitlements.tradingViews],
    lockedTradingViews: [...args.entitlements.lockedTradingViews],
    discoveryApplied: args.discoveryApplied,
  };
}

export function applyDailyBundleEntitlements<T extends DailyBundleLike>(
  response: T,
  args: {
    mode: AutopilotMode;
    tier: AccessTier;
    entitlements: AccessEntitlements;
    asOf: string;
  },
): T {
  const daily = safeObj<Record<string, any>>(response.daily) ?? {};
  const hasDerivedNode = Object.prototype.hasOwnProperty.call(response, "derived");
  const derivedValue = hasDerivedNode ? (response as any).derived : undefined;
  const derived = safeObj<Record<string, any>>(derivedValue);
  const discoveryApplied = args.mode === "trading" && args.tier === "free";
  const tradingAccess = buildDailyBundleTradingAccessSnapshot({
    tier: args.tier,
    mode: args.mode,
    entitlements: args.entitlements,
    discoveryApplied,
  });

  let nextDaily: Record<string, any> = {
    ...daily,
    tradingAccess,
  };

  const nextDerived: Record<string, any> | null | undefined =
    derivedValue === null
      ? null
      : {
          ...(derived ?? {}),
          tradingAccess,
        };

  if (discoveryApplied) {
    const discoveryInstrumentLimit = args.entitlements.trading.discoveryInstrumentLimit;
    const visibleHistoryDays = args.entitlements.trading.visibleHistoryDays;
    const opportunityLimit =
      args.entitlements.trading.weeklyOpportunityBudget ??
      args.entitlements.trading.discoveryInstrumentLimit;

    nextDaily = {
      ...nextDaily,
      opportunities: limitArray(asList(nextDaily.opportunities), opportunityLimit),
      top_opportunities: limitArray(asList(nextDaily.top_opportunities), opportunityLimit),
      opportunities_dashboard: limitArray(
        asList(nextDaily.opportunities_dashboard),
        opportunityLimit,
      ),
      opportunityQueue: trimOpportunityQueue(nextDaily.opportunityQueue, opportunityLimit),
    };

    const decisionGovernance = safeObj<Record<string, any>>(nextDaily.decisionGovernance);
    if (decisionGovernance) {
      nextDaily.decisionGovernance = {
        ...decisionGovernance,
        top_opportunities: limitArray(asList(decisionGovernance.top_opportunities), opportunityLimit),
        opportunities: limitArray(asList(decisionGovernance.opportunities), opportunityLimit),
      };
    }

    const envelope = safeObj<DecisionEnvelope>(nextDaily.decisionEnvelope);
    if (envelope) {
      nextDaily.decisionEnvelope = trimDecisionEnvelopeTrading({
        envelope,
        asOf: args.asOf,
        discoveryInstrumentLimit,
        visibleHistoryDays,
      });
    }
  }

  return {
    ...response,
    daily: nextDaily,
    ...(hasDerivedNode ? { derived: nextDerived ?? null } : {}),
  };
}
