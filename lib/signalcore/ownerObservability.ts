import type {
  OwnerConversionEventRow,
  OwnerLoopKpisPayload,
} from "@/lib/signalcore/ownerLoopKpis";

export type OwnerEngineEventRow = {
  user_id?: string | null;
  title?: string | null;
  details?: Record<string, unknown> | null;
  created_at?: string | null;
};

export type OwnerConversionObservability = {
  counts: {
    paywallOpen: number;
    trialStartClick: number;
    trialStarted: number;
    trialBlockedUsed: number;
    checkoutStart: number;
    checkoutSessionCreated: number;
    paidActivated: number;
    portalOpen: number;
  };
  uniqueUsers: number;
  anonymousVisitors: number;
  attributedUsers: {
    paidFromCheckoutUsers: number;
    paidFromTrialUsers: number;
    overallPaidUsers: number;
    anonymousPaywallOpenUsers: number;
  };
  rates: {
    trialClickRate: number;
    trialStartRate: number;
    checkoutIntentRate: number;
    paidFromCheckoutRate: number;
    paidFromTrialRate: number;
    overallPaidRate: number;
  };
  topSources: Array<{ source: string; count: number }>;
};

export type OwnerGlobalEngineReliability = {
  latestAt: string | null;
  uniqueUsers: number;
  counts: {
    total: number;
    ok: number;
    warn: number;
    error: number;
    orderSent: number;
    orderFilled: number;
    orderFailed: number;
    riskBlocked: number;
    receipts: number;
  };
  rates: {
    okRate: number | null;
    errorRate: number | null;
    orderSuccessRate: number | null;
    executionSuccessRate: number | null;
  };
  executions: {
    total: number;
    withError: number;
    withOk: number;
  };
  latency: {
    samples: number;
    avgMs: number | null;
    p95Ms: number | null;
  };
  recentErrors: Array<{
    at: string | null;
    userId: string;
    event: string;
    title: string;
    message: string | null;
  }>;
};

export type OwnerOpsAlert = {
  id: string;
  severity: "ok" | "warn" | "error";
  title: string;
  body: string;
};

export type OwnerOpsOverviewPayload = {
  generatedAt: string;
  status: "ok" | "warn" | "error";
  alerts: OwnerOpsAlert[];
  conversion: OwnerConversionObservability;
  loopKpis: OwnerLoopKpisPayload;
  engine: OwnerGlobalEngineReliability;
};

function pct(num: number, den: number) {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((num / den) * 10000) / 100));
}

function roundNullable(v: number | null) {
  if (!Number.isFinite(Number(v))) return null;
  return Math.round(Number(v));
}

function percentile(nums: number[], p: number) {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((p / 100) * (sorted.length - 1))),
  );
  const value = sorted[idx];
  return Number.isFinite(value) ? Math.round(value) : null;
}

function normalizeUserId(v: unknown) {
  return String(v || "").trim();
}

function isAnonymousVisitorId(value: string) {
  return value.startsWith("anon:");
}

function eventFromConversionRow(row: OwnerConversionEventRow) {
  const details = row?.details && typeof row.details === "object" ? row.details : {};
  const detailEvent = String((details as any)?.event || "")
    .toLowerCase()
    .trim();
  if (detailEvent) return detailEvent;
  const title = String(row?.title || "")
    .toLowerCase()
    .trim();
  if (title.startsWith("conversion:")) {
    return title.replace("conversion:", "").trim();
  }
  return "";
}

function intersectCount(a: Set<string>, b: Set<string>) {
  const smaller = a.size <= b.size ? a : b;
  const larger = smaller === a ? b : a;
  let count = 0;
  for (const value of smaller) {
    if (larger.has(value)) count += 1;
  }
  return count;
}

function unionSet(...sets: Array<Set<string>>) {
  const out = new Set<string>();
  for (const set of sets) {
    for (const value of set) out.add(value);
  }
  return out;
}

