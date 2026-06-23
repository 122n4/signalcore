"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

import {
  isTradingInstrumentFollowed,
  readFollowedTradingInstruments,
  subscribeFollowedTradingInstruments,
  toggleFollowedTradingInstrument,
  writeFollowedTradingInstruments,
} from "@/lib/trading/followedInstruments";

const FOLLOWED_TRADING_POSITIONS_KEY = "syntrake:trading:followed-position-snapshots";
const FOLLOWED_TRADING_POSITIONS_EVENT = "syntrake:trading:followed-position-snapshots-changed";
const EMPTY_POSITIONS: FollowedTradingPosition[] = [];
let followedTradingPositionsRaw: string | null = null;
let followedTradingPositionsSnapshot: FollowedTradingPosition[] = EMPTY_POSITIONS;

export type FollowedTradingInstrumentContext = {
  currentState?: string | null;
  executionStatus?: string | null;
  direction?: string | null;
  triggerLevel?: number | null;
  invalidationLevel?: number | null;
  targetZone?: string | null;
  riskPct?: number | null;
  headline?: string | null;
  planState?: string | null;
  planIntent?: string | null;
  recommendation?: string | null;
  traderAction?: string | null;
  clarityScore?: number | null;
  hasValidTrigger?: boolean | null;
};

export type FollowedTradingLifecycleStatus =
  | "watching"
  | "entry_confirmed"
  | "active"
  | "close_review"
  | "closed"
  | "removed";

export type FollowedTradingPosition = {
  id?: string | null;
  instrument: string;
  status: "open" | "closed" | "removed" | string;
  lifecycleStatus: FollowedTradingLifecycleStatus;
  direction?: string | null;
  triggerLevel?: number | null;
  invalidationLevel?: number | null;
  targetZone?: string | null;
  riskPct?: number | null;
  entryConfirmedAt?: string | null;
  entryPrice?: number | null;
  exitPrice?: number | null;
  resultR?: number | null;
  closeReason?: string | null;
  lastState?: string | null;
  lastExecutionStatus?: string | null;
  lastHeadline?: string | null;
  openedAt?: string | null;
  closedAt?: string | null;
  updatedAt?: string | null;
};

function instrumentsFromPayload(payload: any) {
  return Array.isArray(payload?.instruments)
    ? payload.instruments.map((instrument: unknown) => String(instrument))
    : [];
}

function normalizeInstrument(value: unknown) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9._:-]/g, "")
    .slice(0, 32);
}

function normalizePosition(value: any): FollowedTradingPosition | null {
  const instrument = normalizeInstrument(value?.instrument);
  if (!instrument) return null;

  return {
    id: value?.id == null ? null : String(value.id),
    instrument,
    status: String(value?.status || "open"),
    lifecycleStatus: String(value?.lifecycleStatus || "watching") as FollowedTradingLifecycleStatus,
    direction: value?.direction ?? null,
    triggerLevel: value?.triggerLevel == null ? null : Number(value.triggerLevel),
    invalidationLevel: value?.invalidationLevel == null ? null : Number(value.invalidationLevel),
    targetZone: value?.targetZone ?? null,
    riskPct: value?.riskPct == null ? null : Number(value.riskPct),
    entryConfirmedAt: value?.entryConfirmedAt ?? null,
    entryPrice: value?.entryPrice == null ? null : Number(value.entryPrice),
    exitPrice: value?.exitPrice == null ? null : Number(value.exitPrice),
    resultR: value?.resultR == null ? null : Number(value.resultR),
    closeReason: value?.closeReason ?? null,
    lastState: value?.lastState ?? null,
    lastExecutionStatus: value?.lastExecutionStatus ?? null,
    lastHeadline: value?.lastHeadline ?? null,
    openedAt: value?.openedAt ?? null,
    closedAt: value?.closedAt ?? null,
    updatedAt: value?.updatedAt ?? null,
  };
}

function readFollowedTradingPositions() {
  if (typeof window === "undefined") return EMPTY_POSITIONS;
  const raw = window.localStorage.getItem(FOLLOWED_TRADING_POSITIONS_KEY);
  if (raw === followedTradingPositionsRaw) return followedTradingPositionsSnapshot;

  followedTradingPositionsRaw = raw;
  if (!raw) {
    followedTradingPositionsSnapshot = EMPTY_POSITIONS;
    return followedTradingPositionsSnapshot;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      followedTradingPositionsSnapshot = EMPTY_POSITIONS;
      return followedTradingPositionsSnapshot;
    }
    followedTradingPositionsSnapshot = parsed
      .map(normalizePosition)
      .filter(Boolean) as FollowedTradingPosition[];
    return followedTradingPositionsSnapshot;
  } catch {
    followedTradingPositionsSnapshot = EMPTY_POSITIONS;
    return followedTradingPositionsSnapshot;
  }
}

function writeFollowedTradingPositions(values: FollowedTradingPosition[]) {
  if (typeof window === "undefined") return EMPTY_POSITIONS;
  const normalized = values.map(normalizePosition).filter(Boolean) as FollowedTradingPosition[];
  const raw = JSON.stringify(normalized);
  followedTradingPositionsRaw = raw;
  followedTradingPositionsSnapshot = normalized;
  window.localStorage.setItem(FOLLOWED_TRADING_POSITIONS_KEY, raw);
  window.dispatchEvent(
    new CustomEvent(FOLLOWED_TRADING_POSITIONS_EVENT, {
      detail: { positions: normalized },
    }),
  );
  return normalized;
}

