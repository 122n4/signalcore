"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

import {
  isTradingInstrumentFollowed,
  readFollowedTradingInstruments,
  subscribeFollowedTradingInstruments,
  toggleFollowedTradingInstrument,
  writeFollowedTradingInstruments,
} from "@/lib/trading/followedInstruments";

export type FollowedTradingInstrumentContext = {
  currentState?: string | null;
  executionStatus?: string | null;
  direction?: string | null;
  triggerLevel?: number | null;
  invalidationLevel?: number | null;
  targetZone?: string | null;
  riskPct?: number | null;
  headline?: string | null;
};

function instrumentsFromPayload(payload: any) {
  return Array.isArray(payload?.instruments)
    ? payload.instruments.map((instrument: unknown) => String(instrument))
    : [];
}

async function syncFollowedInstrumentsFromServer(signal?: AbortSignal) {
  const response = await fetch("/api/trading/followed-instruments?mode=trading", {
    cache: "no-store",
    signal,
  });

  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error("followed_instruments_sync_failed");

  const payload = await response.json();
  if (payload?.ok !== true) return null;
  return writeFollowedTradingInstruments(instrumentsFromPayload(payload));
}

async function persistFollowedInstrumentAction(args: {
  action: "follow" | "unfollow" | "close";
  instrument: string;
  context?: FollowedTradingInstrumentContext;
  reason?: string | null;
}) {
  const response = await fetch("/api/trading/followed-instruments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "trading",
      action: args.action,
      instrument: args.instrument,
      context: args.context ?? {},
      reason: args.reason ?? null,
    }),
  });

  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error("followed_instruments_persist_failed");

  const payload = await response.json();
  if (payload?.ok !== true) return null;
  return writeFollowedTradingInstruments(instrumentsFromPayload(payload));
}

export function useFollowedTradingInstruments() {
  const instruments = useSyncExternalStore(
    subscribeFollowedTradingInstruments,
    readFollowedTradingInstruments,
    () => [],
  );

  useEffect(() => {
    const controller = new AbortController();
    void syncFollowedInstrumentsFromServer(controller.signal).catch(() => {
      // Local follow state remains usable if the account/API is unavailable.
    });
    return () => controller.abort();
  }, []);

  const toggle = useCallback(
    async (instrument: string, context?: FollowedTradingInstrumentContext) => {
      const wasFollowed = isTradingInstrumentFollowed(instrument, instruments);
      const optimistic = toggleFollowedTradingInstrument(instrument);

      try {
        await persistFollowedInstrumentAction({
          action: wasFollowed ? "unfollow" : "follow",
          instrument,
          context,
        });
      } catch {
        writeFollowedTradingInstruments(instruments);
      }

      return optimistic;
    },
    [instruments],
  );

  const close = useCallback(
    async (instrument: string, reason?: string | null) => {
      const previous = instruments;
      writeFollowedTradingInstruments(
        instruments.filter((item) => item.toUpperCase() !== instrument.toUpperCase()),
      );

      try {
        await persistFollowedInstrumentAction({
          action: "close",
          instrument,
          reason,
        });
      } catch {
        writeFollowedTradingInstruments(previous);
      }
    },
    [instruments],
  );

  return {
    instruments,
    toggle,
    close,
    isFollowed: useCallback(
      (instrument: string) => isTradingInstrumentFollowed(instrument, instruments),
      [instruments],
    ),
  };
}
