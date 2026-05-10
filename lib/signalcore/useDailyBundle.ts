"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { AutopilotMode } from "@/lib/signalcore/modes";
import { normalizeMode } from "@/lib/signalcore/modes";
import type { DailyBundle } from "@/lib/signalcore/types";

type Status = "idle" | "loading" | "ready" | "error";

type DailyBundleResponse = Partial<DailyBundle> & {
  ok?: boolean;
  mode?: AutopilotMode;
  error?: string;
  message?: string;
};

type DailyBundleCacheEntry = {
  bundle: DailyBundle | null;
  error: string | null;
  lastUpdatedAt: string | null;
  inFlight: Promise<void> | null;
  listeners: Set<() => void>;
};

type DailyBundleSnapshot = {
  bundle: DailyBundle | null;
  error: string | null;
  lastUpdatedAt: string | null;
  isRefreshing: boolean;
};

export type DailyBundleRefreshOptions = {
  forceTradingRefresh?: boolean;
};

const DAILY_BUNDLE_STALE_MS = 45_000;
const dailyBundleCache = new Map<AutopilotMode, DailyBundleCacheEntry>();

function getCacheEntry(mode: AutopilotMode): DailyBundleCacheEntry {
  const existing = dailyBundleCache.get(mode);
  if (existing) return existing;

  const created: DailyBundleCacheEntry = {
    bundle: null,
    error: null,
    lastUpdatedAt: null,
    inFlight: null,
    listeners: new Set(),
  };

  dailyBundleCache.set(mode, created);
  return created;
}

function emitCacheEntry(entry: DailyBundleCacheEntry) {
  for (const listener of entry.listeners) {
    listener();
  }
}

function subscribeToMode(mode: AutopilotMode, listener: () => void) {
  const entry = getCacheEntry(mode);
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
  };
}

function readModeSnapshot(mode: AutopilotMode): DailyBundleSnapshot {
  const entry = getCacheEntry(mode);
  return {
    bundle: entry.bundle,
    error: entry.error,
    lastUpdatedAt: entry.lastUpdatedAt,
    isRefreshing: Boolean(entry.inFlight),
  };
}

function normalizeDailyBundle(mode: AutopilotMode, data: DailyBundleResponse): DailyBundle {
  const normalizedAsOf =
    typeof data?.asOf === "string"
      ? data.asOf
      : typeof data?.asOf === "number"
        ? new Date(data.asOf).toISOString()
        : new Date().toISOString();

  return {
    ...(data as DailyBundle),
    ok: true,
    mode: normalizeMode(data?.mode ?? mode),
    asOf: normalizedAsOf,
    plan: (data as any)?.plan ?? null,
    portfolio: (data as any)?.portfolio ?? null,
    daily: (data as any)?.daily ?? null,
    derived: (data as any)?.derived ?? null,
  };
}

async function loadModeBundle(mode: AutopilotMode, options: DailyBundleRefreshOptions = {}) {
  const entry = getCacheEntry(mode);
  if (entry.inFlight) {
    return entry.inFlight;
  }

  const task = (async () => {
    try {
      const params = new URLSearchParams({ mode });
      if (options.forceTradingRefresh) {
        params.set("tradingRefresh", "live");
      }
      const url = `/api/daily-bundle?${params.toString()}`;

      const res = await fetch(url, {
        method: "GET",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
      });

      const data = (await res.json().catch(() => ({}))) as DailyBundleResponse;

      if (!res.ok) {
        throw new Error(data?.message ?? data?.error ?? `HTTP ${res.status}`);
      }

      if (
        Object.prototype.hasOwnProperty.call(data ?? {}, "ok") &&
        (data as { ok?: boolean }).ok === false
      ) {
        throw new Error(data?.message ?? data?.error ?? "daily_bundle_failed");
      }

      const nextBundle = normalizeDailyBundle(mode, data);
      entry.bundle = nextBundle;
      entry.error = null;
      entry.lastUpdatedAt = nextBundle.asOf;
    } catch (error: any) {
      entry.error = error?.message ?? "Unknown error";
    } finally {
      entry.inFlight = null;
      emitCacheEntry(entry);
    }
  })();

  entry.inFlight = task;
  emitCacheEntry(entry);
  return task;
}

function shouldRefreshSnapshot(snapshot: DailyBundleSnapshot) {
  if (!snapshot.bundle) return true;
  if (!snapshot.lastUpdatedAt) return true;
  const updatedAt = Date.parse(snapshot.lastUpdatedAt);
  if (!Number.isFinite(updatedAt)) return true;
  return Date.now() - updatedAt > DAILY_BUNDLE_STALE_MS;
}

export function useDailyBundle(modeInput?: unknown) {
  const mode = useMemo(() => normalizeMode(modeInput), [modeInput]);
  const [snapshot, setSnapshot] = useState<DailyBundleSnapshot>(() => readModeSnapshot(mode));

  useEffect(() => {
    setSnapshot(readModeSnapshot(mode));

    const unsubscribe = subscribeToMode(mode, () => {
      setSnapshot(readModeSnapshot(mode));
    });

    const nextSnapshot = readModeSnapshot(mode);
    if (shouldRefreshSnapshot(nextSnapshot)) {
      void loadModeBundle(mode);
    }

    return unsubscribe;
  }, [mode]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const nextSnapshot = readModeSnapshot(mode);
      if (shouldRefreshSnapshot(nextSnapshot)) {
        void loadModeBundle(mode);
      }
    }, 20_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [mode]);

  const refresh = useCallback(async (options?: DailyBundleRefreshOptions) => {
    await loadModeBundle(mode, options);
  }, [mode]);

  const status = useMemo<Status>(() => {
    if (snapshot.bundle) return "ready";
    if (snapshot.isRefreshing) return "loading";
    if (snapshot.error) return "error";
    return "idle";
  }, [snapshot.bundle, snapshot.error, snapshot.isRefreshing]);

  const bundle = snapshot.bundle;
  const derived = useMemo(() => bundle?.derived ?? null, [bundle]);
  const portfolio = useMemo(() => bundle?.portfolio ?? null, [bundle]);
  const plan = useMemo(() => bundle?.plan ?? null, [bundle]);
  const daily = useMemo(() => (bundle as any)?.daily ?? null, [bundle]);

  return {
    mode,
    status,
    error: snapshot.error,
    bundle,
    derived,
    portfolio,
    plan,
    daily,
    refresh,
    isRefreshing: snapshot.isRefreshing,
    lastUpdatedAt: snapshot.lastUpdatedAt,
    hasCachedBundle: Boolean(bundle),
  };
}
