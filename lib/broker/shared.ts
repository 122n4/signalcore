import { normalizeMode, type AutopilotMode } from "@/lib/signalcore/modes";

export type BrokerProvider =
  | "interactive_brokers"
  | "alpaca"
  | "degiro"
  | "xtb"
  | "etoro"
  | "binance"
  | "coinbase"
  | "manual_api"
  | "snaptrade";

export type BrokerConnectionMethod = "none" | "api" | "oauth" | "csv";
export type BrokerSyncStatus = "idle" | "ok" | "error";
export type BrokerReconcileStatus = "idle" | "aligned" | "warning" | "critical" | "missing_snapshot";

export type BrokerPosition = {
  symbol: string;
  name?: string | null;
  qty: number | null;
  valueEur: number | null;
  currency?: string | null;
};

export type BrokerSnapshot = {
  mode: AutopilotMode;
  asOf: string;
  positions: BrokerPosition[];
  cashEur: number;
  totalEur: number;
  source: string;
  notes?: string[];
};

export type BrokerConnection = {
  userId: string;
  broker: BrokerProvider;
  accountLabel: string;
  connectionMethod: BrokerConnectionMethod;
  connectionReference: string;
  csvImported: boolean;
  connected: boolean;
  autoSync: boolean;
  syncEveryMinutes: number;
  importExecutions: boolean;
  readOnly: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: BrokerSyncStatus;
  lastError: string | null;
  lastReconcileAt: string | null;
  lastReconcileStatus: BrokerReconcileStatus;
  lastReconcileScore: number | null;
  lastReconcileMismatchCount: number;
  proofValid: boolean;
  proofCheckedAt: string | null;
  snapshot: BrokerSnapshot | null;
  source: "user_settings" | "journal" | "memory" | "none";
  createdAt: string | null;
  updatedAt: string | null;
};

const BROKER_SET: Set<BrokerProvider> = new Set<BrokerProvider>([
  "interactive_brokers",
  "alpaca",
  "degiro",
  "xtb",
  "etoro",
  "binance",
  "coinbase",
  "manual_api",
  "snaptrade",
]);

const BROKER_LABELS: Record<BrokerProvider, string> = {
  interactive_brokers: "Interactive Brokers",
  alpaca: "Alpaca",
  degiro: "DEGIRO",
  xtb: "XTB",
  etoro: "eToro",
  binance: "Binance",
  coinbase: "Coinbase",
  manual_api: "Manual API / CSV",
  snaptrade: "SnapTrade",
};

const MANUAL_ONLY_BROKERS: Set<BrokerProvider> = new Set<BrokerProvider>(["xtb", "degiro", "etoro"]);

export const DEFAULT_BROKER_CONNECTION: BrokerConnection = {
  userId: "",
  broker: "interactive_brokers",
  accountLabel: "",
  connectionMethod: "none",
  connectionReference: "",
  csvImported: false,
  connected: false,
  autoSync: true,
  syncEveryMinutes: 15,
  importExecutions: true,
  readOnly: true,
  lastSyncAt: null,
  lastSyncStatus: "idle",
  lastError: null,
  lastReconcileAt: null,
  lastReconcileStatus: "idle",
  lastReconcileScore: null,
  lastReconcileMismatchCount: 0,
  proofValid: false,
  proofCheckedAt: null,
  snapshot: null,
  source: "none",
  createdAt: null,
  updatedAt: null,
};

export function brokerLabel(broker: BrokerProvider) {
  return BROKER_LABELS[broker] || "Broker";
}

export function isBrokerManualOnly(broker: BrokerProvider) {
  return MANUAL_ONLY_BROKERS.has(broker);
}

export function manualOnlyBrokerReason(broker: BrokerProvider) {
  if (broker === "xtb") {
    return "XTB no longer offers API access in xStation; use CSV import + manual execution checklist.";
  }
  if (broker === "degiro") {
    return "DEGIRO does not offer an API for external application connection; use CSV import + manual execution checklist.";
  }
  if (broker === "etoro") {
    return "Syntrake currently uses eToro in CSV/manual mode. eToro offers a public API, but the direct Syntrake integration is not wired yet; execute via checklist and confirm proof in Daily.";
  }
  return `${brokerLabel(broker)} is configured as manual-only in Syntrake.`;
}

export function allowedConnectionMethodsForBroker(broker: BrokerProvider): BrokerConnectionMethod[] {
  if (isBrokerManualOnly(broker)) return ["csv"];
  return ["api", "oauth", "csv"];
}

export function isConnectionMethodSupportedForBroker(
  broker: BrokerProvider,
  method: BrokerConnectionMethod
) {
  if (method === "none") return true;
  return allowedConnectionMethodsForBroker(broker).includes(method);
}

