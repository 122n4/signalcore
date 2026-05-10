"use client";

import React, { useEffect, useMemo, useState } from "react";
import { track } from "@/lib/analytics/client";
import { usePaid } from "@/lib/signalcore/usePaid";
import {
  allowedConnectionMethodsForBroker,
  brokerLabel,
  isConnectionMethodSupportedForBroker,
  isBrokerManualOnly,
  manualOnlyBrokerReason,
  hasConnectionEvidence as hasConnectionEvidenceShared,
  serverReferencePlaceholder,
  type BrokerConnectionMethod,
} from "@/lib/broker/shared";

type BrokerId =
  | "interactive_brokers"
  | "degiro"
  | "etoro"
  | "manual_api";
type ConnectionMethod = BrokerConnectionMethod;

type BrokerPrefs = {
  connected: boolean;
  broker: BrokerId;
  accountLabel: string;
  connectionMethod: ConnectionMethod;
  connectionReference: string;
  csvImported: boolean;
  autoSync: boolean;
  syncEveryMinutes: number;
  importExecutions: boolean;
  readOnly: boolean;
  lastSyncAt: string | null;
};

const STORAGE_KEY = "sc_broker_connection_v1";
const HANDS_FREE_FIXNOW_KEY = "sc_hands_free_fixnow_v1";

type BrokerApiStatus = {
  ok?: boolean;
  status?: "disconnected" | "connected" | "active" | "error";
  broker?: string;
  provider?: string;
  accountLabel?: string | null;
  connectionMethod?: ConnectionMethod;
  connectionReferenceMasked?: string;
  connected?: boolean;
  autoSync?: boolean;
  syncEveryMinutes?: number;
  importExecutions?: boolean;
  readOnly?: boolean;
  lastSyncAt?: string | null;
  lastSyncStatus?: "idle" | "ok" | "error";
  lastError?: string | null;
  lastReconcileAt?: string | null;
  lastReconcileStatus?: "idle" | "aligned" | "warning" | "critical" | "missing_snapshot";
  lastReconcileScore?: number | null;
  lastReconcileMismatchCount?: number;
  proofValid?: boolean;
  message?: string | null;
  sync?: {
    positions?: number;
    inserted?: number;
    updated?: number;
    deleted?: number;
    cashEur?: number;
    totalEur?: number;
    source?: string;
  };
};

const BROKERS: Array<{ id: BrokerId; label: string; markets: string }> = [
  { id: "interactive_brokers", label: "Interactive Brokers", markets: "Stocks, ETFs, options" },
  { id: "degiro", label: "DEGIRO", markets: "Stocks, ETFs" },
  { id: "etoro", label: "eToro", markets: "Stocks, ETFs" },
  { id: "manual_api", label: "Manual API / CSV", markets: "Any investing broker with exports" },
];

type BrokerCapability = {
  id: BrokerId;
  automation: "auto_supported" | "manual_only";
  signalcoreMode: "API/OAuth/CSV" | "CSV only";
  source: string | null;
  verifiedAt: string;
  note: string;
  setup: string[];
};

const BROKER_CAPABILITIES: Record<BrokerId, BrokerCapability> = {
  interactive_brokers: {
    id: "interactive_brokers",
    automation: "auto_supported",
    signalcoreMode: "API/OAuth/CSV",
    source: "https://www.interactivebrokers.com/campus/ibkr-api-page/twsapi-doc/",
    verifiedAt: "2026-02-20",
    note: "IBKR provides official API connectivity (TWS/Gateway).",
    setup: [
      "Create API credentials in your IBKR environment.",
      "Select API or OAuth in Syntrake Broker setup.",
      "Paste connection reference and connect broker.",
      "Run Sync now and verify positions before daily execution.",
    ],
  },
  degiro: {
    id: "degiro",
    automation: "manual_only",
    signalcoreMode: "CSV only",
    source: "https://www.degiro.ie/helpdesk",
    verifiedAt: "2026-02-20",
    note: "DEGIRO states external application connection/API is not available.",
    setup: [
      "Export positions/transactions CSV from DEGIRO.",
      "Select CSV method in Syntrake and set CSV filename reference.",
      "Enable 'I imported CSV' and connect.",
      "Execute using manual checklist and confirm proof in Daily.",
    ],
  },
  etoro: {
    id: "etoro",
    automation: "manual_only",
    signalcoreMode: "CSV only",
    source: "https://api-portal.etoro.com/",
    verifiedAt: "2026-05-08",
    note: "eToro now offers a public API, but Syntrake still runs eToro in manual/CSV mode until a direct integration is wired.",
    setup: [
      "Export positions/account history from eToro.",
      "Select CSV method in Syntrake and set CSV filename reference.",
      "Enable 'I imported CSV' and connect.",
      "Execute in eToro manually using the Syntrake checklist, then confirm proof.",
    ],
  },
  manual_api: {
    id: "manual_api",
    automation: "auto_supported",
    signalcoreMode: "API/OAuth/CSV",
    source: null,
    verifiedAt: "2026-02-20",
    note: "Use this mode for custom bridges or CSV workflows when no direct integration exists.",
    setup: [
      "If your broker has API/OAuth bridge, use API or OAuth method.",
      "If no bridge exists, use CSV filename reference and mark CSV imported.",
      "Connect and run sync/reconcile checks.",
      "When in manual mode, confirm checklist proof before closing the day.",
    ],
  },
};

