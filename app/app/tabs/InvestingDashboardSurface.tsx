"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Database,
  FileText,
  Gauge,
  Lock,
  PieChart,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  Wallet,
} from "lucide-react";

export type InvestingSurfacePage = "daily" | "planning" | "portfolio" | "research" | "reports" | "autonomy" | "settings";

type Tone = "good" | "warn" | "bad" | "neutral" | "info";
type AvailabilityStatus = "REAL" | "STALE" | "ESTIMATED" | "UNAVAILABLE";
type RefreshDashboard = () => Promise<void>;

const FINANCIAL_DATA_UNAVAILABLE = "Dados indisponiveis neste momento";

async function fetchJSON(url: string, opts?: RequestInit) {
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts?.headers || {}) },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false as const, status: res.status, data };
  return { ok: true as const, status: res.status, data };
}

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function num(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableNum(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function fmtEUR(value: unknown, digits = 0) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(num(value));
}

function fmtPct(value: unknown, digits = 1) {
  const n = num(value, Number.NaN);
  if (!Number.isFinite(n)) return "--";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

function fmtNullablePct(value: unknown, digits = 1) {
  const n = nullableNum(value);
  return n === null ? "Unavailable" : `${n.toFixed(digits)}%`;
}

function fmtDateTime(value?: string | null) {
  if (!value) return "Unavailable";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unavailable";
  return date.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function makeClientRequestId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizedMoneyInput(value: string) {
  const clean = value.trim().replace(",", ".");
  return /^\d{1,10}(?:\.\d{1,8})?$/.test(clean) && Number(clean) > 0 ? clean : null;
}

function badgeTone(tone: Tone) {
  if (tone === "good") return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  if (tone === "warn") return "border-amber-400/24 bg-amber-400/10 text-amber-200";
  if (tone === "bad") return "border-rose-400/24 bg-rose-400/10 text-rose-200";
  if (tone === "info") return "border-sky-400/24 bg-sky-400/10 text-sky-200";
  return "border-slate-600/60 bg-slate-900/60 text-slate-200";
}

function stateTone(state?: string | null): Tone {
  const raw = String(state || "").toLowerCase();
  if (raw.includes("blocked") || raw.includes("failed") || raw.includes("bad")) return "bad";
  if (raw.includes("review") || raw.includes("warn") || raw.includes("degraded") || raw.includes("required")) return "warn";
  if (raw.includes("ready") || raw.includes("ok") || raw.includes("aligned") || raw.includes("complete") || raw.includes("cleared")) return "good";
  if (raw.includes("paper")) return "info";
  return "neutral";
}

function normalizeAvailability(value: unknown): AvailabilityStatus {
  const raw = String(value || "").trim().toUpperCase();
  if (raw === "REAL" || raw === "STALE" || raw === "ESTIMATED" || raw === "UNAVAILABLE") return raw;
  return "UNAVAILABLE";
}

function availabilityTone(status: AvailabilityStatus): Tone {
  if (status === "REAL") return "good";
  if (status === "STALE" || status === "ESTIMATED") return "warn";
  return "bad";
}

function availabilityLabel(status: AvailabilityStatus) {
  if (status === "REAL") return "Real";
  if (status === "STALE") return "Stale";
  if (status === "ESTIMATED") return "Estimated";
  return "Unavailable";
}

function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={clsx("inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em]", badgeTone(tone))}>
      {children}
    </span>
  );
}

function Panel({
  title,
  subtitle,
  right,
  children,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx("rounded-lg border border-[#22314d] bg-[linear-gradient(180deg,#0d1a2f_0%,#091525_100%)] shadow-[0_18px_50px_rgba(0,0,0,.28)]", className)}>
      <div className="flex items-start justify-between gap-4 border-b border-[#22314d] px-4 py-3">
        <div>
          <div className="text-sm font-bold text-[#eef5ff]">{title}</div>
          {subtitle ? <div className="mt-1 text-xs leading-5 text-[#8396b4]">{subtitle}</div> : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="rounded-lg border border-[#22314d] bg-[#0c192d] px-4 py-3">
      <div className="flex items-start gap-3">
        <div className={clsx("flex h-9 w-9 items-center justify-center rounded-lg border", badgeTone(tone))}>{icon}</div>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7f91ad]">{label}</div>
          <div className="mt-1 truncate text-base font-black text-white">{value}</div>
          {detail ? <div className="mt-1 text-xs text-[#8fa2bf]">{detail}</div> : null}
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  tone = "info",
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: Tone;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "inline-flex min-h-10 items-center justify-center rounded-lg border px-4 py-2 text-sm font-black transition",
        tone === "good" && "border-emerald-400/30 bg-emerald-400/14 text-emerald-100 hover:bg-emerald-400/20",
        tone === "warn" && "border-amber-400/30 bg-amber-400/14 text-amber-100 hover:bg-amber-400/20",
        tone === "bad" && "border-rose-400/30 bg-rose-400/14 text-rose-100 hover:bg-rose-400/20",
        tone === "info" && "border-sky-400/30 bg-sky-400/14 text-sky-100 hover:bg-sky-400/20",
        tone === "neutral" && "border-[#263650] bg-[#0b1729] text-[#dbe7f8] hover:bg-[#102242]",
      )}
    >
      {children}
    </button>
  );
}

const navItems: Array<{ key: InvestingSurfacePage; label: string; icon: React.ReactNode }> = [
  { key: "daily", label: "Today", icon: <Target className="h-4 w-4" /> },
  { key: "portfolio", label: "Portfolio", icon: <PieChart className="h-4 w-4" /> },
  { key: "planning", label: "Plan", icon: <SlidersHorizontal className="h-4 w-4" /> },
  { key: "research", label: "Research", icon: <BookOpen className="h-4 w-4" /> },
  { key: "reports", label: "Reports", icon: <FileText className="h-4 w-4" /> },
  { key: "autonomy", label: "Autonomy", icon: <ShieldCheck className="h-4 w-4" /> },
  { key: "settings", label: "Settings", icon: <SlidersHorizontal className="h-4 w-4" /> },
];

const assetColors: Record<string, string> = {
  equity: "#2d7dff",
  bond: "#35c6d9",
  bonds: "#35c6d9",
  commodity: "#f0b64a",
  commodities: "#f0b64a",
  cash: "#8c5cff",
};

function normalizeAssetClass(value: unknown) {
  const raw = String(value || "").toLowerCase();
  if (raw.includes("bond")) return "bonds";
  if (raw.includes("cash")) return "cash";
  if (raw.includes("gold") || raw.includes("commodity")) return "commodity";
  return "equity";
}

function assetLabel(value: string) {
  if (value === "bonds") return "Bonds";
  if (value === "commodity") return "Gold";
  if (value === "cash") return "Cash";
  return "Equity";
}

function inferAsset(symbol: string, targetBySymbol: Map<string, string>) {
  const known = targetBySymbol.get(symbol.toUpperCase());
  if (known) return known;
  if (symbol.toUpperCase() === "AGGH") return "bonds";
  if (symbol.toUpperCase() === "GLD") return "commodity";
  if (["EUR", "USD", "CASH"].includes(symbol.toUpperCase())) return "cash";
  return "equity";
}