function safeNum(x: any, fallback = NaN) {
  const n = typeof x === "number" ? x : Number(String(x ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function parseDateISO(v: any) {
  if (!v) return null;
  const d = new Date(String(v));
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

export function normalizeBrokerProvider(v: unknown): BrokerProvider {
  const x = String(v || "").trim().toLowerCase();
  if (BROKER_SET.has(x as BrokerProvider)) return x as BrokerProvider;
  if (x === "ib" || x === "ibkr") return "interactive_brokers";
  if (x === "alpaca_markets" || x === "alpaca-markets") return "alpaca";
  if (x === "e_toro" || x === "e-toro") return "etoro";
  if (x === "manual" || x === "api") return "manual_api";
  return "interactive_brokers";
}

export function normalizeConnectionMethod(v: unknown): BrokerConnectionMethod {
  const x = String(v || "").trim().toLowerCase();
  if (x === "api" || x === "oauth" || x === "csv" || x === "none") return x;
  return "none";
}

export function clampSyncEveryMinutes(v: unknown) {
  const n = safeNum(v, 15);
  return Math.max(5, Math.min(240, Math.round(n || 15)));
}

export function normalizeSymbol(v: unknown) {
  return String(v || "").trim().toUpperCase().replace(/\s+/g, "");
}

export function normalizeModeValue(v: unknown): AutopilotMode {
  return normalizeMode(v);
}

export function isLikelyEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());
}

export function hasConnectionEvidence(args: {
  connectionMethod: BrokerConnectionMethod;
  connectionReference: string;
  csvImported?: boolean;
}) {
  const ref = String(args.connectionReference || "").trim();
  if (!ref) return false;
  if (isLikelyEmail(ref)) return false;

  if (args.connectionMethod === "api") {
    return /^api_[a-zA-Z0-9_-]{12,}$/.test(ref) || /^key_[a-zA-Z0-9_-]{12,}$/.test(ref);
  }
  if (args.connectionMethod === "oauth") {
    return /^oauth_[a-zA-Z0-9_-]{8,}$/.test(ref);
  }
  if (args.connectionMethod === "csv") {
    return Boolean(args.csvImported) && /\.(csv|tsv)$/i.test(ref);
  }
  return false;
}

export function maskConnectionReference(v: string) {
  const ref = String(v || "").trim();
  if (!ref) return "";
  if (ref.length <= 8) return `${ref.slice(0, 2)}***`;
  return `${ref.slice(0, 4)}***${ref.slice(-4)}`;
}

function normalizeSnapshot(raw: any): BrokerSnapshot | null {
  if (!raw || typeof raw !== "object") return null;

  const mode = normalizeModeValue((raw as any).mode);
  const asOf = parseDateISO((raw as any).asOf) || new Date().toISOString();
  const source = String((raw as any).source || "unknown");
  const cashEur = Math.max(0, safeNum((raw as any).cashEur, 0) || 0);

  const positionsRaw =
    Array.isArray((raw as any).positions)
      ? (raw as any).positions
      : Array.isArray((raw as any).holdings)
      ? (raw as any).holdings
      : [];

  const positions: BrokerPosition[] = positionsRaw
    .map((p: any) => {
      const symbol = normalizeSymbol(p?.symbol);
      if (!symbol) return null;
      const qtyNum = safeNum(p?.qty ?? p?.quantity, NaN);
      const valueNum = safeNum(p?.valueEur ?? p?.value_eur ?? p?.value, NaN);
      return {
        symbol,
        name: p?.name != null ? String(p.name).trim() : null,
        qty: Number.isFinite(qtyNum) ? qtyNum : null,
        valueEur: Number.isFinite(valueNum) ? Math.max(0, valueNum) : null,
        currency: p?.currency != null ? String(p.currency) : null,
      } as BrokerPosition;
    })
    .filter(Boolean) as BrokerPosition[];

  const totalFromPositions = positions.reduce((sum, p) => sum + (Number.isFinite(p.valueEur as number) ? (p.valueEur as number) : 0), 0);
  const totalEurRaw = safeNum((raw as any).totalEur, NaN);
  const totalEur = Number.isFinite(totalEurRaw) ? Math.max(0, totalEurRaw) : Math.max(0, cashEur + totalFromPositions);

  const notes = Array.isArray((raw as any).notes) ? (raw as any).notes.map((x: any) => String(x)) : undefined;

  return {
    mode,
    asOf,
    positions,
    cashEur,
    totalEur,
    source,
    notes,
  };
}

export function normalizeBrokerConnection(
  raw: Partial<BrokerConnection> | Record<string, any> | null | undefined,
  userId: string,
  source: BrokerConnection["source"]
): BrokerConnection {
  const r = (raw || {}) as Record<string, any>;
  const broker = normalizeBrokerProvider(r.broker || r.provider);
  const connectionMethodRaw = normalizeConnectionMethod(r.connectionMethod);
  const connectionMethod = isConnectionMethodSupportedForBroker(broker, connectionMethodRaw) ? connectionMethodRaw : "none";
  const connectionReference = String(r.connectionReference || "").trim();
  const csvImported = Boolean(r.csvImported);
  const proofValid = hasConnectionEvidence({
    connectionMethod,
    connectionReference,
    csvImported,
  });

  const snapshot = normalizeSnapshot(r.snapshot);
  const nowIso = new Date().toISOString();

  const connected = Boolean(r.connected) && proofValid;
  const syncStatus =
    r.lastSyncStatus === "ok" || r.lastSyncStatus === "error" || r.lastSyncStatus === "idle"
      ? r.lastSyncStatus
      : "idle";
  const reconcileStatusRaw = String(r.lastReconcileStatus || "").toLowerCase().trim();
  const lastReconcileStatus: BrokerReconcileStatus =
    reconcileStatusRaw === "aligned" ||
    reconcileStatusRaw === "warning" ||
    reconcileStatusRaw === "critical" ||
    reconcileStatusRaw === "missing_snapshot"
      ? (reconcileStatusRaw as BrokerReconcileStatus)
      : "idle";
  const reconcileScoreRaw = safeNum(r.lastReconcileScore, NaN);
  const lastReconcileScore =
    Number.isFinite(reconcileScoreRaw) ? Math.max(0, Math.min(100, Math.round(reconcileScoreRaw))) : null;
  const mismatchRaw = safeNum(r.lastReconcileMismatchCount, NaN);
  const lastReconcileMismatchCount = Number.isFinite(mismatchRaw) ? Math.max(0, Math.round(mismatchRaw)) : 0;

  return {
    userId,
    broker,
    accountLabel: String(r.accountLabel || ""),
    connectionMethod,
    connectionReference,
    csvImported,
    connected,
    autoSync: isBrokerManualOnly(broker) ? false : r.autoSync !== false,
    syncEveryMinutes: clampSyncEveryMinutes(r.syncEveryMinutes),
    importExecutions: r.importExecutions !== false,
    readOnly: isBrokerManualOnly(broker) ? true : r.readOnly !== false,
    lastSyncAt: parseDateISO(r.lastSyncAt),
    lastSyncStatus: syncStatus,
    lastError: r.lastError ? String(r.lastError) : null,
    lastReconcileAt: parseDateISO(r.lastReconcileAt),
    lastReconcileStatus,
    lastReconcileScore,
    lastReconcileMismatchCount,
    proofValid,
    proofCheckedAt: parseDateISO(r.proofCheckedAt) || nowIso,
    snapshot,
    source,
    createdAt: parseDateISO(r.createdAt || r.created_at),
    updatedAt: parseDateISO(r.updatedAt || r.updated_at) || nowIso,
  };
}

export function buildDisconnectedConnection(userId: string, source: BrokerConnection["source"]): BrokerConnection {
  return {
    ...DEFAULT_BROKER_CONNECTION,
    userId,
    source,
    proofCheckedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function sanitizeConnectionForClient(conn: BrokerConnection) {
  return {
    userId: conn.userId,
    broker: conn.broker,
    provider: conn.broker,
    accountLabel: conn.accountLabel || null,
    connectionMethod: conn.connectionMethod,
    connectionReferenceMasked: maskConnectionReference(conn.connectionReference),
    csvImported: conn.csvImported,
    connected: conn.connected,
    autoSync: conn.autoSync,
    syncEveryMinutes: conn.syncEveryMinutes,
    importExecutions: conn.importExecutions,
    readOnly: conn.readOnly,
    lastSyncAt: conn.lastSyncAt,
    lastSyncStatus: conn.lastSyncStatus,
    lastError: conn.lastError,
    lastReconcileAt: conn.lastReconcileAt,
    lastReconcileStatus: conn.lastReconcileStatus,
    lastReconcileScore: conn.lastReconcileScore,
    lastReconcileMismatchCount: conn.lastReconcileMismatchCount,
    proofValid: conn.proofValid,
    proofCheckedAt: conn.proofCheckedAt,
    hasSnapshot: Boolean(conn.snapshot),
    snapshotMeta: conn.snapshot
      ? {
          mode: conn.snapshot.mode,
          asOf: conn.snapshot.asOf,
          positions: conn.snapshot.positions.length,
          cashEur: conn.snapshot.cashEur,
          totalEur: conn.snapshot.totalEur,
          source: conn.snapshot.source,
        }
      : null,
    source: conn.source,
    createdAt: conn.createdAt,
    updatedAt: conn.updatedAt,
  };
}

export function serverReferencePlaceholder(method: BrokerConnectionMethod) {
  if (method === "api") return "api_server_managed_token_0000";
  if (method === "oauth") return "oauth_server_managed_0000";
  if (method === "csv") return "server_import.csv";
  return "";
}