export function computeOwnerConversionObservability(
  rows: OwnerConversionEventRow[],
): OwnerConversionObservability {
  const counts = {
    paywallOpen: 0,
    trialStartClick: 0,
    trialStarted: 0,
    trialBlockedUsed: 0,
    checkoutStart: 0,
    checkoutSessionCreated: 0,
    paidActivated: 0,
    portalOpen: 0,
  };
  const signedUsers = new Set<string>();
  const anonymousVisitors = new Set<string>();
  const anonymousPaywallUsers = new Set<string>();
  const sourceCounts = new Map<string, number>();
  const funnelUsers = {
    paywall_open: new Set<string>(),
    trial_start_click: new Set<string>(),
    trial_started: new Set<string>(),
    trial_blocked_used: new Set<string>(),
    checkout_start: new Set<string>(),
    checkout_session_created: new Set<string>(),
    paid_activated: new Set<string>(),
    portal_open: new Set<string>(),
  };

  for (const row of Array.isArray(rows) ? rows : []) {
    const uid = normalizeUserId(row?.user_id);
    if (!uid) continue;
    const anonymous = isAnonymousVisitorId(uid);

    if (anonymous) anonymousVisitors.add(uid);
    else signedUsers.add(uid);

    const event = eventFromConversionRow(row);
    if (!event) continue;

    if (event === "paywall_open") counts.paywallOpen += 1;
    if (event === "trial_start_click") counts.trialStartClick += 1;
    if (event === "trial_started") counts.trialStarted += 1;
    if (event === "trial_blocked_used") counts.trialBlockedUsed += 1;
    if (event === "checkout_start") counts.checkoutStart += 1;
    if (event === "checkout_session_created") counts.checkoutSessionCreated += 1;
    if (event === "paid_activated") counts.paidActivated += 1;
    if (event === "portal_open") counts.portalOpen += 1;

    const key = event as keyof typeof funnelUsers;
    if (key in funnelUsers && !anonymous) {
      funnelUsers[key].add(uid);
    }

    if (anonymous && event === "paywall_open") {
      anonymousPaywallUsers.add(uid);
    }

    const details = row?.details && typeof row.details === "object" ? row.details : {};
    const source = String((details as any)?.source || "").trim();
    if (source) {
      sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
    }
  }

  const checkoutIntentUsers = unionSet(
    funnelUsers.checkout_start,
    funnelUsers.checkout_session_created,
  );
  const paidFromCheckoutUsers = intersectCount(
    funnelUsers.paid_activated,
    checkoutIntentUsers,
  );
  const paidFromTrialUsers = intersectCount(
    funnelUsers.paid_activated,
    funnelUsers.trial_started,
  );
  const overallPaidUsers = intersectCount(
    funnelUsers.paid_activated,
    funnelUsers.paywall_open,
  );

  return {
    counts,
    uniqueUsers: signedUsers.size,
    anonymousVisitors: anonymousVisitors.size,
    attributedUsers: {
      paidFromCheckoutUsers,
      paidFromTrialUsers,
      overallPaidUsers,
      anonymousPaywallOpenUsers: anonymousPaywallUsers.size,
    },
    rates: {
      trialClickRate: pct(funnelUsers.trial_start_click.size, funnelUsers.paywall_open.size),
      trialStartRate: pct(funnelUsers.trial_started.size, funnelUsers.trial_start_click.size),
      checkoutIntentRate: pct(checkoutIntentUsers.size, funnelUsers.paywall_open.size),
      paidFromCheckoutRate: pct(paidFromCheckoutUsers, checkoutIntentUsers.size),
      paidFromTrialRate: pct(paidFromTrialUsers, funnelUsers.trial_started.size),
      overallPaidRate: pct(overallPaidUsers, funnelUsers.paywall_open.size),
    },
    topSources: Array.from(sourceCounts.entries())
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
  };
}

function asEngineStatus(x: unknown): "ok" | "warn" | "error" {
  const v = String(x || "").toLowerCase().trim();
  if (v === "error") return "error";
  if (v === "warn" || v === "warning") return "warn";
  return "ok";
}

export function computeGlobalEngineReliability(
  rows: OwnerEngineEventRow[],
): OwnerGlobalEngineReliability {
  const counts = {
    total: 0,
    ok: 0,
    warn: 0,
    error: 0,
    orderSent: 0,
    orderFilled: 0,
    orderFailed: 0,
    riskBlocked: 0,
    receipts: 0,
  };
  const durations: number[] = [];
  const executionMap = new Map<string, { hasOk: boolean; hasError: boolean }>();
  const uniqueUsers = new Set<string>();
  const recentErrors: OwnerGlobalEngineReliability["recentErrors"] = [];
  let latestAt: string | null = null;

  for (const row of Array.isArray(rows) ? rows : []) {
    const details = row?.details && typeof row.details === "object" ? row.details : {};
    const status = asEngineStatus((details as any)?.status);
    const event = String((details as any)?.event || "").toLowerCase().trim();
    const executionId = String(
      (details as any)?.execution_id || (details as any)?.executionId || "",
    ).trim();
    const durationRaw = Number((details as any)?.duration_ms ?? (details as any)?.durationMs);
    const durationMs = Number.isFinite(durationRaw) && durationRaw >= 0 ? durationRaw : NaN;
    const userId = normalizeUserId(row?.user_id);

    counts.total += 1;
    if (status === "ok") counts.ok += 1;
    else if (status === "warn") counts.warn += 1;
    else counts.error += 1;

    if (event === "order_sent") counts.orderSent += 1;
    if (event === "order_filled") counts.orderFilled += 1;
    if (event === "order_failed") counts.orderFailed += 1;
    if (event === "risk_blocked") counts.riskBlocked += 1;
    if (event === "daily_receipt_created") counts.receipts += 1;

    if (userId) uniqueUsers.add(userId);
    if (!latestAt && row?.created_at) latestAt = String(row.created_at);
    if (Number.isFinite(durationMs)) durations.push(durationMs);

    if (executionId) {
      const prev = executionMap.get(executionId) || { hasOk: false, hasError: false };
      executionMap.set(executionId, {
        hasOk: prev.hasOk || status === "ok",
        hasError: prev.hasError || status === "error",
      });
    }

    if (status === "error" && recentErrors.length < 10) {
      recentErrors.push({
        at: row?.created_at ? String(row.created_at) : null,
        userId,
        event: event || "unknown",
        title: String(row?.title || "Engine issue"),
        message: String(
          (details as any)?.message ||
            (details as any)?.error ||
            (details as any)?.reason ||
            "",
        ).trim() || null,
      });
    }
  }

  const executionStats = Array.from(executionMap.values());
  const executionTotal = executionStats.length;
  const executionWithError = executionStats.filter((entry) => entry.hasError).length;
  const executionWithOk = executionStats.filter((entry) => entry.hasOk).length;
  const orderTotal = counts.orderFilled + counts.orderFailed;

  return {
    latestAt,
    uniqueUsers: uniqueUsers.size,
    counts,
    rates: {
      okRate: counts.total > 0 ? pct(counts.ok, counts.total) : null,
      errorRate: counts.total > 0 ? pct(counts.error, counts.total) : null,
      orderSuccessRate: orderTotal > 0 ? pct(counts.orderFilled, orderTotal) : null,
      executionSuccessRate:
        executionTotal > 0 ? pct(executionTotal - executionWithError, executionTotal) : null,
    },
    executions: {
      total: executionTotal,
      withError: executionWithError,
      withOk: executionWithOk,
    },
    latency: {
      samples: durations.length,
      avgMs: durations.length
        ? roundNullable(durations.reduce((sum, value) => sum + value, 0) / durations.length)
        : null,
      p95Ms: percentile(durations, 95),
    },
    recentErrors,
  };
}

