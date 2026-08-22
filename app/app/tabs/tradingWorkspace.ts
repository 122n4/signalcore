"use client";

import { useMemo } from "react";

import { useDailyBundle } from "@/lib/signalcore/useDailyBundle";
import { assessTradingLiveSnapshot } from "@/lib/trading/liveSnapshotDiscipline";
import { deriveTradingNotificationEvents } from "@/lib/trading/notifications";
import type {
  TradingActionGuidance,
  TradingFeedEvent,
  TradingLiveDecision,
  TradingWatchlistEntry,
  TradingWatchlistFocus,
  TradingWatchlistSection,
} from "@/lib/trading/state";
import {
  isTradingNearReadyOpportunity,
  resolveTradingActionGuidance,
} from "@/lib/trading/state";

export type TradingJournalEvent = TradingFeedEvent & {
  instrument: string;
};

export type TradingOpportunityLayerKey =
  | "execution_now"
  | "opportunity_queue"
  | "watchlist"
  | "radar";

export type TradingOpportunityLayer = {
  key: TradingOpportunityLayerKey;
  title: string;
  description: string;
  entries: TradingWatchlistEntry[];
  marketOpenCount: number;
};

export type TradingWorkspacePrimaryAction = TradingActionGuidance & {
  entry: TradingWatchlistEntry;
  layerKey: TradingOpportunityLayerKey;
};

const TRADING_OPPORTUNITY_LAYER_META: Record<
  TradingOpportunityLayerKey,
  Pick<TradingOpportunityLayer, "title" | "description">
> = {
  execution_now: {
    title: "Execution now",
    description: "Actionable now. These are the cleanest live setups with execution allowed.",
  },
  opportunity_queue: {
    title: "Opportunity queue",
    description:
      "Real opportunities plus near-ready setups with clean structure, but still capped by caution or tighter execution discipline.",
  },
  watchlist: {
    title: "Watchlist",
    description: "Worth monitoring. Something is building, but there is no clean trigger yet.",
  },
  radar: {
    title: "Radar",
    description: "Broad scanner coverage. Includes waiting, restricted, closed, or lower-priority markets.",
  },
};

function resolveTradingOpportunityLayerKey(entry: TradingWatchlistEntry): TradingOpportunityLayerKey {
  const state = entry.currentState;
  const executionStatus = entry.executionStatus;
  const contextText = [
    entry.contextSummary.contextLabel ?? "",
    entry.contextSummary.priorityReason ?? "",
  ]
    .join(" ")
    .toLowerCase();

  if (
    (state === "TRADE_VALID" || state === "TRADE_ACTIVE") &&
    executionStatus === "allowed"
  ) {
    return "execution_now";
  }

  if (
    (state === "TRADE_VALID" || state === "TRADE_ACTIVE") &&
    executionStatus === "caution"
  ) {
    return "opportunity_queue";
  }

  if (isTradingNearReadyOpportunity(entry)) {
    return "opportunity_queue";
  }

  if (
    state === "SETUP_FORMING" ||
    state === "SESSION_OPEN" ||
    (state === "WAIT" &&
      (contextText.includes("forming") ||
        contextText.includes("building") ||
        contextText.includes("develop")))
  ) {
    return "watchlist";
  }

  return "radar";
}

export function composeTradingOpportunityLayers(
  entries: TradingWatchlistEntry[],
): TradingOpportunityLayer[] {
  const grouped = new Map<TradingOpportunityLayerKey, TradingWatchlistEntry[]>();

  for (const entry of entries) {
    const key = resolveTradingOpportunityLayerKey(entry);
    const current = grouped.get(key) ?? [];
    current.push(entry);
    grouped.set(key, current);
  }

  return (
    ["execution_now", "opportunity_queue", "watchlist", "radar"] as TradingOpportunityLayerKey[]
  ).flatMap((key) => {
    const layerEntries = grouped.get(key) ?? [];

    if (!layerEntries.length) {
      return [];
    }

    return [
      {
        key,
        title: TRADING_OPPORTUNITY_LAYER_META[key].title,
        description: TRADING_OPPORTUNITY_LAYER_META[key].description,
        marketOpenCount: layerEntries.filter((entry) => entry.contextSummary.marketOpen).length,
        entries: layerEntries,
      },
    ];
  });
}

export function limitTradingOpportunityLayers(
  layers: TradingOpportunityLayer[],
  limit: number | null | undefined,
): TradingOpportunityLayer[] {
  if (!limit || limit < 1) return layers;

  let remaining = limit;
  const limited: TradingOpportunityLayer[] = [];

  for (const layer of layers) {
    if (remaining <= 0) break;
    const entries = layer.entries.slice(0, remaining);
    if (!entries.length) continue;
    limited.push({
      ...layer,
      entries,
      marketOpenCount: entries.filter((entry) => entry.contextSummary.marketOpen).length,
    });
    remaining -= entries.length;
  }

  return limited;
}

