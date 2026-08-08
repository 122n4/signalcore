"use client";

import React, { useEffect, useMemo, useState } from "react";
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

function fmtDateTime(value?: string | null) {
  if (!value) return "Unavailable";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unavailable";
  return date.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
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
  const totalEur = num(portfolio?.totalEur ?? decision?.portfolio?.totalEur);
  const cashEur = num(portfolio?.cashEur ?? decision?.portfolio?.cashEur);
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
    currentByAsset.set(asset, (currentByAsset.get(asset) || 0) + num(item?.valueEur ?? item?.value_eur));
  }
  currentByAsset.set("cash", (currentByAsset.get("cash") || 0) + cashEur);

  const targetByAsset = new Map<string, number>();
  for (const row of targetRows) {
    const asset = normalizeAssetClass(row.assetClass);
    targetByAsset.set(asset, (targetByAsset.get(asset) || 0) + num(row.targetWeightPct));
  }
  const assets = Array.from(new Set(["equity", "bonds", "commodity", "cash", ...Array.from(currentByAsset.keys()), ...Array.from(targetByAsset.keys())]));
  const allocationRows = assets.map((asset) => {
    const currentWeight = totalEur > 0 ? ((currentByAsset.get(asset) || 0) / totalEur) * 100 : 0;
    const targetWeight = targetByAsset.get(asset) || 0;
    return {
      asset,
      label: assetLabel(asset),
      color: assetColors[asset] || "#64748b",
      currentWeight,
      targetWeight,
      drift: currentWeight - targetWeight,
    };
  });
  const coveragePct = num(portfolio?.valuation?.coveragePct ?? decision?.dataQuality?.pricingCoveragePct, items.length ? 0 : 100);
  return {
    decision,
    runtime,
    plan: data?.plan ?? null,
    portfolio,
    items,
    totalEur,
    cashEur,
    targetRows,
    actionRows,
    allocationRows,
    coveragePct,
    queue: data?.daily?.execution?.queue ?? null,
    order: data?.daily?.execution?.order ?? null,
    receipts: Array.isArray(data?.derived?.receiptsTimeline) ? data.derived.receiptsTimeline : [],
    asOf: data?.asOf ?? decision?.asOf ?? null,
    lastSnapshotAt: data?.derived?.lastSnapshotAt ?? data?.daily?.lastSnapshotAt ?? null,
  };
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
              <div className="mt-1 text-[11px] text-[#8da0bd]">{loading ? "Loading" : error ? "Unavailable" : `${vm.coveragePct}% price coverage`}</div>
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
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      <MetricCard icon={<Target className="h-4 w-4" />} label="Active plan" value={vm.plan ? "Active" : "Missing"} detail={vm.decision?.risk?.objective || "Long-term mandate"} tone={vm.plan ? "good" : "warn"} />
      <MetricCard icon={<ShieldCheck className="h-4 w-4" />} label="Account mode" value="Paper active" detail="Manual approval controls" tone="info" />
      <MetricCard icon={<Wallet className="h-4 w-4" />} label="Cash available" value={fmtEUR(vm.cashEur)} detail="Canonical cash balance" tone="good" />
      <MetricCard icon={<BarChart3 className="h-4 w-4" />} label="Portfolio value" value={fmtEUR(vm.totalEur)} detail={`${vm.coveragePct}% price coverage`} tone={vm.coveragePct >= 90 ? "good" : "warn"} />
      <MetricCard icon={<CalendarDays className="h-4 w-4" />} label="Last daily cycle" value={fmtDateTime(vm.lastSnapshotAt)} detail={vm.receipts.length ? `${vm.receipts.length} receipts` : "No receipts yet"} tone={vm.lastSnapshotAt ? "good" : "warn"} />
    </div>
  );
}