function subscribeFollowedTradingPositions(callback: () => void) {
  if (typeof window === "undefined") return () => {};

  window.addEventListener(FOLLOWED_TRADING_POSITIONS_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(FOLLOWED_TRADING_POSITIONS_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function positionsFromPayload(payload: any) {
  return Array.isArray(payload?.positions)
    ? (payload.positions.map(normalizePosition).filter(Boolean) as FollowedTradingPosition[])
    : EMPTY_POSITIONS;
}

function writePayloadFollowState(payload: any) {
  const instruments = writeFollowedTradingInstruments(instrumentsFromPayload(payload));
  const positions = writeFollowedTradingPositions(positionsFromPayload(payload));
  return { instruments, positions };
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
  return writePayloadFollowState(payload);
}

async function persistFollowedInstrumentAction(args: {
  action: "follow" | "unfollow" | "confirm_entry" | "close";
  instrument: string;
  context?: FollowedTradingInstrumentContext;
  reason?: string | null;
  entryPrice?: number | null;
  exitPrice?: number | null;
  resultR?: number | null;
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
      entryPrice: args.entryPrice ?? null,
      exitPrice: args.exitPrice ?? null,
      resultR: args.resultR ?? null,
    }),
  });

  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error("followed_instruments_persist_failed");

  const payload = await response.json();
  if (payload?.ok !== true) return null;
  return writePayloadFollowState(payload);
}

export function useFollowedTradingInstruments() {
  const instruments = useSyncExternalStore(
    subscribeFollowedTradingInstruments,
    readFollowedTradingInstruments,
    () => [],
  );
  const positions = useSyncExternalStore(
    subscribeFollowedTradingPositions,
    readFollowedTradingPositions,
    () => EMPTY_POSITIONS,
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
      const normalizedInstrument = normalizeInstrument(instrument);
      const previousPositions = positions;
      const optimisticPositions = wasFollowed
        ? positions.filter((position) => position.instrument !== normalizedInstrument)
        : writeFollowedTradingPositions([
            {
              instrument: normalizedInstrument,
              status: "open",
              lifecycleStatus: "watching",
              direction: context?.direction ?? null,
              triggerLevel: context?.triggerLevel ?? null,
              invalidationLevel: context?.invalidationLevel ?? null,
              targetZone: context?.targetZone ?? null,
              riskPct: context?.riskPct ?? null,
              lastState: context?.currentState ?? null,
              lastExecutionStatus: context?.executionStatus ?? null,
              lastHeadline: context?.headline ?? null,
              updatedAt: new Date().toISOString(),
            },
            ...positions.filter((position) => position.instrument !== normalizedInstrument),
          ]);

      if (wasFollowed) {
        writeFollowedTradingPositions(optimisticPositions as FollowedTradingPosition[]);
      }

      try {
        await persistFollowedInstrumentAction({
          action: wasFollowed ? "unfollow" : "follow",
          instrument,
          context,
        });
      } catch {
        writeFollowedTradingInstruments(instruments);
        writeFollowedTradingPositions(previousPositions);
      }

      return optimistic;
    },
    [instruments, positions],
  );

  const confirmEntry = useCallback(
    async (
      instrument: string,
      context?: FollowedTradingInstrumentContext & { entryPrice?: number | null },
    ) => {
      const normalizedInstrument = normalizeInstrument(instrument);
      const previous = positions;
      writeFollowedTradingPositions(
        positions.map((position) =>
          position.instrument === normalizedInstrument
            ? {
                ...position,
                lifecycleStatus: "active",
                entryConfirmedAt: new Date().toISOString(),
                entryPrice: context?.entryPrice ?? position.entryPrice ?? null,
                updatedAt: new Date().toISOString(),
              }
            : position,
        ),
      );

      try {
        await persistFollowedInstrumentAction({
          action: "confirm_entry",
          instrument,
          context,
          entryPrice: context?.entryPrice ?? null,
        });
      } catch {
        writeFollowedTradingPositions(previous);
      }
    },
    [positions],
  );

  const close = useCallback(
    async (instrument: string, reason?: string | null) => {
      const previous = instruments;
      const previousPositions = positions;
      writeFollowedTradingInstruments(
        instruments.filter((item) => item.toUpperCase() !== instrument.toUpperCase()),
      );
      writeFollowedTradingPositions(
        positions.filter((position) => position.instrument !== normalizeInstrument(instrument)),
      );

      try {
        await persistFollowedInstrumentAction({
          action: "close",
          instrument,
          reason,
        });
      } catch {
        writeFollowedTradingInstruments(previous);
        writeFollowedTradingPositions(previousPositions);
      }
    },
    [instruments, positions],
  );

  return {
    instruments,
    positions,
    toggle,
    confirmEntry,
    close,
    getPosition: useCallback(
      (instrument: string) => {
        const normalized = normalizeInstrument(instrument);
        return positions.find((position) => position.instrument === normalized) ?? null;
      },
      [positions],
    ),
    isFollowed: useCallback(
      (instrument: string) => isTradingInstrumentFollowed(instrument, instruments),
      [instruments],
    ),
  };
}