function Donut({ rows, center }: { rows: Array<{ label: string; value: number; color: string }>; center: React.ReactNode }) {
  let cursor = 0;
  const total = rows.reduce((sum, row) => sum + Math.max(0, row.value), 0);
  const gradient =
    total > 0
      ? rows
          .map((row) => {
            const start = cursor;
            cursor += (Math.max(0, row.value) / total) * 100;
            return `${row.color} ${start}% ${cursor}%`;
          })
          .join(", ")
      : "#263754 0% 100%";
  return (
    <div className="flex items-center gap-5">
      <div className="relative h-36 w-36 shrink-0 rounded-full" style={{ background: `conic-gradient(${gradient})` }}>
        <div className="absolute inset-[18px] flex items-center justify-center rounded-full bg-[#081424] text-center text-xs font-black text-white shadow-inner">
          {center}
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 text-xs">
            <span className="inline-flex items-center gap-2 text-[#a8bad5]">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />
              {row.label}
            </span>
            <span className="font-bold text-white">{row.value.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[#2a3c5f] bg-[#081424] p-4 text-sm text-[#9fb1ca]">
      <div className="font-bold text-white">{title}</div>
      <div className="mt-1 leading-6">{detail}</div>
    </div>
  );
}

function buildViewModel(data: any) {
  const decision = data?.daily?.customerDecision ?? data?.derived?.customerDecision ?? null;
  const runtime = data?.daily?.investingEngine ?? null;
  const portfolio = data?.portfolio ?? {};
  const items = Array.isArray(portfolio?.items) ? portfolio.items : [];
  const totalEur = nullableNum(portfolio?.totalEur ?? decision?.portfolio?.totalEur);
  const cashEurRaw = nullableNum(portfolio?.cash?.amountEur ?? portfolio?.cashEur ?? decision?.portfolio?.cashEur);
  const cashAvailability = normalizeAvailability(portfolio?.cash?.availability);
  const canShowCashValue = cashAvailability !== "UNAVAILABLE" && cashEurRaw !== null;
  const cashEur = cashEurRaw ?? 0;
  const targetRows = Array.isArray(decision?.portfolio?.targetAllocations) ? decision.portfolio.targetAllocations : [];
  const actionRows = Array.isArray(decision?.portfolio?.actions) ? decision.portfolio.actions : [];
  const targetBySymbol = new Map<string, string>();
  for (const row of targetRows) {
    targetBySymbol.set(String(row.symbol || "").toUpperCase(), normalizeAssetClass(row.assetClass));
  }
  const currentByAsset = new Map<string, number>();
  for (const item of items) {
    const symbol = String(item?.symbol || "").toUpperCase();
    const asset = inferAsset(symbol, targetBySymbol);
    const value = nullableNum(item?.valueEur ?? item?.value_eur);
    if (value !== null) currentByAsset.set(asset, (currentByAsset.get(asset) || 0) + value);
  }
  currentByAsset.set("cash", (currentByAsset.get("cash") || 0) + cashEur);

  const targetByAsset = new Map<string, number>();
  for (const row of targetRows) {
    const asset = normalizeAssetClass(row.assetClass);
    targetByAsset.set(asset, (targetByAsset.get(asset) || 0) + num(row.targetWeightPct));
  }
  const assets = Array.from(new Set(["equity", "bonds", "commodity", "cash", ...Array.from(currentByAsset.keys()), ...Array.from(targetByAsset.keys())]));
  const allocationRows = assets.map((asset) => {
    const currentValueEur = currentByAsset.get(asset) || 0;
    const currentWeight = totalEur !== null && totalEur > 0 ? (currentValueEur / totalEur) * 100 : null;
    const targetWeight = targetByAsset.get(asset) || 0;
    const drift = currentWeight === null ? null : currentWeight - targetWeight;
    return {
      asset,
      label: assetLabel(asset),
      color: assetColors[asset] || "#64748b",
      currentValueEur,
      currentWeight,
      targetWeight,
      drift,
    };
  });
  const coveragePct = num(portfolio?.valuation?.coveragePct ?? decision?.dataQuality?.pricingCoveragePct, items.length ? 0 : 100);
  const valuationAvailability = normalizeAvailability(portfolio?.valuation?.availability ?? portfolio?.valuation?.provenance?.status);
  const decisionAvailability = normalizeAvailability(data?.derived?.decisionAvailability ?? data?.derived?.decisionProvenance?.status);
  const accountEnvironment = String(portfolio?.environment || "").toLowerCase();
  const accountStatus = String(portfolio?.accountStatus || "").toLowerCase();
  const hasPaperAccount = Boolean(portfolio?.accountId && accountEnvironment === "paper" && accountStatus === "active");
  const valuationSource = String(portfolio?.valuation?.source || portfolio?.valuationSource || decision?.dataQuality?.valuationSource || "unknown");
  const canShowPortfolioValue = valuationAvailability !== "UNAVAILABLE";
  const dataQualityHigh = valuationAvailability === "REAL" && coveragePct >= 90;
  const valuationLabel = valuationSource === "cash_only"
    ? `${availabilityLabel(valuationAvailability)} - cash only`
    : `${availabilityLabel(valuationAvailability)} - ${coveragePct}% proven price coverage`;
  const holdingRows = items.map((item: any) => {
    const value = nullableNum(item.valueEur ?? item.value_eur);
    const weightPct = value !== null && totalEur !== null && totalEur > 0 ? (value / totalEur) * 100 : null;
    const itemValuationAvailability = normalizeAvailability(item.valuationAvailability ?? item.valuation_availability);
    const itemPriceAvailability = normalizeAvailability(item.priceAvailability ?? item.price_availability);
    return {
      item,
      symbol: String(item.symbol || "").toUpperCase(),
      value,
      valueText: itemValuationAvailability === "UNAVAILABLE" || value === null ? FINANCIAL_DATA_UNAVAILABLE : fmtEUR(value),
      weightPct,
      weightText: fmtNullablePct(weightPct),
      valuationAvailability: itemValuationAvailability,
      priceAvailability: itemPriceAvailability,
    };
  });
  return {
    decision,
    runtime,
    plan: data?.plan ?? null,
    portfolio,
    items,
    holdingRows,
    totalEur,
    cashEur,
    cashAvailability,
    canShowCashValue,
    targetRows,
    actionRows: decisionAvailability === "UNAVAILABLE" ? [] : actionRows,
    allocationRows,
    coveragePct,
    valuationAvailability,
    decisionAvailability,
    canShowPortfolioValue,
    dataQualityHigh,
    portfolioValue: canShowPortfolioValue && totalEur !== null ? fmtEUR(totalEur) : FINANCIAL_DATA_UNAVAILABLE,
    cashValue: canShowCashValue ? fmtEUR(cashEur) : FINANCIAL_DATA_UNAVAILABLE,
    valuationLabel,
    decisionUnavailable: decisionAvailability === "UNAVAILABLE",
    accountEnvironment,
    accountStatus,
    hasPaperAccount,
    valuationSource,
    queue: data?.daily?.execution?.queue ?? null,
    order: data?.daily?.execution?.order ?? null,
    receipts: Array.isArray(data?.derived?.receiptsTimeline) ? data.derived.receiptsTimeline : [],
    asOf: data?.asOf ?? decision?.asOf ?? null,
    lastSnapshotAt: data?.derived?.lastSnapshotAt ?? data?.daily?.lastSnapshotAt ?? null,
  };
}

export const buildInvestingDashboardSurfaceViewModel = buildViewModel;

function StatusRow({ label, value, tone = "neutral" }: { label: string; value: React.ReactNode; tone?: Tone }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#22314d] py-2 text-sm last:border-0">
      <span className="text-[#8fa2bf]">{label}</span>
      <span className={clsx("text-right font-bold", tone === "good" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : tone === "bad" ? "text-rose-300" : "text-white")}>{value}</span>
    </div>
  );
}

function Shell({ page, data, loading, error, children }: { page: InvestingSurfacePage; data: any; loading: boolean; error: string | null; children: React.ReactNode }) {
  const router = useRouter();
  const vm = buildViewModel(data);
  const pageTitle = navItems.find((item) => item.key === page)?.label || "Today";
  return (
    <div className="rounded-xl border border-[#263650] bg-[#06101f] p-3 shadow-[0_28px_90px_rgba(0,0,0,.4)]">
      <div className="grid min-h-[760px] grid-cols-1 gap-3 lg:grid-cols-[190px_minmax(0,1fr)]">
        <aside className="rounded-lg border border-[#1f2e49] bg-[linear-gradient(180deg,#071326_0%,#06101f_100%)] p-3">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[linear-gradient(135deg,#0ea5e9_0%,#6253ff_100%)] text-lg font-black text-white">S</div>
            <div>
              <div className="text-sm font-black leading-none text-white">Syntrake</div>
              <div className="mt-1 text-[11px] text-[#8da0bd]">Investing</div>
            </div>
          </div>
          <nav className="mt-5 space-y-1">
            {navItems.map((item) => {
              const active = item.key === page;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => router.push(`/app?tab=${item.key}&mode=investing`)}
                  className={clsx(
                    "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm font-semibold transition",
                    active
                      ? "border-blue-400/30 bg-blue-500/18 text-white"
                      : "border-transparent text-[#9fb1ca] hover:border-[#263650] hover:bg-[#0d1a2f] hover:text-white",
                  )}
                >
                  {item.icon}
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="mt-8 space-y-3">
            <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/8 p-3">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-200">
                <span className="h-2 w-2 rounded-full bg-emerald-300" />
                Paper Account
              </div>
              <div className="mt-1 text-[11px] text-[#8da0bd]">Environment: Paper</div>
            </div>
            <div className="rounded-lg border border-[#263650] bg-[#0b1729] p-3">
              <div className="text-xs font-bold text-white">Data Quality</div>
              <div className="mt-1 text-[11px] text-[#8da0bd]">{loading ? "Loading" : error ? "Unavailable" : vm.valuationLabel}</div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 rounded-lg border border-[#1f2e49] bg-[radial-gradient(circle_at_top_left,#102242_0%,#071326_34%,#06101f_100%)] p-4">
          <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#7f91ad]">Syntrake Investing</div>
              <h1 className="mt-1 text-2xl font-black tracking-[-0.04em] text-white">{pageTitle}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-lg border border-[#263650] bg-[#081424] px-3 py-2 text-xs text-[#8fa2bf]">
                As of <span className="font-bold text-white">{fmtDateTime(vm.asOf)}</span>
              </div>
              <Badge tone="info">Paper only</Badge>
              <Badge tone="bad">Live blocked</Badge>
            </div>
          </header>
          {error ? <div className="mb-4 rounded-lg border border-rose-400/25 bg-rose-400/10 p-3 text-sm text-rose-100">{error}</div> : null}
          {children}
        </main>
      </div>
    </div>
  );
}

function TopMetrics({ vm }: { vm: ReturnType<typeof buildViewModel> }) {
  const accountValue = vm.hasPaperAccount ? "Paper active" : "Setup required";
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      <MetricCard icon={<Target className="h-4 w-4" />} label="Active plan" value={vm.plan ? "Active" : "Missing"} detail={vm.decision?.risk?.objective || "Long-term mandate"} tone={vm.plan ? "good" : "warn"} />
      <MetricCard icon={<ShieldCheck className="h-4 w-4" />} label="Account mode" value={accountValue} detail={vm.accountStatus || "No active account"} tone={vm.hasPaperAccount ? "info" : "warn"} />
      <MetricCard icon={<Wallet className="h-4 w-4" />} label="Cash available" value={vm.cashValue} detail="Canonical cash balance" tone={vm.canShowCashValue ? "good" : "warn"} />
      <MetricCard icon={<BarChart3 className="h-4 w-4" />} label="Portfolio value" value={vm.portfolioValue} detail={vm.valuationLabel} tone={availabilityTone(vm.valuationAvailability)} />
      <MetricCard icon={<CalendarDays className="h-4 w-4" />} label="Last daily cycle" value={fmtDateTime(vm.lastSnapshotAt)} detail={vm.receipts.length ? `${vm.receipts.length} receipts` : "No receipts yet"} tone={vm.lastSnapshotAt ? "good" : "warn"} />
    </div>
  );
}

function AllocationPanel({ vm }: { vm: ReturnType<typeof buildInvestingDashboardSurfaceViewModel> }) {
  const rows = vm.allocationRows.filter((row) => row.currentValueEur > 0 || (row.currentWeight ?? 0) > 0 || row.targetWeight > 0);
  return (
    <Panel title="Current vs Target Allocation" subtitle="Canonical Paper portfolio compared with mandate policy" right={<Badge tone={stateTone(vm.decision?.researchPublication?.validationStatus)}> {vm.decision?.researchPublication?.validationStatus || "unavailable"} </Badge>}>
      {rows.length ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(220px,320px)_1fr]">
          <Donut rows={rows.map((row) => ({ label: row.label, value: row.targetWeight, color: row.color }))} center={<div>Target<br />Policy</div>} />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[#7f91ad]">
                <tr>
                  <th className="py-2">Asset class</th>
                  <th className="py-2 text-right">Current</th>
                  <th className="py-2 text-right">Target</th>
                  <th className="py-2 text-right">Drift</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#22314d]">
                {rows.map((row) => (
                  <tr key={row.asset}>
                    <td className="py-2 font-semibold text-white"><span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: row.color }} />{row.label}</td>
                    <td className="py-2 text-right text-[#dbe7f8]">{fmtNullablePct(row.currentWeight)}</td>
                    <td className="py-2 text-right text-[#dbe7f8]">{row.targetWeight.toFixed(1)}%</td>
                    <td className={clsx("py-2 text-right font-bold", row.drift === null ? "text-[#8fa2bf]" : Math.abs(row.drift) <= 1 ? "text-emerald-300" : row.drift > 0 ? "text-rose-300" : "text-emerald-300")}>{row.drift === null ? "Unavailable" : fmtPct(row.drift)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <EmptyState title="Allocation unavailable" detail="Create a plan and fund the Paper account before allocation can be displayed." />
      )}
    </Panel>
  );
}

function TodayPage({ vm }: { vm: ReturnType<typeof buildViewModel> }) {
  const action = vm.decision?.action;
  return (
    <div className="space-y-3">
      <TopMetrics vm={vm} />
      <div className="grid gap-3 xl:grid-cols-[1.1fr_.9fr]">
        <Panel title="Today's Decision" subtitle={vm.decisionUnavailable ? FINANCIAL_DATA_UNAVAILABLE : vm.decision?.summary?.detail || "Canonical decision projection"} right={<Badge tone={vm.decisionUnavailable ? "bad" : stateTone(vm.decision?.state)}>{vm.decisionUnavailable ? "unavailable" : vm.decision?.state || "setup required"}</Badge>}>
          <div className="space-y-4">
            {vm.decisionUnavailable ? (
              <EmptyState title={FINANCIAL_DATA_UNAVAILABLE} detail="Refresh is required before displaying an actionable Investing decision." />
            ) : (
              <>
                <div>
                  <div className="text-2xl font-black text-white">{vm.decision?.summary?.headline || "Setup required"}</div>
                  <div className="mt-2 text-sm leading-6 text-[#9fb1ca]">{vm.decision?.summary?.detail || "Create an active Investing plan and Paper account before a proposal can be generated."}</div>
                </div>
                <div className="grid gap-2 text-sm md:grid-cols-2">
                  <div className="rounded-lg border border-[#22314d] bg-[#081424] p-3"><span className="text-[#7f91ad]">What</span><div className="mt-1 font-bold text-white">{action?.type || "setup_required"}</div></div>
                  <div className="rounded-lg border border-[#22314d] bg-[#081424] p-3"><span className="text-[#7f91ad]">Why</span><div className="mt-1 font-bold text-white">{vm.decision?.risk?.governanceStatus || "unknown"}</div></div>
                  <div className="rounded-lg border border-[#22314d] bg-[#081424] p-3"><span className="text-[#7f91ad]">Cost</span><div className="mt-1 font-bold text-white">{fmtEUR(vm.decision?.costs?.estimatedRoundTripCostEur || 0, 2)}</div></div>
                  <div className="rounded-lg border border-[#22314d] bg-[#081424] p-3"><span className="text-[#7f91ad]">Validity</span><div className="mt-1 font-bold text-white">{action?.expiresAt ? fmtDateTime(action.expiresAt) : "Manual review window"}</div></div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(action?.allowedResponses || ["refresh"]).map((response: string) => <Badge key={response} tone="info">{response.replace(/_/g, " ")}</Badge>)}
                </div>
              </>
            )}
          </div>
        </Panel>
        <AllocationPanel vm={vm} />
      </div>
      <div className="grid gap-3 xl:grid-cols-4">
        <PortfolioSnapshot vm={vm} compact />
        <GovernancePanel vm={vm} />
        <BenchmarkPanel vm={vm} />
        <PaperLifecyclePanel vm={vm} />
      </div>
    </div>
  );
}

function PortfolioSnapshot({ vm, compact = false }: { vm: ReturnType<typeof buildViewModel>; compact?: boolean }) {
  return (
    <Panel title="Portfolio Snapshot" subtitle="Canonical Paper holdings" className={compact ? "" : "xl:col-span-2"}>
      {vm.items.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[#7f91ad]"><tr><th className="py-2">Symbol</th><th className="py-2 text-right">Value</th><th className="py-2 text-right">Weight</th><th className="py-2 text-right">Coverage</th></tr></thead>
            <tbody className="divide-y divide-[#22314d]">
              {vm.holdingRows.slice(0, compact ? 5 : 12).map((row) => {
                return (
                  <tr key={row.symbol}>
                    <td className="py-2 font-bold text-white">{row.symbol}</td>
                    <td className="py-2 text-right text-[#dbe7f8]">{row.valueText}</td>
                    <td className="py-2 text-right text-[#dbe7f8]">{row.weightText}</td>
                    <td className="py-2 text-right"><Badge tone={availabilityTone(row.priceAvailability)}>{availabilityLabel(row.priceAvailability)}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="No canonical holdings" detail="The page does not invent positions. Fund/open a Paper account or wait for canonical positions." />
      )}
    </Panel>
  );
}

function GovernancePanel({ vm }: { vm: ReturnType<typeof buildViewModel> }) {
  return (
    <Panel title="Governance & Execution" subtitle="Paper/manual guardrails">
      <div className="space-y-2 text-sm">
        <div className="flex justify-between gap-3"><span className="text-[#8fa2bf]">Clearance</span><span className="font-bold text-white">{vm.decision?.risk?.executionClearance || "unknown"}</span></div>
        <div className="flex justify-between gap-3"><span className="text-[#8fa2bf]">Approval</span><span className="font-bold text-white">{vm.decision?.action?.approvalStatus || "not available"}</span></div>
        <div className="flex justify-between gap-3"><span className="text-[#8fa2bf]">Turnover</span><span className="font-bold text-white">{vm.decision?.risk?.turnoverBucket || "unknown"}</span></div>
        <div className="flex justify-between gap-3"><span className="text-[#8fa2bf]">Live execution</span><span className="font-bold text-rose-300">Blocked</span></div>
      </div>
    </Panel>
  );
}

function BenchmarkPanel({ vm }: { vm: ReturnType<typeof buildViewModel> }) {
  return (
    <Panel title="Benchmark & Data Quality" subtitle={vm.decision?.researchPublication?.benchmarkName || "Benchmark relative validation"}>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 text-sm"><span className="text-[#8fa2bf]">Validation</span><Badge tone={stateTone(vm.decision?.researchPublication?.validationStatus)}>{vm.decision?.researchPublication?.validationStatus || "unavailable"}</Badge></div>
        <div className="flex items-center justify-between gap-3 text-sm"><span className="text-[#8fa2bf]">Price coverage</span><span className={clsx("font-bold", vm.dataQualityHigh ? "text-emerald-300" : "text-amber-300")}>{vm.valuationLabel}</span></div>
        <div className="flex items-center justify-between gap-3 text-sm"><span className="text-[#8fa2bf]">Market snapshot</span><span className="truncate font-mono text-xs text-sky-200">{vm.decision?.marketSnapshot?.hash?.slice(0, 10) || "unavailable"}</span></div>
      </div>
    </Panel>
  );
}

function PaperLifecyclePanel({ vm }: { vm: ReturnType<typeof buildViewModel> }) {
  return (
    <Panel title="Paper Lifecycle" subtitle="Order and queue state">
      <div className="space-y-2 text-sm">
        <div className="flex justify-between gap-3"><span className="text-[#8fa2bf]">Queue</span><span className="font-bold text-white">{vm.queue?.operational_state || "No pending queue"}</span></div>
        <div className="flex justify-between gap-3"><span className="text-[#8fa2bf]">Latest order</span><span className="font-bold text-white">{vm.order?.status || "No order submitted"}</span></div>
        <div className="flex justify-between gap-3"><span className="text-[#8fa2bf]">Market data</span><span className={clsx("font-bold", vm.dataQualityHigh ? "text-emerald-300" : "text-amber-300")}>{vm.valuationLabel}</span></div>
      </div>
    </Panel>
  );
}

function PlanPage({ vm }: { vm: ReturnType<typeof buildViewModel> }) {
  return (
    <div className="space-y-3">
      <TopMetrics vm={vm} />
      <div className="grid gap-3 xl:grid-cols-2">
        <Panel title="Goal & Roadmap" subtitle="Plan inputs converted into mandate rules">
          <div className="grid gap-3 md:grid-cols-2">
            <MetricCard icon={<Target className="h-4 w-4" />} label="Primary goal" value={vm.decision?.risk?.objective || "Unavailable"} tone={vm.plan ? "good" : "warn"} />
            <MetricCard icon={<Gauge className="h-4 w-4" />} label="Risk profile" value={vm.decision?.risk?.riskProfile || "Unavailable"} tone="info" />
            <MetricCard icon={<CalendarDays className="h-4 w-4" />} label="Horizon" value={vm.decision?.risk?.horizon || "Unavailable"} tone="info" />
            <MetricCard icon={<Wallet className="h-4 w-4" />} label="Cash readiness" value={vm.cashValue} tone={vm.cashEur > 0 ? "good" : "warn"} />
          </div>
        </Panel>
        <AllocationPanel vm={vm} />
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        <Panel title="Starter Pack / Eligible Instruments" subtitle="Current canonical instrument universe">
          {vm.targetRows.length ? (
            <div className="grid gap-2">
              {vm.targetRows.map((row: any) => (
                <div key={row.symbol} className="rounded-lg border border-[#22314d] bg-[#081424] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div><div className="font-bold text-white">{row.symbol}</div><div className="text-xs text-[#8fa2bf]">{row.rationale}</div></div>
                    <div className="text-right text-sm font-bold text-white">{fmtPct(row.targetWeightPct)}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyState title="Starter pack unavailable" detail="The mandate engine needs an active plan before instruments are shown." />}
        </Panel>
        <Panel title="Execution Path" subtitle="Plan to daily decision flow">
          <div className="grid gap-3 md:grid-cols-4">
            {["Plan", "Mandate", "Target portfolio", "Daily decision"].map((step) => <div key={step} className="rounded-lg border border-[#22314d] bg-[#081424] p-3 text-sm font-bold text-white">{step}</div>)}
          </div>
          <div className="mt-4 rounded-lg border border-emerald-400/20 bg-emerald-400/8 p-3 text-sm text-emerald-100">All displayed values are planning views only. No future performance is guaranteed.</div>
        </Panel>
      </div>
    </div>
  );
}

function PortfolioFundingPanel({ vm, onRefresh }: { vm: ReturnType<typeof buildViewModel>; onRefresh: RefreshDashboard }) {
  const router = useRouter();
  const [amount, setAmount] = useState("10000");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: Tone; text: string } | null>(null);
  const accountId = String(vm.portfolio?.accountId || "");
  const hasPlan = Boolean(vm.plan);
  const hasAccount = Boolean(accountId);
  const hasCash = vm.cashEur > 0;
  const queueState = String(vm.queue?.operational_state || "").toLowerCase();
  const approvalStatus = String(vm.queue?.approval_status || "").toLowerCase();
  const queueVersion = Number(vm.queue?.version);
  const tradeAction = vm.actionRows.find((row: any) => row?.side === "buy" || row?.side === "sell");
  const tradeSymbol = String(tradeAction?.symbol || "").toUpperCase();
  const canSubmitPaper =
    Boolean(vm.queue?.id)
    && Number.isSafeInteger(queueVersion)
    && queueVersion > 0
    && queueState === "approved"
    && (approvalStatus === "approved" || approvalStatus === "not_required")
    && !vm.decisionUnavailable
    && Boolean(tradeSymbol);

  async function run(label: string, work: () => Promise<void>) {
    if (busy) return;
    setBusy(label);
    setMessage(null);
    try {
      await work();
      await onRefresh();
    } catch (error: any) {
      setMessage({ tone: "bad", text: error?.message || "Paper action failed." });
    } finally {
      setBusy(null);
    }
  }

  async function openAccount() {
    const initialDeposit = normalizedMoneyInput(amount);
    if (!initialDeposit) {
      setMessage({ tone: "warn", text: "Enter a valid Paper cash amount before opening the account." });
      return;
    }
    await run("open_account", async () => {
      const result = await fetchJSON("/api/investing/paper/accounts", {
        method: "POST",
        body: JSON.stringify({
          action: "open_paper_account",
          portfolioId: "primary",
          environment: "paper",
          currency: "EUR",
          initialDeposit,
          clientRequestId: makeClientRequestId("portfolio-paper-account"),
        }),
      });
      if (!result.ok) throw new Error(result.data?.error || "Failed to open Paper account.");
      setMessage({ tone: "good", text: "Paper account opened and funded. Create a daily proposal next." });
    });
  }

  async function depositCash() {
    const depositAmount = normalizedMoneyInput(amount);
    if (!accountId || !depositAmount) {
      setMessage({ tone: "warn", text: "A valid Paper account and amount are required before adding cash." });
      return;
    }
    await run("deposit_cash", async () => {
      const result = await fetchJSON(`/api/investing/paper/accounts/${accountId}/movements`, {
        method: "POST",
        body: JSON.stringify({
          action: "deposit",
          environment: "paper",
          amount: depositAmount,
          currency: "EUR",
          clientRequestId: makeClientRequestId("portfolio-cash-deposit"),
        }),
      });
      if (!result.ok) throw new Error(result.data?.error || "Failed to add Paper cash.");
      setMessage({ tone: "good", text: "Paper cash added. Refreshing canonical portfolio state." });
    });
  }

  async function createProposal() {
    if (!hasPlan || !hasAccount || !hasCash) {
      setMessage({ tone: "warn", text: "Create a plan, open a Paper account, and add cash before generating a proposal." });
      return;
    }
    await run("close_day", async () => {
      const result = await fetchJSON("/api/investing/daily-cycle", {
        method: "POST",
        body: JSON.stringify({
          action: "close_daily_loop",
          portfolioId: "primary",
          clientRequestId: makeClientRequestId("portfolio-daily-cycle"),
          environment: "paper",
          note: "Portfolio add-holdings workflow",
        }),
      });
      if (!result.ok) throw new Error(result.data?.error || "Failed to create Paper proposal.");
      setMessage({ tone: "good", text: "Daily proposal created. Submit the Paper order only after review." });
    });
  }

  async function submitPaperOrder() {
    if (!canSubmitPaper) {
      setMessage({ tone: "warn", text: "No approved Paper queue is ready to submit yet." });
      return;
    }
    await run("submit_order", async () => {
      const result = await fetchJSON("/api/investing/paper/orders", {
        method: "POST",
        body: JSON.stringify({
          queueId: String(vm.queue.id),
          expectedQueueVersion: queueVersion,
          symbol: tradeSymbol,
          clientRequestId: makeClientRequestId(`portfolio-paper-order-${tradeSymbol.toLowerCase()}`),
          environment: "paper",
        }),
      });
      if (!result.ok) throw new Error(result.data?.error || "Paper order submission failed.");
      setMessage({ tone: "good", text: `${tradeSymbol} submitted to Paper. The worker/fill lifecycle will create the canonical holding.` });
    });
  }

  const steps = [
    { label: "Plan", detail: hasPlan ? "Active Investing plan found" : "Plan required before proposals", done: hasPlan },
    { label: "Paper account", detail: hasAccount ? "Canonical Paper account active" : "Open a Paper account", done: hasAccount },
    { label: "Cash", detail: hasCash ? `${fmtEUR(vm.cashEur)} available` : "Add Paper cash before buying", done: hasCash },
    { label: "Proposal", detail: vm.queue?.operational_state || "Create a daily proposal", done: Boolean(vm.queue?.id) },
    { label: "Order", detail: vm.order?.status || "Submit approved Paper order", done: Boolean(vm.order?.id) },
  ];

  return (
    <Panel title="Add Holdings - Canonical Paper Flow" subtitle="Holdings are created by Paper orders and fills, not by manual position entry">
      <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
        <div className="grid gap-2 md:grid-cols-5">
          {steps.map((step) => (
            <div key={step.label} className="rounded-lg border border-[#22314d] bg-[#081424] p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-black uppercase tracking-[0.08em] text-white">{step.label}</div>
                {step.done ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <AlertTriangle className="h-4 w-4 text-amber-300" />}
              </div>
              <div className="mt-2 text-xs leading-5 text-[#8fa2bf]">{step.detail}</div>
            </div>
          ))}
        </div>
        <div className="space-y-3">
          <label className="block text-xs font-bold uppercase tracking-[0.08em] text-[#8fa2bf]" htmlFor="paper-cash-amount">Paper cash amount</label>
          <input
            id="paper-cash-amount"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="w-full rounded-lg border border-[#263650] bg-[#081424] px-3 py-2 text-sm font-bold text-white outline-none focus:border-sky-300"
          />
          <div className="flex flex-wrap gap-2">
            {!hasPlan ? <ActionButton tone="warn" onClick={() => router.push("/app?tab=planning&mode=investing")}>Open Plan</ActionButton> : null}
            {!hasAccount && !busy ? <ActionButton tone="good" onClick={openAccount}>Open & fund Paper</ActionButton> : null}
            {hasAccount && !busy ? <ActionButton tone="info" onClick={depositCash}>Add Paper cash</ActionButton> : null}
            {hasPlan && hasAccount && hasCash && !busy ? <ActionButton tone="good" onClick={createProposal}>Create Paper proposal</ActionButton> : null}
            {canSubmitPaper && !busy ? <ActionButton tone="good" onClick={submitPaperOrder}>Submit {tradeSymbol} to Paper</ActionButton> : null}
            {busy ? <div className="rounded-lg border border-sky-400/25 bg-sky-400/10 px-4 py-2 text-sm font-bold text-sky-100">Working...</div> : null}
          </div>
          {vm.queue?.id && !canSubmitPaper ? (
            <div className="rounded-lg border border-amber-400/20 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100">
              Queue is {vm.queue.operational_state || "present"} with approval {vm.queue.approval_status || "unknown"}. Submit becomes available only when Paper execution is cleared.
            </div>
          ) : null}
          {message ? <div className={clsx("rounded-lg border p-3 text-xs leading-5", badgeTone(message.tone))}>{message.text}</div> : null}
        </div>
      </div>
    </Panel>
  );
}

function PortfolioPage({ vm, onRefresh }: { vm: ReturnType<typeof buildViewModel>; onRefresh: RefreshDashboard }) {
  return (
    <div className="space-y-3">
      <TopMetrics vm={vm} />
      <PortfolioFundingPanel vm={vm} onRefresh={onRefresh} />
      <div className="grid gap-3 xl:grid-cols-[1fr_1fr]">
        <AllocationPanel vm={vm} />
        <Panel title="Concentration & Drift Analysis" subtitle="Instrument weight against mandate target">
          {vm.actionRows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[#7f91ad]"><tr><th className="py-2">Instrument</th><th className="py-2 text-right">Current</th><th className="py-2 text-right">Target</th><th className="py-2 text-right">Delta</th><th className="py-2 text-right">Action</th></tr></thead>
                <tbody className="divide-y divide-[#22314d]">
                  {vm.actionRows.map((row: any) => (
                    <tr key={row.symbol}><td className="py-2 font-bold text-white">{row.symbol}</td><td className="py-2 text-right">{fmtPct(row.currentWeightPct)}</td><td className="py-2 text-right">{fmtPct(row.targetWeightPct)}</td><td className="py-2 text-right font-bold">{fmtEUR(row.deltaValueEur)}</td><td className="py-2 text-right"><Badge tone={row.side === "hold" ? "neutral" : "good"}>{row.side}</Badge></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState title="No rebalance rows" detail="There are no executable rebalance actions in the current customer decision projection." />}
        </Panel>
      </div>
      <div className="grid gap-3 xl:grid-cols-[1.3fr_.7fr]">
        <PortfolioSnapshot vm={vm} />
        <BenchmarkPanel vm={vm} />
      </div>
      <div className="grid gap-3 xl:grid-cols-3">
        <PaperLifecyclePanel vm={vm} />
        <Panel title="Recent Decision Receipts" subtitle="Daily cycle history">
          {vm.receipts.length ? vm.receipts.slice(0, 4).map((row: any) => <div key={row.id} className="border-b border-[#22314d] py-2 text-sm text-[#dbe7f8] last:border-0">{fmtDateTime(row.at)}</div>) : <EmptyState title="No receipts" detail="Close a daily cycle to create a receipt." />}
        </Panel>
        <Panel title="Reconciliation & Health" subtitle="Operational checks">
          <StatusRow label="Portfolio reconciliation" value={vm.receipts.length ? "Receipts present" : "Unavailable"} tone={vm.receipts.length ? "good" : "warn"} />
          <StatusRow label="Cash reconciliation" value={vm.hasPaperAccount ? "Read model only" : "Unavailable"} tone={vm.hasPaperAccount ? "warn" : "neutral"} />
          <StatusRow label="Valuation check" value={vm.valuationLabel} tone={availabilityTone(vm.valuationAvailability)} />
          <StatusRow label="Data integrity" value={vm.decisionUnavailable ? FINANCIAL_DATA_UNAVAILABLE : vm.decision ? "Projection returned" : "Unavailable"} tone={vm.decisionUnavailable ? "bad" : vm.decision ? "warn" : "neutral"} />
        </Panel>
      </div>
    </div>
  );
}

function ResearchPage({ vm }: { vm: ReturnType<typeof buildViewModel> }) {
  const scorecards = Array.isArray(vm.runtime?.instrumentScorecards) ? vm.runtime.instrumentScorecards : [];
  const warnings = vm.decision?.researchPublication?.warnings || [];
  return (
    <div className="space-y-3">
      <TopMetrics vm={vm} />
      <div className="grid gap-3 xl:grid-cols-[1.2fr_.8fr]">
        <Panel title="Instrument Scorecards" subtitle="Heuristic validation, not institutional research">
          {scorecards.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {scorecards.map((card: any) => <div key={card.symbol} className="rounded-lg border border-[#22314d] bg-[#081424] p-3"><div className="text-sm font-black text-white">{card.symbol}</div><div className="mt-2 text-3xl font-black text-emerald-300">{num(card.compositeScore).toFixed(0)}</div><div className="mt-1 text-xs text-[#8fa2bf]">Mandate fit: {card.mandateFit || "unknown"}</div><div className="mt-3 flex flex-wrap gap-1">{(card.strengths || []).slice(0, 2).map((s: string) => <Badge key={s} tone="good">{s.replace(/_/g, " ")}</Badge>)}</div></div>)}
            </div>
          ) : <EmptyState title="Scorecards unavailable" detail="No scorecards are present in the canonical runtime payload." />}
        </Panel>
        <BenchmarkPanel vm={vm} />
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        <Panel title="Research Rationale" subtitle="Why eligible instruments fit the current mandate">
          {vm.targetRows.length ? vm.targetRows.map((row: any) => <div key={row.symbol} className="border-b border-[#22314d] py-3 last:border-0"><div className="font-bold text-white">{row.symbol}</div><div className="mt-1 text-sm leading-6 text-[#9fb1ca]">{row.rationale}</div></div>) : <EmptyState title="Rationale unavailable" detail="No target allocation rationale is available yet." />}
        </Panel>
        <Panel title="Warnings & Review Notes" subtitle="Validation notes only">
          {warnings.length ? warnings.slice(0, 8).map((warning: string) => <div key={warning} className="flex gap-3 border-b border-[#22314d] py-3 text-sm last:border-0"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /><span className="text-[#dbe7f8]">{warning}</span></div>) : <EmptyState title="No review notes" detail="No heuristic warnings were returned by the current runtime." />}
          <div className="mt-4 rounded-lg border border-sky-400/20 bg-sky-400/8 p-3 text-xs leading-5 text-sky-100">{vm.decision?.researchPublication?.disclaimer || "This page is validation oriented and does not claim published institutional research."}</div>
        </Panel>
      </div>
    </div>
  );
}

function ReportsPage({ vm }: { vm: ReturnType<typeof buildViewModel> }) {
  const attribution = vm.decision?.performanceAttribution;
  return (
    <div className="space-y-3">
      <TopMetrics vm={vm} />
      <div className="grid gap-3 xl:grid-cols-[1.1fr_.9fr]">
        <Panel title="Portfolio Summary Report" subtitle="Operational snapshot, not live performance">
          <EmptyState title="Historical value series incomplete" detail="The current backend exposes latest value and receipts. It does not yet expose a full time series for charting." />
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <MetricCard icon={<Wallet className="h-4 w-4" />} label="Cash available" value={vm.cashValue} tone={vm.canShowCashValue ? "good" : "warn"} />
            <MetricCard icon={<PieChart className="h-4 w-4" />} label="Holdings estimate" value={vm.canShowPortfolioValue && vm.totalEur !== null ? fmtEUR(Math.max(0, vm.totalEur - vm.cashEur)) : FINANCIAL_DATA_UNAVAILABLE} tone={availabilityTone(vm.valuationAvailability)} />
            <MetricCard icon={<Database className="h-4 w-4" />} label="Price coverage" value={vm.valuationLabel} tone={availabilityTone(vm.valuationAvailability)} />
          </div>
        </Panel>
        <Panel title="Decision & Execution Summary" subtitle="Receipts and Paper lifecycle">
          <div className="grid gap-3 md:grid-cols-2">
            <MetricCard icon={<Target className="h-4 w-4" />} label="Decision receipts" value={vm.receipts.length} tone={vm.receipts.length ? "good" : "warn"} />
            <MetricCard icon={<Activity className="h-4 w-4" />} label="Latest queue" value={vm.queue?.operational_state || "None"} tone={stateTone(vm.queue?.operational_state)} />
            <MetricCard icon={<Wallet className="h-4 w-4" />} label="Paper order" value={vm.order?.status || "None"} tone={stateTone(vm.order?.status)} />
            <MetricCard icon={<ShieldCheck className="h-4 w-4" />} label="Reconciliation" value={vm.receipts.length ? "Receipts present" : "Unavailable"} tone={vm.receipts.length ? "good" : "warn"} />
          </div>
        </Panel>
      </div>
      <div className="grid gap-3 xl:grid-cols-3">
        <Panel title="Activity Timeline" subtitle="Latest daily receipts">
          {vm.receipts.length ? vm.receipts.slice(0, 6).map((row: any) => <div key={row.id} className="border-b border-[#22314d] py-2 text-sm last:border-0"><div className="font-bold text-white">{fmtDateTime(row.at)}</div><div className="text-xs text-[#8fa2bf]">{row.dayKey || row.day_key || "daily cycle"}</div></div>) : <EmptyState title="No activity timeline" detail="No daily-cycle receipts were returned." />}
        </Panel>
        <Panel title="Allocation & Drift Report" subtitle="By asset class">
          <div className="space-y-2">
            {vm.allocationRows.filter((row) => row.currentValueEur > 0 || (row.currentWeight ?? 0) > 0 || row.targetWeight > 0).map((row) => (
              <div key={row.asset} className="flex items-center justify-between gap-3 border-b border-[#22314d] py-2 text-sm last:border-0">
                <span className="inline-flex items-center gap-2 font-bold text-white">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />
                  {row.label}
                </span>
                <span className="text-right text-[#dbe7f8]">{fmtNullablePct(row.currentWeight)} / {row.targetWeight.toFixed(1)}%</span>
                <span className={clsx("text-right font-bold", row.drift === null ? "text-[#8fa2bf]" : Math.abs(row.drift) <= 1 ? "text-emerald-300" : "text-amber-300")}>{row.drift === null ? "Unavailable" : fmtPct(row.drift)}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Cost & Governance Summary" subtitle="Estimated, not realized">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-[#8fa2bf]">Estimated cost</span><span className="font-bold text-white">{fmtEUR(vm.decision?.costs?.estimatedRoundTripCostEur || 0, 2)}</span></div>
            <div className="flex justify-between"><span className="text-[#8fa2bf]">Unrealized PnL</span><span className="font-bold text-white">{attribution?.totalUnrealizedPnlEur == null ? "Unavailable" : fmtEUR(attribution.totalUnrealizedPnlEur, 2)}</span></div>
            <div className="flex justify-between"><span className="text-[#8fa2bf]">Governance</span><span className="font-bold text-white">{vm.decision?.risk?.governanceStatus || "unknown"}</span></div>
          </div>
          <div className="mt-4 rounded-lg border border-sky-400/20 bg-sky-400/8 p-3 text-xs leading-5 text-sky-100">Reports reflect Paper/manual activity and operational snapshots only, not live performance or guaranteed outcomes.</div>
        </Panel>
      </div>
    </div>
  );
}

function AutonomyPage({ vm }: { vm: ReturnType<typeof buildViewModel> }) {
  return (
    <div className="space-y-3">
      <TopMetrics vm={vm} />
      <div className="grid gap-3 xl:grid-cols-[1fr_.8fr]">
        <Panel title="Autonomy Overview / Control Tower" subtitle="Supervised Paper autonomy only" right={<Badge tone="bad">Live investing is blocked</Badge>}>
          <div className="grid gap-3 md:grid-cols-3">
            <MetricCard icon={<ShieldCheck className="h-4 w-4" />} label="Autonomy mode" value="Supervised" detail="Human approval required" tone="info" />
            <MetricCard icon={<Wallet className="h-4 w-4" />} label="Environment" value={vm.hasPaperAccount ? "Paper active" : "Paper setup required"} detail="No live capital route" tone={vm.hasPaperAccount ? "good" : "warn"} />
            <MetricCard icon={<Lock className="h-4 w-4" />} label="Live status" value="Blocked" detail="No broker execution" tone="bad" />
          </div>
          <div className="mt-4 rounded-lg border border-rose-400/25 bg-rose-400/10 p-4 text-sm leading-6 text-rose-100">Live investing is blocked. The system can prepare, review, approve, and track Paper/manual workflows only.</div>
        </Panel>
        <Panel title="Operational Checklist" subtitle="Readiness for supervised Paper autonomy">
          {[
            ["Canonical projection returned", Boolean(vm.decision)],
            ["Approval required", Boolean(vm.decision?.action?.approvalRequired)],
            ["Paper account active", vm.hasPaperAccount],
            ["Data quality high", vm.dataQualityHigh],
            ["Live execution blocked", true],
          ].map(([label, ok]) => <div key={String(label)} className="flex items-center justify-between border-b border-[#22314d] py-2 text-sm last:border-0"><span className="text-[#dbe7f8]">{String(label)}</span>{ok ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <AlertTriangle className="h-4 w-4 text-amber-300" />}</div>)}
        </Panel>
      </div>
      <div className="grid gap-3 xl:grid-cols-3">
        <GovernancePanel vm={vm} />
        <PaperLifecyclePanel vm={vm} />
        <Panel title="Diagnostics & Control" subtitle="No hidden live controls">
          <div className="space-y-2 text-sm">
            <StatusRow label="Shared broker route" value="Blocked in Investing" tone="bad" />
            <StatusRow label="Worker heartbeat" value={vm.order?.updated_at ? fmtDateTime(vm.order.updated_at) : "Unavailable"} tone={vm.order?.updated_at ? "good" : "neutral"} />
            <StatusRow label="Autonomy logs" value={vm.receipts.length ? "Receipts present" : "No recent logs"} tone={vm.receipts.length ? "good" : "warn"} />
          </div>
        </Panel>
      </div>
    </div>
  );
}

function SettingsPage({ vm }: { vm: ReturnType<typeof buildViewModel> }) {
  const settingGroups = [
    ["Account & Execution", [["Environment", vm.hasPaperAccount ? "Paper active" : "Paper setup required"], ["Manual approval", vm.decision?.action?.approvalRequired ? "Required" : "Policy controlled"], ["Paper execution", "Proposal boundary only"], ["Live execution", "Blocked"]]],
    ["Plan Preferences", [["Risk profile", vm.decision?.risk?.riskProfile || "Unavailable"], ["Horizon", vm.decision?.risk?.horizon || "Unavailable"], ["Target policy", vm.allocationRows.map((r) => `${r.label} ${r.targetWeight.toFixed(0)}%`).join(" / ") || "Unavailable"]]],
    ["Valuation & Data Quality", [["Price coverage", vm.valuationLabel], ["Price source status", vm.valuationSource], ["Fallback policy", "Explicitly flagged when used"]]],
    ["Notifications & Reviews", [["Daily reminders", "Not exposed"], ["Proposal expiry alerts", "Not exposed"], ["Approval notifications", "Not exposed"], ["Reconciliation alerts", "Not exposed"]]],
    ["Research & Reporting", [["Research status", vm.decision?.researchPublication?.status || "unavailable"], ["Display currency", "EUR"], ["Report format", "PDF / CSV planned"]]],
    ["Security & Access", [["Security posture", "Managed by account provider"], ["Trusted devices", "Unavailable"], ["Two-factor", "Managed by account provider"]]],
  ];
  return (
    <div className="space-y-3">
      <TopMetrics vm={vm} />
      <div className="rounded-lg border border-sky-400/20 bg-sky-400/8 p-3 text-sm text-sky-100">You are operating in a Paper/manual investing workflow. Settings below do not enable live execution.</div>
      <div className="grid gap-3 xl:grid-cols-[1fr_280px]">
        <div className="grid gap-3 md:grid-cols-2">
          {settingGroups.map(([title, rows]) => (
            <Panel key={String(title)} title={title} subtitle="Controlled Paper/manual setting">
              {(rows as string[][]).map(([label, value]) => (
                <div key={label} className="flex items-center justify-between border-b border-[#22314d] py-2 text-sm last:border-0">
                  <span className="text-[#8fa2bf]">{label}</span>
                  <span className={clsx("font-bold", String(value).toLowerCase().includes("blocked") ? "text-rose-300" : "text-white")}>{value}</span>
                </div>
              ))}
            </Panel>
          ))}
        </div>
        <Panel title="Settings Summary" subtitle="Review key controls at a glance">
          <div className="space-y-3">
            <MetricCard icon={<ShieldCheck className="h-4 w-4" />} label="Account mode" value={vm.hasPaperAccount ? "Paper active" : "Paper setup required"} tone={vm.hasPaperAccount ? "good" : "warn"} />
            <MetricCard icon={<Bell className="h-4 w-4" />} label="Decision flow" value={vm.decision?.action?.approvalRequired ? "Manual approval" : "Policy controlled"} tone="warn" />
            <MetricCard icon={<Lock className="h-4 w-4" />} label="Live execution" value="Blocked" tone="bad" />
          </div>
          <div className="mt-4 rounded-lg border border-[#263650] bg-[#0b1729] px-4 py-3 text-sm font-semibold leading-6 text-[#9fb1ca]">
            Settings reset is not exposed in this Paper/manual dashboard. Enforced controls are read-only here.
          </div>
        </Panel>
      </div>
    </div>
  );
}

export default function InvestingDashboardSurface({ page }: { page: InvestingSurfacePage }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async (shouldApply: () => boolean = () => true) => {
    setLoading(true);
    setError(null);
    const result = await fetchJSON(`/api/investing/dashboard?mode=investing&_=${Date.now()}`);
    if (!shouldApply()) return;
    if (!result.ok) {
      setData(null);
      setError(result.data?.error || "Canonical Investing dashboard unavailable.");
    } else {
      setData(result.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      await loadDashboard(() => !cancelled);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [loadDashboard]);

  const vm = useMemo(() => buildViewModel(data), [data]);
  const body =
    page === "planning" ? <PlanPage vm={vm} /> :
    page === "portfolio" ? <PortfolioPage vm={vm} onRefresh={loadDashboard} /> :
    page === "research" ? <ResearchPage vm={vm} /> :
    page === "reports" ? <ReportsPage vm={vm} /> :
    page === "autonomy" ? <AutonomyPage vm={vm} /> :
    page === "settings" ? <SettingsPage vm={vm} /> :
    <TodayPage vm={vm} />;

  return (
    <Shell page={page} data={data} loading={loading} error={error}>
      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-24 animate-pulse rounded-lg border border-[#22314d] bg-[#0c192d]" />)}
        </div>
      ) : body}
    </Shell>
  );
}
