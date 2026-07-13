import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";

import { isOwnerUserId } from "@/lib/signalcore/owner";
import { readTradeLedgerDetail } from "@/lib/ops/tradeLedger";

export const metadata: Metadata = {
  title: "Trade Detail | Syntrake Ops",
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fmt(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "n/a";
  return `${Math.round(value * 100) / 100}`;
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "n/a";
  return new Date(value).toLocaleString("en-GB", { timeZone: "UTC" });
}

function fmtDuration(ms: number | null | undefined) {
  if (ms == null || !Number.isFinite(ms)) return "n/a";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining > 0 ? `${hours}h ${remaining}m` : `${hours}h`;
}

function tone(status: string | null | undefined) {
  const normalized = String(status || "").toLowerCase();
  if (["won", "accepted", "settled"].includes(normalized)) return "border-emerald-300/40 bg-emerald-400/10 text-emerald-100";
  if (["unavailable_retryable", "open"].includes(normalized)) return "border-amber-300/40 bg-amber-400/10 text-amber-100";
  if (["rejected", "lost", "unavailable", "failed"].includes(normalized)) return "border-red-400/40 bg-red-500/10 text-red-100";
  return "border-slate-600/50 bg-slate-900/70 text-slate-200";
}

function Card({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20">
      <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-500">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-black text-white">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
      <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 text-sm font-bold text-white break-all">{value}</div>
    </div>
  );
}

function PrettyJson({ value }: { value: unknown }) {
  return (
    <pre className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/45 p-4 text-xs leading-6 text-slate-200">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default async function TradeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ tradeId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { userId } = await auth();
  if (!userId || !isOwnerUserId(userId)) {
    return (
      <main className="min-h-screen bg-[#07111f] px-6 py-16 text-white">
        <div className="mx-auto max-w-2xl rounded-[28px] border border-white/10 bg-white/[0.04] p-8">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-slate-500">Trade Ledger</p>
          <h1 className="mt-3 text-3xl font-bold">Owner access required</h1>
        </div>
      </main>
    );
  }

  const { tradeId } = await params;
  const detail = await readTradeLedgerDetail(tradeId);
  const query = new URLSearchParams();
  const search = (await searchParams) || {};
  for (const [key, value] of Object.entries(search)) {
    if (!value) continue;
    query.set(key, Array.isArray(value) ? value[0] || "" : value);
  }

  if (!detail) {
    return (
      <main className="min-h-screen bg-[#07111f] px-6 py-16 text-white">
        <div className="mx-auto max-w-2xl rounded-[28px] border border-white/10 bg-white/[0.04] p-8">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-slate-500">Trade Ledger</p>
          <h1 className="mt-3 text-3xl font-bold">Trade not found</h1>
        </div>
      </main>
    );
  }

  const trade = detail.trade;
  const raw = trade.rawDetails || {};
  const research = raw.paperResearchContext || {};
  const scanner = raw.scannerContext || {};
  const intent = raw.intent || {};
  const execution = raw.execution || {};
  const timeline = raw.timeline || {};
  const outcome = raw.paperOutcome || {};

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#123654_0,#07111f_36%,#030712_100%)] px-5 py-8 text-white md:px-10">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-[32px] border border-white/10 bg-slate-950/50 p-7 shadow-2xl shadow-black/30">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.34em] text-cyan-200/70">Trade Ledger</p>
              <h1 className="mt-3 text-4xl font-black tracking-tight">{trade.instrument}</h1>
              <p className="mt-3 max-w-3xl text-slate-300">
                Full audit surface for one canonical paper trade, reconstructed from canonical storage only.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                href={`/ops/trades${query.toString() ? `?${query.toString()}` : ""}`}
                className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-white hover:bg-white/[0.08]"
              >
                Back to ledger
              </a>
              <span className={`rounded-full border px-4 py-2 text-sm font-bold uppercase ${tone(trade.displayStatus)}`}>
                {trade.displayStatus}
              </span>
            </div>
          </div>
        </header>

        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card eyebrow="Identification" title="Canonical IDs">
            <div className="grid gap-3 md:grid-cols-2">
              <Metric label="Trade ID" value={trade.id} />
              <Metric label="Signal ID" value={trade.signalId || "n/a"} />
              <Metric label="Journal ID" value={trade.journalId || "n/a"} />
              <Metric label="Correlation ID" value={trade.correlationId || "n/a"} />
              <Metric label="Trace ID" value={trade.traceId || "n/a"} />
              <Metric label="User" value={trade.userId} />
              <Metric label="Strategy" value={trade.strategyId || trade.setupType || "n/a"} />
              <Metric label="Timeframe" value={trade.timeframe || "n/a"} />
              <Metric label="Baseline ID" value={trade.baselineId || "n/a"} />
              <Metric label="Idempotency" value={trade.idempotencyKey || "n/a"} />
            </div>
          </Card>

          <Card eyebrow="Settlement" title="Trade economics">
            <div className="grid gap-3 md:grid-cols-2">
              <Metric label="Entry" value={fmt(trade.entryPrice)} />
              <Metric label="Exit" value={fmt(trade.exitPrice)} />
              <Metric label="Stop" value={fmt(trade.stopPrice)} />
              <Metric label="Target" value={fmt(trade.targetPrice)} />
              <Metric label="Risk %" value={trade.riskPct != null ? `${fmt(trade.riskPct)}%` : "n/a"} />
              <Metric label="Risk amount" value={fmt(trade.riskAmount)} />
              <Metric label="PnL" value={fmt(trade.pnlAmount)} />
              <Metric label="Return" value={trade.resultR != null ? `${fmt(trade.resultR)}R` : "n/a"} />
              <Metric label="Holding time" value={fmtDuration(trade.holdingMs)} />
              <Metric label="Closed at" value={fmtDate(trade.settledAt)} />
            </div>
          </Card>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card eyebrow="Timeline" title="Lifecycle reconstruction">
            <div className="space-y-3">
              {detail.timeline.map((event) => (
                <div key={event.id} className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-black text-white">{event.component} · {event.state}</div>
                      <div className="mt-1 text-xs text-slate-400">{fmtDate(event.timestamp)}</div>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.14em] ${tone(event.state)}`}>
                      {event.state}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-4">
                    <Metric label="Reason code" value={event.reasonCode || "n/a"} />
                    <Metric label="Origin" value={event.origin || "n/a"} />
                    <Metric label="Trigger" value={event.triggerSource || "n/a"} />
                    <Metric label="Duration" value={fmtDuration(event.durationMs)} />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card eyebrow="Observability" title="Execution and settlement timing">
            <div className="grid gap-3">
              <Metric label="Decision at" value={fmtDate(trade.decisionAt)} />
              <Metric label="Accepted at" value={fmtDate(trade.acceptedAt)} />
              <Metric label="Execution at" value={fmtDate(trade.executionAt)} />
              <Metric label="Last settlement check" value={fmtDate(trade.lastSettlementAt)} />
              <Metric label="Accepted latency" value={fmtDuration(trade.acceptedLatencyMs)} />
              <Metric label="Execution latency" value={fmtDuration(trade.executionLatencyMs)} />
              <Metric label="Settlement latency" value={fmtDuration(trade.settlementLatencyMs)} />
              <Metric label="Broker" value={trade.broker || "n/a"} />
            </div>
          </Card>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card eyebrow="Research" title="Scientific origin captured with the trade">
            <div className="grid gap-3 md:grid-cols-2">
              <Metric label="Setup type" value={research.setupType || trade.setupType || "n/a"} />
              <Metric label="Setup grade" value={research.setupGrade || "n/a"} />
              <Metric label="Quality score" value={fmt(research.setupQuality)} />
              <Metric label="Maturity" value={research.maturityState || "n/a"} />
              <Metric label="Opportunity window" value={research.opportunityWindow || "n/a"} />
              <Metric label="Timeframe" value={research.timeframe || trade.timeframe || "n/a"} />
              <Metric label="Execution status" value={research.executionStatus || trade.executionStatus || "n/a"} />
              <Metric label="Baseline" value={trade.baselineId || "n/a"} />
            </div>
          </Card>

          <Card eyebrow="Market data" title="Stored market context">
            <div className="grid gap-3 md:grid-cols-2">
              <Metric label="Market source" value={trade.marketSource || "n/a"} />
              <Metric label="Snapshot at" value={fmtDate(scanner.snapshot?.snapshotAt || scanner.snapshot?.timestamp || null)} />
              <Metric label="Session" value={scanner.market?.session?.session || "n/a"} />
              <Metric label="Market type" value={scanner.snapshot?.marketType || "n/a"} />
              <Metric label="Signal source" value={scanner.signal?.source || "n/a"} />
              <Metric label="Signal timestamp" value={fmtDate(scanner.signal?.timestamp || null)} />
              <Metric label="Data symbol" value={raw.scannerSnapshot?.dataSymbol || "n/a"} />
              <Metric label="Provider error" value={raw.scannerSnapshot?.providerError || "n/a"} />
            </div>
          </Card>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card eyebrow="Decision" title="Order intent and execution">
            <div className="grid gap-3 md:grid-cols-2">
              <Metric label="Side" value={trade.side || "n/a"} />
              <Metric label="Execution status" value={execution.status || trade.executionStatus || "n/a"} />
              <Metric label="Trigger source" value={trade.triggerSource || "n/a"} />
              <Metric label="Reason code" value={trade.reasonCode || "n/a"} />
              <Metric label="Estimated entry" value={fmt(intent.estimatedEntry)} />
              <Metric label="Stop loss" value={fmt(intent.stopLoss)} />
              <Metric label="Take profit" value={fmt(intent.takeProfit)} />
              <Metric label="Risk amount" value={fmt(intent.riskAmount)} />
            </div>
            <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/35 p-4 text-sm text-slate-300">
              {execution.message || trade.reasonDetail || "No additional execution message stored."}
            </div>
          </Card>

          <Card eyebrow="Persistence" title="Canonical references">
            <div className="grid gap-3 md:grid-cols-2">
              <Metric label="Journal created at" value={fmtDate(detail.journal?.created_at)} />
              <Metric label="Journal type" value={detail.journal?.type || "n/a"} />
              <Metric label="Lock acquired" value={fmtDate(timeline.lockAcquiredAt)} />
              <Metric label="Lock released" value={fmtDate(timeline.lockReleasedAt)} />
              <Metric label="Persist started" value={fmtDate(timeline.persistStartedAt)} />
              <Metric label="Persist completed" value={fmtDate(timeline.persistCompletedAt)} />
              <Metric label="Settlement started" value={fmtDate(timeline.settlementStartedAt)} />
              <Metric label="Settlement completed" value={fmtDate(timeline.settlementCompletedAt)} />
            </div>
          </Card>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card eyebrow="Runs" title="Related worker runs">
            {detail.runs.length > 0 ? (
              <div className="space-y-3">
                {detail.runs.map((run) => (
                  <div key={run.id} className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-black text-white">{run.run_kind} · {run.lifecycle_status}</div>
                        <div className="mt-1 text-xs text-slate-400">{fmtDate(run.created_at)}</div>
                      </div>
                      <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.14em] ${tone(run.lifecycle_status)}`}>
                        {run.lifecycle_status}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <Metric label="Reason code" value={run.reason_code || "n/a"} />
                      <Metric label="Trigger source" value={run.trigger_source} />
                      <Metric label="Signal ID" value={run.signal_id || "n/a"} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">No related run rows were stored for this trade.</p>
            )}
          </Card>

          <Card eyebrow="Raw payloads" title="Canonical stored JSON">
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-bold text-white">Trade raw details</p>
                <PrettyJson value={trade.rawDetails} />
              </div>
              <div>
                <p className="mb-2 text-sm font-bold text-white">Journal details</p>
                <PrettyJson value={detail.journal?.details || {}} />
              </div>
              <div>
                <p className="mb-2 text-sm font-bold text-white">Stored outcome</p>
                <PrettyJson value={outcome} />
              </div>
            </div>
          </Card>
        </section>
      </div>
    </main>
  );
}