const UNIVERSAL_MANUAL_EXECUTION_STEPS: string[] = [
  "Open Syntrake Daily and generate the checklist for the current session.",
  "Open your broker ticket and match each row side (BUY/SELL), symbol, and size.",
  "Use Delta EUR/target quantity as mandatory sizing reference on every order.",
  "Apply stop-loss/risk controls before confirming each order when supported.",
  "After fills, return to Daily, mark rows done, refresh, and only then close the day.",
];

const DEFAULT_PREFS: BrokerPrefs = {
  connected: false,
  broker: "interactive_brokers",
  accountLabel: "",
  connectionMethod: "none",
  connectionReference: "",
  csvImported: false,
  autoSync: true,
  syncEveryMinutes: 15,
  importExecutions: true,
  readOnly: true,
  lastSyncAt: null,
};

function asConnectionMethod(v: unknown): ConnectionMethod {
  const x = String(v || "").toLowerCase().trim();
  if (x === "api" || x === "oauth" || x === "csv" || x === "none") return x;
  return "none";
}

function normalizeBrokerId(v: unknown): BrokerId {
  const x = String(v || "").toLowerCase().trim();
  if (
    x === "interactive_brokers" ||
    x === "degiro" ||
    x === "etoro" ||
    x === "manual_api"
  ) {
    return x;
  }
  return "interactive_brokers";
}

function hasConnectionEvidence(prefs: BrokerPrefs) {
  return hasConnectionEvidenceShared({
    connectionMethod: prefs.connectionMethod,
    connectionReference: prefs.connectionReference,
    csvImported: prefs.csvImported,
  });
}

function normalizePrefs(raw?: Partial<BrokerPrefs> | null, opts?: { allowConnectedWithoutProof?: boolean }): BrokerPrefs {
  const merged = { ...DEFAULT_PREFS, ...(raw || {}) } as BrokerPrefs;
  const next: BrokerPrefs = {
    ...merged,
    connected: Boolean(merged.connected),
    broker: normalizeBrokerId(merged.broker || DEFAULT_PREFS.broker),
    accountLabel: String(merged.accountLabel || ""),
    connectionMethod: asConnectionMethod((raw as any)?.connectionMethod ?? merged.connectionMethod),
    connectionReference: String((raw as any)?.connectionReference ?? merged.connectionReference ?? "").trim(),
    csvImported: Boolean((raw as any)?.csvImported ?? merged.csvImported),
    autoSync: Boolean(merged.autoSync),
    syncEveryMinutes: Math.max(5, Number(merged.syncEveryMinutes || 15)),
    importExecutions: merged.importExecutions !== false,
    readOnly: merged.readOnly !== false,
    lastSyncAt: merged.lastSyncAt ? String(merged.lastSyncAt) : null,
  };

  if (!isConnectionMethodSupportedForBroker(next.broker, next.connectionMethod)) {
    next.connectionMethod = "none";
    next.connectionReference = "";
    next.csvImported = false;
    next.connected = false;
  }
  if (isBrokerManualOnly(next.broker)) {
    next.readOnly = true;
    next.autoSync = false;
  }

  if (!hasConnectionEvidence(next) && !opts?.allowConnectedWithoutProof) next.connected = false;
  return next;
}

function fmtTime(v: string | null) {
  if (!v) return "never";
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return "never";
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min} UTC`;
}

function fmtEUR(v: number) {
  const n = Math.round(Number.isFinite(v) ? v : 0);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const grouped = String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}${grouped} EUR`;
}