export function resolveTradingWorkspacePrimaryAction(
  layers: TradingOpportunityLayer[],
): TradingWorkspacePrimaryAction | null {
  for (const layer of layers) {
    const leadEntry = layer.entries[0];

    if (!leadEntry) {
      continue;
    }

    return {
      ...resolveTradingActionGuidance(leadEntry),
      entry: leadEntry,
      layerKey: layer.key,
    };
  }

  return null;
}

export function useTradingWorkspace(modeInput = "trading") {
  const {
    mode,
    status,
    error,
    daily,
    refresh,
    isRefreshing,
    lastUpdatedAt,
    hasCachedBundle,
  } = useDailyBundle(modeInput);

  const trading = useMemo(() => {
    return (daily as any)?.support?.trading ?? (daily as any)?.trading ?? null;
  }, [daily]);
  const tradingAccess = useMemo(() => {
    return daily?.tradingAccess ?? null;
  }, [daily]);

  const sections = useMemo<TradingWatchlistSection[]>(() => {
    return trading?.watchlistSections ?? [];
  }, [trading]);

  const entries = useMemo<TradingWatchlistEntry[]>(() => {
    return sections.flatMap((section) => section.entries);
  }, [sections]);

  const focus = useMemo<TradingWatchlistFocus | null>(() => {
    return trading?.watchlistFocus ?? null;
  }, [trading]);

  const opportunityLayers = useMemo<TradingOpportunityLayer[]>(() => {
    return composeTradingOpportunityLayers(entries);
  }, [entries]);
  const primaryAction = useMemo<TradingWorkspacePrimaryAction | null>(() => {
    return resolveTradingWorkspacePrimaryAction(opportunityLayers);
  }, [opportunityLayers]);
  const notifications = useMemo(() => {
    return deriveTradingNotificationEvents(entries);
  }, [entries]);

  const leadEntry = useMemo<TradingWatchlistEntry | null>(() => {
    if (!entries.length) {
      return null;
    }

    if (focus?.anchorInstrument) {
      return entries.find((entry) => entry.instrument === focus.anchorInstrument) ?? entries[0];
    }

    return entries[0];
  }, [entries, focus]);
  const tradingSnapshotAt = useMemo(
    () => leadEntry?.chart?.snapshotAt ?? trading?.snapshotAt ?? null,
    [leadEntry, trading],
  );
  const snapshotDiscipline = useMemo(
    () =>
      assessTradingLiveSnapshot({
        snapshotAt: tradingSnapshotAt,
        marketOpen: leadEntry?.contextSummary.marketOpen ?? focus?.marketOpen ?? false,
      }),
    [focus, leadEntry, tradingSnapshotAt],
  );

  const feed = useMemo<TradingJournalEvent[]>(() => {
    return entries
      .flatMap((entry) =>
        (entry.liveDecision.feed ?? []).map((event) => ({
          ...event,
          instrument: entry.instrument,
        })),
      )
      .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp));
  }, [entries]);

  return {
    mode,
    status,
    error,
    refresh,
    isRefreshing,
    lastUpdatedAt: tradingSnapshotAt ?? lastUpdatedAt,
    hasCachedBundle,
    tradingAccess,
    trading,
    sections,
    entries,
    focus,
    snapshotDiscipline,
    opportunityLayers,
    primaryAction,
    notifications,
    leadEntry,
    feed,
  };
}

export function formatTradingState(value: string | null | undefined) {
  const source = String(value ?? "").trim();
  if (!source) return "Unknown";
  return source
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}

export function formatExecutionStatus(
  value: TradingLiveDecision["executionStatus"] | null | undefined,
) {
  if (value === "allowed") return "Allowed";
  if (value === "restricted") return "Restricted";
  if (value === "caution") return "Caution";
  return "Unknown";
}

export function toneClasses(tone: "neutral" | "good" | "warn" | "bad") {
  if (tone === "good") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (tone === "warn") return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  if (tone === "bad") return "border-rose-500/30 bg-rose-500/10 text-rose-200";
  return "border-slate-700 bg-[#0f1a2d] text-slate-300";
}

export function executionStatusTone(
  value: TradingLiveDecision["executionStatus"] | null | undefined,
): "good" | "warn" | "bad" {
  if (value === "allowed") return "good";
  if (value === "caution") return "warn";
  return "bad";
}

export function coverageStatusTone(
  value: TradingWatchlistEntry["contextSummary"]["coverageStatus"] | null | undefined,
): "good" | "warn" | "bad" {
  if (value === "coverage_backed") return "good";
  if (value === "staged_only") return "warn";
  return "bad";
}

export function formatCoverageLabel(
  value: TradingWatchlistEntry["contextSummary"]["coverageLabel"] | null | undefined,
) {
  return value?.trim() || "Live-only";
}

export function compactPrice(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }

  if (Math.abs(value) >= 1000) {
    return value.toFixed(1);
  }

  if (Math.abs(value) >= 10) {
    return value.toFixed(2);
  }

  return value.toFixed(4);
}
