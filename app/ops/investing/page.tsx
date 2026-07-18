import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";

import { loadInvestingHistoricalAudit } from "@/lib/investing/opsAudit";
import { isOwnerUserId } from "@/lib/signalcore/owner";

export const metadata: Metadata = {
  title: "Investing Ops | Syntrake",
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function tone(status: string) {
  if (status === "blocked" || status === "unstable" || status === "fail") {
    return "border-red-400/30 bg-red-500/10 text-red-100";
  }
  if (status === "review" || status === "watch" || status === "warn") {
    return "border-amber-300/30 bg-amber-400/10 text-amber-100";
  }
  return "border-emerald-300/30 bg-emerald-400/10 text-emerald-100";
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <div className="mt-2 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function Card({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20">
      <p className="text-xs font-bold uppercase tracking-[0.28em] text-slate-500">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-bold text-white">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default async function InvestingOpsPage() {
  const { userId } = await auth();
  if (!userId || !isOwnerUserId(userId)) {
    return (
      <main className="min-h-screen bg-[#07111f] px-6 py-16 text-white">
        <div className="mx-auto max-w-2xl rounded-[28px] border border-white/10 bg-white/[0.04] p-8">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-slate-500">Investing Ops</p>
          <h1 className="mt-3 text-3xl font-bold">Owner access required</h1>
          <p className="mt-3 text-slate-300">This cockpit is limited to configured owner accounts.</p>
        </div>
      </main>
    );
  }

  let data: Awaited<ReturnType<typeof loadInvestingHistoricalAudit>> | null = null;
  let error: string | null = null;
  try {
    data = await loadInvestingHistoricalAudit({ mode: "investing", days: 180 });
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#163045_0,#07111f_35%,#030712_100%)] px-5 py-8 text-white md:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="rounded-[32px] border border-white/10 bg-slate-950/50 p-7 shadow-2xl shadow-black/30">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.34em] text-cyan-200/70">Investing Ops</p>
              <h1 className="mt-3 text-4xl font-black tracking-tight md:text-5xl">Institutional audit cockpit</h1>
              <p className="mt-3 max-w-3xl text-slate-300">
                Historical supervision for mandate snapshots, benchmark-relative validation and rebalance governance.
              </p>
            </div>
            <a
              href="/ops"
              className="rounded-full border border-cyan-200/30 bg-cyan-300/10 px-4 py-2 text-sm font-bold text-cyan-100 transition hover:bg-cyan-300/15"
            >
              Back to Ops
            </a>
          </div>
        </header>

        {error || !data ? (
          <div className="mt-6 rounded-[28px] border border-red-400/30 bg-red-500/10 p-6 text-red-100">
            {error ?? "investing audit unavailable"}
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-6 lg:grid-cols-3">
              <Card eyebrow="Stability" title="Control state">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                  <Metric label="Window" value={`${data.days} days`} />
                  <Metric label="Mode" value={data.mode} />
                  <Metric label="Stability" value={data.audit.summary.stabilityStatus} />
                  <Metric label="Latest validation" value={data.audit.latest.researchStatus} />
                </div>
                <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-semibold ${tone(data.audit.summary.stabilityStatus)}`}>
                  Stability is `{data.audit.summary.stabilityStatus}` based on validation status, turnover and concentration drift.
                </div>
              </Card>

              <Card eyebrow="Coverage" title="Audit sample">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                  <Metric label="Mandates" value={data.audit.coverage.mandateSnapshots} />
                  <Metric label="Rebalances" value={data.audit.coverage.rebalanceLedger} />
                  <Metric label="Research" value={data.audit.coverage.researchSnapshots} />
                  <Metric label="Since" value={new Date(data.since).toLocaleDateString("pt-PT")} />
                </div>
              </Card>

              <Card eyebrow="Latest" title="Current anchor">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                  <Metric label="Objective" value={data.audit.latest.objective ?? "n/a"} />
                  <Metric label="Benchmark" value={data.audit.latest.benchmarkId ?? "n/a"} />
                  <Metric
                    label="Research as of"
                    value={data.audit.latest.researchAsOf ? new Date(data.audit.latest.researchAsOf).toLocaleString("pt-PT") : "n/a"}
                  />
                  <Metric
                    label="Rebalance as of"
                    value={data.audit.latest.rebalanceAsOf ? new Date(data.audit.latest.rebalanceAsOf).toLocaleString("pt-PT") : "n/a"}
                  />
                </div>
              </Card>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <Card eyebrow="Execution" title="Approval queue">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Metric label="Queue rows" value={data.execution.coverage} />
                  <Metric label="Pending" value={data.execution.approvalStatusCounts.pending ?? 0} />
                  <Metric label="Blocked" value={data.execution.decisionCounts.blocked ?? 0} />
                  <Metric label="Approval history" value={data.execution.approvalHistoryCoverage} />
                  <Metric label="Paper clear" value={data.execution.decisionCounts.paper_execute ?? 0} />
                  <Metric label="Overrides" value={data.execution.overrideCount} />
                </div>
              </Card>

              <Card eyebrow="Approvals" title="Pending supervision">
                <div className="space-y-3">
                  {data.execution.pendingApprovals.length ? (
                    data.execution.pendingApprovals.map((entry) => (
                      <div key={`${entry.day_key}-${entry.decision_fingerprint}`} className="rounded-2xl border border-amber-300/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-50">
                        <p className="font-semibold">
                          {entry.execution_decision} | {new Date(entry.as_of).toLocaleString("pt-PT")}
                        </p>
                        <p className="mt-1 text-xs text-amber-100/80">
                          {(Array.isArray(entry.blocking_reasons) ? entry.blocking_reasons : []).join(", ") || "manual review"}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-400">No pending approvals in the selected window.</p>
                  )}
                </div>
              </Card>
            </div>

            <div className="mt-6">
              <Card eyebrow="History" title="Recent approval ledger">
                <div className="space-y-3">
                  {data.execution.recentApprovals.length ? (
                    data.execution.recentApprovals.map((entry) => {
                      const badgeTone = entry.override_applied ? tone("review") : tone(entry.approval_status);
                      return (
                        <div
                          key={`${entry.decision_fingerprint}-${entry.decided_at}`}
                          className={`rounded-2xl border px-4 py-3 text-sm ${badgeTone}`}
                        >
                          <p className="font-semibold">
                            {entry.approval_status}
                            {entry.override_applied ? " | override" : ""}
                          </p>
                          <p className="mt-1 text-xs opacity-80">
                            {new Date(entry.decided_at).toLocaleString("pt-PT")} | {entry.decided_by}
                          </p>
                          {entry.note ? <p className="mt-2 text-xs opacity-90">{entry.note}</p> : null}
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-sm text-slate-400">No approval history in the selected window.</p>
                  )}
                </div>
              </Card>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <Card eyebrow="Risk metrics" title="Portfolio discipline">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Metric label="Avg overlap" value={`${data.audit.summary.averageOverlapWeightPct.toFixed(1)}%`} />
                  <Metric label="Avg active share" value={`${data.audit.summary.averageActiveSharePct.toFixed(1)}%`} />
                  <Metric label="Avg concentration drift" value={`${data.audit.summary.averageConcentrationDriftPct.toFixed(1)}%`} />
                  <Metric label="Max concentration drift" value={`${data.audit.summary.maxConcentrationDriftPct.toFixed(1)}%`} />
                  <Metric label="Avg turnover" value={`${data.audit.summary.averageTurnoverPct.toFixed(1)}%`} />
                  <Metric label="Max turnover" value={`${data.audit.summary.maxTurnoverPct.toFixed(1)}%`} />
                </div>
              </Card>

              <Card eyebrow="Status counts" title="Validation mix">
                <div className="space-y-3">
                  {Object.entries(data.audit.summary.validationStatuses).length ? (
                    Object.entries(data.audit.summary.validationStatuses).map(([key, value]) => (
                      <div key={key} className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm ${tone(key)}`}>
                        <span className="font-semibold">{key}</span>
                        <span>{value}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-400">No validation rows in the selected window.</p>
                  )}
                </div>
              </Card>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-3">
              <Card eyebrow="Objectives" title="Mandate distribution">
                <div className="space-y-3">
                  {Object.entries(data.audit.summary.objectiveCounts).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm">
                      <span className="font-semibold text-white">{key}</span>
                      <span className="text-slate-300">{value}</span>
                    </div>
                  ))}
                </div>
              </Card>

              <Card eyebrow="Reason codes" title="Decision explainability">
                <div className="space-y-3">
                  {Object.entries(data.audit.reasonCodeCounts)
                    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
                    .slice(0, 12)
                    .map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm">
                        <span className="text-slate-200">{key}</span>
                        <span className="font-semibold text-white">{value}</span>
                      </div>
                    ))}
                </div>
              </Card>

              <Card eyebrow="Active bets" title="Recurring deviations">
                <div className="space-y-3">
                  {data.audit.topActiveBets.length ? (
                    data.audit.topActiveBets.map((entry) => (
                      <div key={entry.symbol} className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm">
                        <span className="font-semibold text-white">{entry.symbol}</span>
                        <span className="text-slate-300">{entry.count}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-400">No active bets registered.</p>
                  )}
                </div>
              </Card>
            </div>

            <div className="mt-6">
              <Card eyebrow="Warnings" title="Top recurrent research warnings">
                <div className="grid gap-3 md:grid-cols-2">
                  {data.audit.topWarnings.length ? (
                    data.audit.topWarnings.map((warning) => (
                      <div key={warning.key} className="rounded-2xl border border-amber-300/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-50">
                        <p className="font-semibold">{warning.key}</p>
                        <p className="mt-1 text-xs text-amber-100/80">Occurrences: {warning.count}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-400">No recurrent warnings in the selected window.</p>
                  )}
                </div>
              </Card>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