async function fetchJSON(url: string, opts?: RequestInit) {
  const res = await fetch(url, {
    ...opts,
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...(opts?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false as const, status: res.status, data };
  return { ok: true as const, status: res.status, data };
}

function mergeServerStatus(local: BrokerPrefs, status: BrokerApiStatus | null): BrokerPrefs {
  if (!status || typeof status !== "object") return local;
  const next: BrokerPrefs = { ...local };

  if (status.broker || status.provider) next.broker = normalizeBrokerId(status.broker || status.provider);
  if (status.accountLabel != null) next.accountLabel = String(status.accountLabel);
  if (status.connectionMethod) next.connectionMethod = asConnectionMethod(status.connectionMethod);
  if (typeof status.autoSync === "boolean") next.autoSync = status.autoSync;
  if (typeof status.syncEveryMinutes === "number") next.syncEveryMinutes = Math.max(5, Number(status.syncEveryMinutes || 15));
  if (typeof status.importExecutions === "boolean") next.importExecutions = status.importExecutions;
  if (typeof status.readOnly === "boolean") next.readOnly = status.readOnly;
  if (status.lastSyncAt != null) next.lastSyncAt = status.lastSyncAt;

  const serverConnected = Boolean(status.connected);
  if (serverConnected) {
    const proofNow = hasConnectionEvidence(next);
    if (!proofNow) {
      next.connectionReference = serverReferencePlaceholder(next.connectionMethod);
      if (next.connectionMethod === "csv") next.csvImported = true;
    }
  }
  next.connected = serverConnected;
  return normalizePrefs(next, { allowConnectedWithoutProof: serverConnected });
}

export default function BrokerPageClient() {
  const { isPaid } = usePaid();
  const [prefs, setPrefs] = useState<BrokerPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [serverStatus, setServerStatus] = useState<BrokerApiStatus | null>(null);
  const [reconcileSummary, setReconcileSummary] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      let next: BrokerPrefs = { ...DEFAULT_PREFS };

      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<BrokerPrefs>;
          next = normalizePrefs({ ...next, ...parsed });
        }
      } catch {
        // ignore local parsing failures
      }

      try {
        const statusResp = await fetchJSON("/api/broker/status", { method: "GET" });
        if (statusResp.ok) {
          const merged = mergeServerStatus(next, statusResp.data as BrokerApiStatus);
          next = merged;
          if (!alive) return;
          setServerStatus(statusResp.data as BrokerApiStatus);
        }
      } catch {
        // non-blocking
      }

      if (!alive) return;
      setPrefs(next);
      setLoading(false);
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  function saveLocal(next: BrokerPrefs) {
    const normalized = normalizePrefs(next, { allowConnectedWithoutProof: Boolean(next.connected) });
    setPrefs(normalized);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // non-blocking
    }
  }

  function patchPrefs(patch: Partial<BrokerPrefs>) {
    saveLocal({ ...prefs, ...patch });
  }

  async function handleConnect() {
    if (saving) return;
    setSaving(true);
    setNotice(null);
    setReconcileSummary(null);
    if (!isConnectionMethodSupportedForBroker(prefs.broker, prefs.connectionMethod) || prefs.connectionMethod === "none") {
      setNotice(
        isBrokerManualOnly(prefs.broker)
          ? `${brokerLabel(prefs.broker)} is manual-only: choose CSV import mode.`
          : "Choose a supported connection method for this broker."
      );
      setSaving(false);
      return;
    }
    if (!hasConnectionEvidence(prefs)) {
      setNotice(
        isBrokerManualOnly(prefs.broker)
          ? `${brokerLabel(prefs.broker)} proof invalid. Use CSV filename (\`.csv\`/\`.tsv\`) and check CSV imported.`
          : "Broker proof invalid. Use API token (`api_...`/`key_...`), OAuth token (`oauth_...`), or CSV filename (`.csv`) with CSV imported checked."
      );
      setSaving(false);
      return;
    }
    const r = await fetchJSON("/api/broker/connect", {
      method: "POST",
      body: JSON.stringify({
        broker: prefs.broker,
        accountLabel: prefs.accountLabel,
        connectionMethod: prefs.connectionMethod,
        connectionReference: prefs.connectionReference,
        csvImported: prefs.csvImported,
        autoSync: prefs.autoSync,
        syncEveryMinutes: prefs.syncEveryMinutes,
        importExecutions: prefs.importExecutions,
        readOnly: prefs.readOnly,
      }),
    });

    if (!r.ok) {
      setNotice(String((r.data as any)?.message || (r.data as any)?.error || "Connect failed."));
      setSaving(false);
      return;
    }

    const merged = mergeServerStatus(
      { ...prefs, connected: true, lastSyncAt: new Date().toISOString() },
      r.data as BrokerApiStatus
    );
    saveLocal(merged);
    setServerStatus(r.data as BrokerApiStatus);

    track("broker_connect", {
      broker: merged.broker,
      syncEveryMinutes: merged.syncEveryMinutes,
      autoSync: merged.autoSync,
      importExecutions: merged.importExecutions,
      readOnly: merged.readOnly,
    });
    setNotice("Broker connected successfully.");
    setSaving(false);
  }

  async function handleDisconnect() {
    if (saving) return;
    setSaving(true);
    setNotice(null);
    setReconcileSummary(null);

    const r = await fetchJSON("/api/broker/disconnect", { method: "POST", body: JSON.stringify({}) });
    if (!r.ok) {
      setNotice(String((r.data as any)?.error || "Disconnect failed."));
      setSaving(false);
      return;
    }

    const merged = mergeServerStatus({ ...prefs, connected: false }, r.data as BrokerApiStatus);
    saveLocal(merged);
    setServerStatus(r.data as BrokerApiStatus);
    track("broker_disconnect", { broker: merged.broker });
    setNotice("Broker disconnected. You can still use Syntrake offline.");
    setSaving(false);
  }

  async function handleSyncNow() {
    if (!prefs.connected || syncing) return;
    setSyncing(true);
    setNotice(null);
    setReconcileSummary(null);

    const r = await fetchJSON("/api/broker/sync", {
      method: "POST",
      body: JSON.stringify({}),
    });
    if (!r.ok) {
      const msg = String((r.data as any)?.error || (r.data as any)?.message || "Sync failed.");
      setNotice(msg);
      if ((r.data as any)?.connected === false) {
        const mergedFail = mergeServerStatus({ ...prefs, connected: false }, r.data as BrokerApiStatus);
        saveLocal(mergedFail);
      }
      setServerStatus((r.data as BrokerApiStatus) || null);
      setSyncing(false);
      return;
    }

    const merged = mergeServerStatus(prefs, r.data as BrokerApiStatus);
    saveLocal(merged);
    setServerStatus(r.data as BrokerApiStatus);
    track("broker_sync_now", {
      broker: merged.broker,
      importExecutions: merged.importExecutions,
    });

    const sync = (r.data as any)?.sync || {};
    const positions = Number(sync?.positions || 0);
    const total = Number(sync?.totalEur || NaN);
    if (Number.isFinite(total) && total > 0) {
      setNotice(`Sync completed: ${positions} positions, total ${fmtEUR(total)}.`);
    } else {
      setNotice(`Sync completed: ${positions} positions.`);
    }
    setSyncing(false);
  }

  async function handleReconcile() {
    if (!prefs.connected || reconciling) return;
    setReconciling(true);
    setNotice(null);
    const r = await fetchJSON("/api/broker/reconcile", {
      method: "POST",
      body: JSON.stringify({ refresh: false }),
    });
    if (!r.ok) {
      setNotice(String((r.data as any)?.error || "Reconcile failed."));
      setReconciling(false);
      return;
    }
    const rec = (r.data as any)?.reconcile;
    if (rec?.ok) {
      setReconcileSummary(`Reconcile score ${Math.round(Number(rec.score || 0))}/100 (${String(rec.status || "unknown")}).`);
    } else {
      setReconcileSummary("Reconcile did not run. Sync first.");
    }
    setReconciling(false);
  }

  async function enableProAutonomy() {
    if (saving) return;
    if (!isPaid) {
      setNotice("Autonomy profile is available for Pro users.");
      return;
    }

    setSaving(true);
    setNotice(null);
    setReconcileSummary(null);

    if (isBrokerManualOnly(prefs.broker)) {
      saveLocal({
        ...prefs,
        connected: false,
        autoSync: false,
        readOnly: true,
        connectionMethod: prefs.connectionMethod === "csv" ? "csv" : "none",
      });
      track("broker_autonomy_profile_manual_only", { broker: prefs.broker });
      setNotice(`${brokerLabel(prefs.broker)} uses manual CSV mode only. Automated autonomy is not available.`);
      setSaving(false);
      return;
    }

    const tuned: BrokerPrefs = {
      ...prefs,
      autoSync: true,
      syncEveryMinutes: 5,
      importExecutions: true,
      readOnly: true,
      connected: false,
      lastSyncAt: prefs.lastSyncAt,
    };

    if (!hasConnectionEvidence(tuned)) {
      saveLocal(tuned);
      track("broker_autonomy_profile_pending_connection", {
        broker: tuned.broker,
      });
      setNotice("Pro autonomy configured. Add API/OAuth/CSV reference, then connect broker.");
      setSaving(false);
      return;
    }

    const connectResp = await fetchJSON("/api/broker/connect", {
      method: "POST",
      body: JSON.stringify({
        broker: tuned.broker,
        accountLabel: tuned.accountLabel,
        connectionMethod: tuned.connectionMethod,
        connectionReference: tuned.connectionReference,
        csvImported: tuned.csvImported,
        autoSync: tuned.autoSync,
        syncEveryMinutes: tuned.syncEveryMinutes,
        importExecutions: tuned.importExecutions,
        readOnly: tuned.readOnly,
      }),
    });
    if (!connectResp.ok) {
      setNotice(String((connectResp.data as any)?.error || (connectResp.data as any)?.message || "Could not enable autonomy."));
      setSaving(false);
      return;
    }

    const next = mergeServerStatus(
      {
        ...tuned,
        connected: true,
        lastSyncAt: new Date().toISOString(),
      },
      connectResp.data as BrokerApiStatus
    );

    saveLocal(next);
    setServerStatus(connectResp.data as BrokerApiStatus);

    try {
      window.localStorage.setItem(HANDS_FREE_FIXNOW_KEY, "1");
    } catch {
      // non-blocking
    }

    track("broker_autonomy_profile_applied", {
      broker: next.broker,
      syncEveryMinutes: next.syncEveryMinutes,
      readOnly: next.readOnly,
    });
    setNotice("Pro autonomy enabled: broker linked, auto-sync every 5m, hands-free fixes ON.");
    setSaving(false);
  }

  const selectedBrokerName = useMemo(
    () => BROKERS.find((x) => x.id === prefs.broker)?.label ?? "Broker",
    [prefs.broker]
  );
  const allowedMethods = useMemo(() => allowedConnectionMethodsForBroker(prefs.broker), [prefs.broker]);
  const connectionMethodSupported = isConnectionMethodSupportedForBroker(prefs.broker, prefs.connectionMethod);
  const brokerManualOnly = isBrokerManualOnly(prefs.broker);
  const selectedCapability = BROKER_CAPABILITIES[prefs.broker];
  const connectionReady = connectionMethodSupported && hasConnectionEvidence(prefs);
  const syncHealth = serverStatus?.lastSyncStatus || "idle";
  const syncSource = (serverStatus?.sync?.source as string | undefined) || null;
  const reconcileStatus = String(serverStatus?.lastReconcileStatus || "idle").toLowerCase();
  const reconcileTone =
    reconcileStatus === "critical" ? "bad" : reconcileStatus === "warning" ? "warn" : reconcileStatus === "aligned" ? "good" : "neutral";

  const connectionRefPlaceholder =
    prefs.connectionMethod === "api"
      ? "api_xxxxxxxxxxxx or key_xxxxxxxxxxxx"
      : prefs.connectionMethod === "oauth"
        ? "oauth_xxxxxxxx token"
        : prefs.connectionMethod === "csv"
          ? "portfolio.csv"
          : "Select connection method first";

  if (loading) {
    return <div className="p-6 text-sm text-zinc-500">Loading broker setup...</div>;
  }

  return (
    <div className="mx-auto w-full max-w-5xl p-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-sm text-zinc-500">Broker</div>
        <span
          className={
            prefs.connected
              ? "inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700"
              : "inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700"
          }
        >
          {prefs.connected ? `Connected: ${selectedBrokerName}` : "Not connected"}
        </span>
        <span
          className={
            isPaid
              ? "inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700"
              : "inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700"
          }
        >
          {isPaid ? "Pro detected" : "Free"}
        </span>
        <span
          className={
            connectionReady
              ? "inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700"
              : "inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800"
          }
        >
          {connectionReady ? "Connection proof ready" : brokerManualOnly ? "Missing CSV proof" : "Missing API/OAuth/CSV proof"}
        </span>
      </div>

      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">
        Direct Broker Connection
      </h1>
      <p className="mt-2 max-w-3xl text-sm text-zinc-600">
        Connect once and keep it linked. Syntrake syncs your holdings and executed orders so your
        daily directive can run on real portfolio data.
      </p>

      {brokerManualOnly ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {manualOnlyBrokerReason(prefs.broker)}
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold text-zinc-900">Connection settings</div>
          <div className="mt-4 space-y-4">
            <label className="block">
              <div className="mb-1 text-xs font-medium text-zinc-600">Broker</div>
              <select
                value={prefs.broker}
                onChange={(e) => {
                  const nextBroker = e.target.value as BrokerId;
                  const supportedMethods = allowedConnectionMethodsForBroker(nextBroker);
                  const keepMethod =
                    prefs.connectionMethod !== "none" && supportedMethods.includes(prefs.connectionMethod)
                      ? prefs.connectionMethod
                      : "none";

                  patchPrefs({
                    broker: nextBroker,
                    connectionMethod: keepMethod,
                    connectionReference: keepMethod === prefs.connectionMethod ? prefs.connectionReference : "",
                    csvImported: keepMethod === "csv" ? prefs.csvImported : false,
                    connected: false,
                    autoSync: isBrokerManualOnly(nextBroker) ? false : prefs.autoSync,
                    readOnly: isBrokerManualOnly(nextBroker) ? true : prefs.readOnly,
                  });
                }}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900"
              >
                {BROKERS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-xs text-zinc-500">
                {BROKERS.find((x) => x.id === prefs.broker)?.markets}
              </div>
            </label>

            <label className="block">
              <div className="mb-1 text-xs font-medium text-zinc-600">
                Account label (optional)
              </div>
              <input
                type="text"
                value={prefs.accountLabel}
                onChange={(e) => patchPrefs({ accountLabel: e.target.value })}
                placeholder="Main portfolio"
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
              />
            </label>

            <label className="block">
              <div className="mb-1 text-xs font-medium text-zinc-600">Connection method (required)</div>
              <select
                value={prefs.connectionMethod}
                onChange={(e) => {
                  const nextMethod = e.target.value as ConnectionMethod;
                  patchPrefs({
                    connectionMethod: nextMethod,
                    connectionReference: nextMethod === prefs.connectionMethod ? prefs.connectionReference : "",
                    csvImported: nextMethod === "csv" ? prefs.csvImported : false,
                    connected: false,
                  });
                }}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900"
              >
                <option value="none">Select method...</option>
                {allowedMethods.includes("api") ? <option value="api">API key</option> : null}
                {allowedMethods.includes("oauth") ? <option value="oauth">OAuth login</option> : null}
                {allowedMethods.includes("csv") ? <option value="csv">CSV import</option> : null}
              </select>
            </label>

            <label className="block">
              <div className="mb-1 text-xs font-medium text-zinc-600">Connection reference (required)</div>
              <input
                type="text"
                value={prefs.connectionReference}
                onChange={(e) => patchPrefs({ connectionReference: e.target.value })}
                placeholder={connectionRefPlaceholder}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
              />
              <div className="mt-1 text-xs text-zinc-500">
                {brokerManualOnly
                  ? `${brokerLabel(prefs.broker)} requires CSV mode: filename ending in \`.csv\`/\`.tsv\` and CSV imported checked.`
                  : "Required formats: API = `api_...` or `key_...`; OAuth = `oauth_...`; CSV = filename ending in `.csv` plus CSV imported checked."}
              </div>
            </label>

            {prefs.connectionMethod === "csv" ? (
              <label className="flex items-start gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={prefs.csvImported}
                  onChange={(e) => patchPrefs({ csvImported: e.target.checked })}
                  className="mt-0.5"
                />
                <span>I have already imported at least one CSV statement.</span>
              </label>
            ) : null}

            <div className="grid gap-2">
              <label className="flex items-start gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={prefs.autoSync}
                  onChange={(e) => patchPrefs({ autoSync: e.target.checked })}
                  disabled={brokerManualOnly}
                  className="mt-0.5"
                />
                <span>
                  {brokerManualOnly ? `${brokerLabel(prefs.broker)} manual mode: automatic sync is disabled.` : "Keep broker connected and sync automatically."}
                </span>
              </label>

              <label className="flex items-start gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={prefs.importExecutions}
                  onChange={(e) => patchPrefs({ importExecutions: e.target.checked })}
                  className="mt-0.5"
                />
                <span>Import filled orders into execution journal.</span>
              </label>

              <label className="flex items-start gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={prefs.readOnly}
                  onChange={(e) => patchPrefs({ readOnly: e.target.checked })}
                  disabled={brokerManualOnly}
                  className="mt-0.5"
                />
                <span>{brokerManualOnly ? `Read-only mode enforced for ${brokerLabel(prefs.broker)}.` : "Read-only mode (no automated execution)."}</span>
              </label>
            </div>

            {prefs.autoSync ? (
              <label className="block">
                <div className="mb-1 text-xs font-medium text-zinc-600">Sync frequency</div>
                <select
                  value={String(prefs.syncEveryMinutes)}
                  onChange={(e) => patchPrefs({ syncEveryMinutes: Number(e.target.value) })}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900"
                >
                  <option value="5">Every 5 minutes</option>
                  <option value="15">Every 15 minutes</option>
                  <option value="30">Every 30 minutes</option>
                  <option value="60">Every 60 minutes</option>
                </select>
              </label>
            ) : null}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {!prefs.connected ? (
              <button
                type="button"
                onClick={handleConnect}
                disabled={saving || !connectionReady}
                className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? "Connecting..." : "Connect broker"}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={saving}
                className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-60"
              >
                {saving ? "Updating..." : "Disconnect"}
              </button>
            )}

              <button
                type="button"
                onClick={handleSyncNow}
                disabled={!prefs.connected || syncing}
                className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-60"
              >
                {syncing ? "Syncing..." : "Sync now"}
              </button>
            <button
              type="button"
              onClick={handleReconcile}
              disabled={!prefs.connected || reconciling}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-60"
            >
              {reconciling ? "Reconciling..." : "Reconcile"}
            </button>
            <button
              type="button"
              onClick={enableProAutonomy}
              disabled={saving}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? "Applying..." : "Enable Pro autonomy"}
            </button>
          </div>
          {!connectionReady ? (
            <div className="mt-2 text-xs text-amber-700">
              {brokerManualOnly
                ? `To connect ${brokerLabel(prefs.broker)} here, choose CSV method and provide a CSV filename reference.`
                : "To mark broker as connected, first choose API/OAuth/CSV method and fill a connection reference."}
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-semibold text-zinc-900">Connected session</div>
            <div className="mt-3 space-y-2 text-sm text-zinc-700">
              <div>
                <span className="font-medium text-zinc-900">Status:</span>{" "}
                {prefs.connected ? "Connected" : "Disconnected"}
              </div>
              <div>
                <span className="font-medium text-zinc-900">Server sync:</span>{" "}
                {syncHealth === "ok" ? "Healthy" : syncHealth === "error" ? "Error" : "Idle"}
              </div>
              <div>
                <span className="font-medium text-zinc-900">Reconcile:</span>{" "}
                {reconcileStatus === "aligned"
                  ? "Aligned"
                  : reconcileStatus === "warning"
                    ? "Warning"
                    : reconcileStatus === "critical"
                      ? "Critical"
                      : reconcileStatus === "missing_snapshot"
                        ? "Missing snapshot"
                        : "Idle"}
                {Number.isFinite(Number(serverStatus?.lastReconcileScore)) ? ` (${Math.round(Number(serverStatus?.lastReconcileScore))}/100)` : ""}
              </div>
              <div>
                <span className="font-medium text-zinc-900">Reconcile mismatches:</span>{" "}
                {Math.max(0, Math.round(Number(serverStatus?.lastReconcileMismatchCount || 0)))}
              </div>
              <div>
                <span className="font-medium text-zinc-900">Last reconcile:</span>{" "}
                {fmtTime(serverStatus?.lastReconcileAt || null)}
              </div>
              <div>
                <span className="font-medium text-zinc-900">Broker:</span> {selectedBrokerName}
              </div>
              <div>
                <span className="font-medium text-zinc-900">Last sync:</span>{" "}
                {fmtTime(prefs.lastSyncAt)}
              </div>
              <div>
                <span className="font-medium text-zinc-900">Mode:</span>{" "}
                {prefs.readOnly ? "Read-only" : "Execution-enabled"}
              </div>
              <div>
                <span className="font-medium text-zinc-900">Connection method:</span>{" "}
                {prefs.connectionMethod === "none" ? "Not selected" : prefs.connectionMethod.toUpperCase()}
              </div>
              <div>
                <span className="font-medium text-zinc-900">Connection reference:</span>{" "}
                {serverStatus?.connectionReferenceMasked || (prefs.connectionReference ? prefs.connectionReference : "Missing")}
              </div>
              <div>
                <span className="font-medium text-zinc-900">Proof:</span>{" "}
                {connectionReady ? "Ready" : "Missing"}
              </div>
              <div>
                <span className="font-medium text-zinc-900">Sync source:</span>{" "}
                {syncSource || "-"}
              </div>
            </div>

            <div className="mt-4">
              <a
                href="/app?tab=daily"
                className="inline-flex items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900"
              >
                Go to Daily
              </a>
            </div>
          </div>

          {reconcileTone !== "neutral" ? (
            <div
              className={
                reconcileTone === "bad"
                  ? "rounded-2xl border border-rose-200 bg-rose-50 p-5 shadow-sm"
                  : reconcileTone === "warn"
                    ? "rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm"
                    : "rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm"
              }
            >
              <div className="text-sm font-semibold text-zinc-900">Reconcile monitor</div>
              <div className="mt-2 text-xs text-zinc-800">
                {reconcileTone === "bad"
                  ? "Critical mismatch between broker snapshot and Syntrake portfolio. Execute with caution until reconciled."
                  : reconcileTone === "warn"
                    ? "Some mismatch detected. Review portfolio mapping before scaling automation."
                    : "Broker and portfolio are aligned."}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleReconcile}
                  disabled={!prefs.connected || reconciling}
                  className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-900 disabled:opacity-60"
                >
                  {reconciling ? "Reconciling..." : "Run reconcile now"}
                </button>
                <button
                  type="button"
                  onClick={handleSyncNow}
                  disabled={!prefs.connected || syncing}
                  className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-900 disabled:opacity-60"
                >
                  {syncing ? "Syncing..." : "Run sync + reconcile"}
                </button>
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-semibold text-zinc-900">How this works</div>
            <ul className="mt-3 space-y-2 text-sm text-zinc-700">
              <li>- Holdings are synced and mapped to your active mode.</li>
              <li>- Syntrake updates risk leaks, drift, and daily directive.</li>
              <li>- You can disconnect anytime and continue in offline mode.</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-zinc-900">Broker compatibility matrix</div>
              <span className="inline-flex rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] font-semibold text-zinc-700">
                Reviewed on 2026-02-20
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {BROKERS.map((row) => {
                const capability = BROKER_CAPABILITIES[row.id];
                const selected = row.id === prefs.broker;
                return (
                  <div
                    key={`cap-${row.id}`}
                    className={
                      selected
                        ? "rounded-xl border border-zinc-900 bg-zinc-50 px-3 py-2 text-xs"
                        : "rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs"
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-zinc-900">{row.label}</span>
                      <span
                        className={
                          capability.automation === "manual_only"
                            ? "inline-flex rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-900"
                            : "inline-flex rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800"
                        }
                      >
                        {capability.automation === "manual_only" ? "Manual only" : "Auto supported"}
                      </span>
                    </div>
                    <div className="mt-1 text-zinc-700">Syntrake mode: {capability.signalcoreMode}</div>
                    <div className="mt-0.5 text-zinc-600">{capability.note}</div>
                    <div className="mt-0.5 text-zinc-500">Verified: {capability.verifiedAt}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-semibold text-zinc-900">Step-by-step for {brokerLabel(prefs.broker)}</div>
            <ol className="mt-3 space-y-2 text-sm text-zinc-700">
              {(selectedCapability?.setup || []).map((step, idx) => (
                <li key={`setup-${prefs.broker}-${idx}`} className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                  {idx + 1}. {step}
                </li>
              ))}
            </ol>
            <div className="mt-3 text-xs text-zinc-500">Capability last verified: {selectedCapability?.verifiedAt || "n/a"}</div>
            {selectedCapability?.source ? (
              <a
                href={selectedCapability.source}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center justify-center rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-900"
              >
                Open official source
              </a>
            ) : null}
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-zinc-900">Universal manual execution protocol</div>
              <span
                className={
                  brokerManualOnly || prefs.connectionMethod === "csv"
                    ? "inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900"
                    : "inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-700"
                }
              >
                {brokerManualOnly || prefs.connectionMethod === "csv" ? "Required now" : "Fallback mode"}
              </span>
            </div>
            <ol className="mt-3 space-y-2 text-sm text-zinc-700">
              {UNIVERSAL_MANUAL_EXECUTION_STEPS.map((step, idx) => (
                <li key={`manual-universal-${idx}`} className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                  {idx + 1}. {step}
                </li>
              ))}
            </ol>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href="/app?tab=daily"
                className="inline-flex items-center justify-center rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-900"
              >
                Open Daily checklist
              </a>
              <a
                href="/app?tab=portfolio"
                className="inline-flex items-center justify-center rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-900"
              >
                Open Portfolio
              </a>
            </div>
          </div>
        </div>
      </div>

      {notice ? (
        <div
          className={
            syncHealth === "error"
              ? "mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900"
              : "mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
          }
        >
          {notice}
        </div>
      ) : null}
      {reconcileSummary ? (
        <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
          {reconcileSummary}
        </div>
      ) : null}

      <div className="mt-5 text-xs text-zinc-500">
        Direct connection improves data freshness. Real sync requires broker bridge configuration on the backend; without it, API/OAuth sync returns explicit errors and never fakes connectivity.
      </div>
    </div>
  );
}
