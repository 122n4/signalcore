// lib/alerts/clientStore.ts
"use client";

type AlertsSnapshot = {
  planActive?: boolean;
  brokerConnected?: boolean;
  lastSyncAt?: string | null;
};

const KEY = "signalcore_alerts_snapshot_v1";

function safeParse<T>(s: string | null, fallback: T): T {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}

function readSnapshot(): AlertsSnapshot {
  if (typeof window === "undefined") return {};
  return safeParse<AlertsSnapshot>(localStorage.getItem(KEY), {});
}

function writeSnapshot(next: AlertsSnapshot) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(next ?? {}));
}

export const alertsStore = {
  getSnapshot(): AlertsSnapshot {
    return readSnapshot();
  },

  setSnapshot(next: AlertsSnapshot) {
    writeSnapshot(next);
  },

  patchSnapshot(patch: Partial<AlertsSnapshot>) {
    const cur = readSnapshot();
    writeSnapshot({ ...cur, ...patch });
  },
};