export function buildOwnerOpsOverview(args: {
  generatedAt?: string;
  conversionRows: OwnerConversionEventRow[];
  engineRows: OwnerEngineEventRow[];
  loopKpis: OwnerLoopKpisPayload;
  tradingLiveOk: boolean;
  scannerFreshOpenMarketCount: number;
  scannerOpenMarketCount: number;
  providerErrorCounts?: Record<string, number>;
}): OwnerOpsOverviewPayload {
  const conversion = computeOwnerConversionObservability(args.conversionRows);
  const engine = computeGlobalEngineReliability(args.engineRows);
  const providerErrorEntries = Object.entries(args.providerErrorCounts || {}).sort(
    (a, b) => b[1] - a[1],
  );
  const alerts: OwnerOpsAlert[] = [];

  if (!args.tradingLiveOk) {
    alerts.push({
      id: "trading-live-degraded",
      severity: "error",
      title: "Trading live degradado",
      body:
        args.scannerOpenMarketCount > 0
          ? `Só ${args.scannerFreshOpenMarketCount}/${args.scannerOpenMarketCount} mercados abertos têm snapshot fresco.`
          : "O scanner não está a produzir snapshots frescos para mercados abertos.",
    });
  }

  if ((engine.rates.errorRate ?? 0) >= 10) {
    alerts.push({
      id: "engine-error-rate",
      severity: "warn",
      title: "Engine com taxa de erro elevada",
      body: `A taxa de erro do engine está em ${engine.rates.errorRate}% na janela atual.`,
    });
  }

  if (
    conversion.counts.paywallOpen >= 10 &&
    conversion.rates.checkoutIntentRate < 15
  ) {
    alerts.push({
      id: "checkout-intent-low",
      severity: "warn",
      title: "Checkout intent baixo",
      body: `Só ${conversion.rates.checkoutIntentRate}% dos utilizadores com paywall aberta chegaram a checkout intent.`,
    });
  }

  if (
    conversion.counts.trialStarted >= 5 &&
    conversion.rates.paidFromTrialRate < 20
  ) {
    alerts.push({
      id: "trial-to-paid-low",
      severity: "warn",
      title: "Trial para paid baixo",
      body: `A conversão de trial para paid está em ${conversion.rates.paidFromTrialRate}% na janela atual.`,
    });
  }

  if (args.loopKpis.kpis.retentionD7.rate < 25) {
    alerts.push({
      id: "retention-d7-low",
      severity: "warn",
      title: "Retention D7 baixa",
      body: `A retention D7 está em ${args.loopKpis.kpis.retentionD7.rate}%.`,
    });
  }

  if (providerErrorEntries.length > 0) {
    const [topError, count] = providerErrorEntries[0];
    alerts.push({
      id: "provider-errors",
      severity: "warn",
      title: "Provider errors detetados",
      body: `${topError} apareceu ${count}x no scanner recente.`,
    });
  }

  const status = alerts.some((alert) => alert.severity === "error")
    ? "error"
    : alerts.some((alert) => alert.severity === "warn")
      ? "warn"
      : "ok";

  return {
    generatedAt: args.generatedAt || new Date().toISOString(),
    status,
    alerts,
    conversion,
    loopKpis: args.loopKpis,
    engine,
  };
}