function AllocationPanel({ vm }: { vm: ReturnType<typeof buildViewModel> }) {
  const rows = vm.allocationRows.filter((row) => row.currentWeight > 0 || row.targetWeight > 0);
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
                    <td className="py-2 text-right text-[#dbe7f8]">{row.currentWeight.toFixed(1)}%</td>
                    <td className="py-2 text-right text-[#dbe7f8]">{row.targetWeight.toFixed(1)}%</td>
                    <td className={clsx("py-2 text-right font-bold", Math.abs(row.drift) <= 1 ? "text-emerald-300" : row.drift > 0 ? "text-rose-300" : "text-emerald-300")}>{fmtPct(row.drift)}</td>
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
        <Panel title="Today's Decision" subtitle={vm.decision?.summary?.detail || "Canonical decision projection"} right={<Badge tone={stateTone(vm.decision?.state)}>{vm.decision?.state || "setup required"}</Badge>}>
          <div className="space-y-4">
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
              {vm.items.slice(0, compact ? 5 : 12).map((item: any) => {
                const value = num(item.valueEur ?? item.value_eur);
                const weight = vm.totalEur > 0 ? (value / vm.totalEur) * 100 : 0;
                const price = num(item.price);
                return (
                  <tr key={String(item.symbol)}>
                    <td className="py-2 font-bold text-white">{String(item.symbol || "").toUpperCase()}</td>
                    <td className="py-2 text-right text-[#dbe7f8]">{fmtEUR(value)}</td>
                    <td className="py-2 text-right text-[#dbe7f8]">{weight.toFixed(1)}%</td>
                    <td className="py-2 text-right">{price > 0 ? <span className="text-emerald-300">100%</span> : <span className="text-amber-300">Fallback</span>}</td>
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
        <div className="flex items-center justify-between gap-3 text-sm"><span className="text-[#8fa2bf]">Price coverage</span><span className="font-bold text-white">{vm.coveragePct}%</span></div>
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
        <div className="flex justify-between gap-3"><span className="text-[#8fa2bf]">Market data</span><span className="font-bold text-emerald-300">Provider quotes operational</span></div>
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
            <MetricCard icon={<Wallet className="h-4 w-4" />} label="Cash readiness" value={fmtEUR(vm.cashEur)} tone={vm.cashEur > 0 ? "good" : "warn"} />
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

function PortfolioPage({ vm }: { vm: ReturnType<typeof buildViewModel> }) {
  return (
    <div className="space-y-3">
      <TopMetrics vm={vm} />
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
          {["Portfolio reconciliation", "Cash reconciliation", "Valuation check", "Data integrity"].map((row) => <div key={row} className="flex justify-between border-b border-[#22314d] py-2 text-sm last:border-0"><span className="text-[#8fa2bf]">{row}</span><span className="font-bold text-emerald-300">OK</span></div>)}
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
            <MetricCard icon={<Wallet className="h-4 w-4" />} label="Cash available" value={fmtEUR(vm.cashEur)} tone="good" />
            <MetricCard icon={<PieChart className="h-4 w-4" />} label="Holdings estimate" value={fmtEUR(Math.max(0, vm.totalEur - vm.cashEur))} tone="info" />
            <MetricCard icon={<Database className="h-4 w-4" />} label="Price coverage" value={`${vm.coveragePct}%`} tone={vm.coveragePct >= 90 ? "good" : "warn"} />
          </div>
        </Panel>
        <Panel title="Decision & Execution Summary" subtitle="Receipts and Paper lifecycle">
          <div className="grid gap-3 md:grid-cols-2">
            <MetricCard icon={<Target className="h-4 w-4" />} label="Decision receipts" value={vm.receipts.length} tone={vm.receipts.length ? "good" : "warn"} />
            <MetricCard icon={<Activity className="h-4 w-4" />} label="Latest queue" value={vm.queue?.operational_state || "None"} tone={stateTone(vm.queue?.operational_state)} />
            <MetricCard icon={<Wallet className="h-4 w-4" />} label="Paper order" value={vm.order?.status || "None"} tone={stateTone(vm.order?.status)} />
            <MetricCard icon={<ShieldCheck className="h-4 w-4" />} label="Reconciliation" value="Operational" tone="good" />
          </div>
        </Panel>
      </div>
      <div className="grid gap-3 xl:grid-cols-3">
        <Panel title="Activity Timeline" subtitle="Latest daily receipts">
          {vm.receipts.length ? vm.receipts.slice(0, 6).map((row: any) => <div key={row.id} className="border-b border-[#22314d] py-2 text-sm last:border-0"><div className="font-bold text-white">{fmtDateTime(row.at)}</div><div className="text-xs text-[#8fa2bf]">{row.dayKey || row.day_key || "daily cycle"}</div></div>) : <EmptyState title="No activity timeline" detail="No daily-cycle receipts were returned." />}
        </Panel>
        <Panel title="Allocation & Drift Report" subtitle="By asset class">
          <div className="space-y-2">
            {vm.allocationRows.filter((row) => row.currentWeight > 0 || row.targetWeight > 0).map((row) => (
              <div key={row.asset} className="flex items-center justify-between gap-3 border-b border-[#22314d] py-2 text-sm last:border-0">
                <span className="inline-flex items-center gap-2 font-bold text-white">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />
                  {row.label}
                </span>
                <span className="text-right text-[#dbe7f8]">{row.currentWeight.toFixed(1)}% / {row.targetWeight.toFixed(1)}%</span>
                <span className={clsx("text-right font-bold", Math.abs(row.drift) <= 1 ? "text-emerald-300" : "text-amber-300")}>{fmtPct(row.drift)}</span>
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
            <MetricCard icon={<Wallet className="h-4 w-4" />} label="Environment" value="Paper only" detail="No live capital route" tone="good" />
            <MetricCard icon={<Lock className="h-4 w-4" />} label="Live status" value="Blocked" detail="No broker execution" tone="bad" />
          </div>
          <div className="mt-4 rounded-lg border border-rose-400/25 bg-rose-400/10 p-4 text-sm leading-6 text-rose-100">Live investing is blocked. The system can prepare, review, approve, and track Paper/manual workflows only.</div>
        </Panel>
        <Panel title="Operational Checklist" subtitle="Readiness for supervised Paper autonomy">
          {[
            ["Health check passed", vm.coveragePct > 0],
            ["Approval required", Boolean(vm.decision?.action?.approvalRequired)],
            ["Paper account active", true],
            ["Data quality high", vm.coveragePct >= 90],
            ["Live execution blocked", true],
          ].map(([label, ok]) => <div key={String(label)} className="flex items-center justify-between border-b border-[#22314d] py-2 text-sm last:border-0"><span className="text-[#dbe7f8]">{String(label)}</span>{ok ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <AlertTriangle className="h-4 w-4 text-amber-300" />}</div>)}
        </Panel>
      </div>
      <div className="grid gap-3 xl:grid-cols-3">
        <GovernancePanel vm={vm} />
        <PaperLifecyclePanel vm={vm} />
        <Panel title="Diagnostics & Control" subtitle="No hidden live controls">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-[#8fa2bf]">Broker pref</span><span className="font-bold text-white">Read-only disabled</span></div>
            <div className="flex justify-between"><span className="text-[#8fa2bf]">Worker heartbeat</span><span className="font-bold text-white">{vm.order?.updated_at ? fmtDateTime(vm.order.updated_at) : "Unavailable"}</span></div>
            <div className="flex justify-between"><span className="text-[#8fa2bf]">Autonomy logs</span><span className="font-bold text-white">{vm.receipts.length ? "Receipts present" : "No recent logs"}</span></div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function SettingsPage({ vm }: { vm: ReturnType<typeof buildViewModel> }) {
  const settingGroups = [
    ["Account & Execution", [["Environment", "Paper"], ["Manual approval", "Required"], ["Paper execution", "Enforced"], ["Live execution", "Blocked"]]],
    ["Plan Preferences", [["Risk profile", vm.decision?.risk?.riskProfile || "Unavailable"], ["Horizon", vm.decision?.risk?.horizon || "Unavailable"], ["Target policy", vm.allocationRows.map((r) => `${r.label} ${r.targetWeight.toFixed(0)}%`).join(" / ") || "Unavailable"]]],
    ["Valuation & Data Quality", [["Price coverage", `${vm.coveragePct}%`], ["Price source status", vm.decision?.dataQuality?.valuationSource || "unknown"], ["Fallback policy", "Cost basis if quotes unavailable"]]],
    ["Notifications & Reviews", [["Daily reminders", "Enabled"], ["Proposal expiry alerts", "Enabled"], ["Approval notifications", "Enabled"], ["Reconciliation alerts", "Enabled"]]],
    ["Research & Reporting", [["Research status", vm.decision?.researchPublication?.status || "unavailable"], ["Display currency", "EUR"], ["Report format", "PDF / CSV planned"]]],
    ["Security & Access", [["Security posture", "Good"], ["Trusted devices", "Unavailable"], ["Two-factor", "Managed by account provider"]]],
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
            <MetricCard icon={<ShieldCheck className="h-4 w-4" />} label="Account mode" value="Paper only" tone="good" />
            <MetricCard icon={<Bell className="h-4 w-4" />} label="Decision flow" value="Manual approval" tone="warn" />
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

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const result = await fetchJSON(`/api/investing/dashboard?mode=investing&_=${Date.now()}`);
      if (cancelled) return;
      if (!result.ok) {
        setData(null);
        setError(result.data?.error || "Canonical Investing dashboard unavailable.");
      } else {
        setData(result.data);
      }
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const vm = useMemo(() => buildViewModel(data), [data]);
  const body =
    page === "planning" ? <PlanPage vm={vm} /> :
    page === "portfolio" ? <PortfolioPage vm={vm} /> :
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
