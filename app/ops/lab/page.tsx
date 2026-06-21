import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";

import LabControlPanel from "./LabControlPanel";
import { buildResearchLabOverview } from "@/lib/ops/researchLabOverview";
import { isOwnerUserId } from "@/lib/signalcore/owner";
import type { ResearchMetricSummary } from "@/lib/trading/research/types";

export const metadata: Metadata = {
  title: "Research Lab | Syntrake Ops",
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function tone(status: string | null | undefined) {
  if (["error", "failed", "fail", "timed_out", "hung"].includes(String(status))) {
    return "border-red-400/40 bg-red-500/10 text-red-100";
  }
  if (["warn", "long_running", "stale", "reject", "blocked"].includes(String(status))) {
    return "border-amber-300/40 bg-amber-400/10 text-amber-100";
  }
  if (["promote", "candidate", "ok", "healthy", "completed"].includes(String(status))) {
    return "border-emerald-300/40 bg-emerald-400/10 text-emerald-100";
  }
  return "border-slate-600/50 bg-slate-900/70 text-slate-200";
}

function fmt(value: number | null | undefined, suffix = "") {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  return `${Math.round(value * 10000) / 10000}${suffix}`;
}

function time(value: string | null | undefined) {
  if (!value) return "n/a";
  return new Date(value).toLocaleString("en-GB", { timeZone: "UTC" });
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
    <section className="rounded-[30px] border border-white/10 bg-white/[0.045] p-6 shadow-2xl shadow-black/20">
      <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-200/60">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-black text-white">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <div className="mt-2 text-lg font-bold text-white">{value}</div>
    </div>
  );
}

function SummaryMetrics({ summary }: { summary: ResearchMetricSummary | null }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Metric label="Trades" value={summary?.totalTrades ?? "n/a"} />
      <Metric label="WR" value={summary ? fmt(summary.winRate, "%") : "n/a"} />
      <Metric label="PF" value={summary ? fmt(summary.profitFactor) : "n/a"} />
      <Metric label="Expectancy" value={summary ? `${fmt(summary.expectancy)}R` : "n/a"} />
      <Metric label="RR" value={summary ? fmt(summary.averageRiskReward) : "n/a"} />
      <Metric label="Max DD" value={summary ? fmt(summary.maxDrawdown) : "n/a"} />
    </div>
  );
}

export default async function ResearchLabPage() {
  const { userId } = await auth();
  if (!userId || !isOwnerUserId(userId)) {
    return (
      <main className="min-h-screen bg-[#07111f] px-6 py-16 text-white">
        <div className="mx-auto max-w-2xl rounded-[28px] border border-white/10 bg-white/[0.04] p-8">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-slate-500">Syntrake Lab</p>
          <h1 className="mt-3 text-3xl font-bold">Owner access required</h1>
          <p className="mt-3 text-slate-300">This research cockpit is limited to configured owner accounts.</p>
        </div>
      </main>
    );
  }

  const lab = await buildResearchLabOverview();
  const totalDecisions = Object.values(lab.decisions.counts).reduce((sum, count) => sum + count, 0);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#17385d_0,#07111f_38%,#030712_100%)] px-5 py-8 text-white md:px-10">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-[34px] border border-white/10 bg-slate-950/55 p-7 shadow-2xl shadow-black/30">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.34em] text-cyan-200/70">Syntrake Research Lab</p>
              <h1 className="mt-3 text-4xl font-black tracking-tight md:text-5xl">Lab control room</h1>
              <p className="mt-3 max-w-3xl text-slate-300">
                Baseline, crise, runtime, decisões e candidatos num cockpit interno. Sem promessas bonitas: só aquilo
                que passou, falhou, ficou pendente ou precisa de reparação.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href="/ops"
                className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-bold text-slate-100 transition hover:bg-white/10"
              >
                Back to Ops
              </a>
              <span className={`rounded-full border px-4 py-2 text-sm font-bold ${tone(lab.runtime.severity)}`}>
                {lab.runtime.severity}
              </span>
            </div>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-4">
            <Metric label="Baseline" value={lab.config.baselineId} />
            <Metric label="Dataset" value={lab.config.datasetProfile} />
            <Metric label="Validation" value={lab.config.validationProfile} />
            <Metric label="Generated UTC" value={time(lab.generatedAt)} />
          </div>
        </header>

        {lab.storage.remoteBacked ? (
          <div className="mt-6 rounded-[28px] border border-emerald-300/30 bg-emerald-400/10 p-5 text-emerald-50">
            <p className="font-black">Remote Research Lab sync active</p>
            <p className="mt-2 text-sm text-emerald-100/80">{lab.storage.note}</p>
          </div>
        ) : !lab.storage.localArtifactBacked ? (
          <div className="mt-6 rounded-[28px] border border-amber-300/30 bg-amber-400/10 p-5 text-amber-50">
            <p className="font-black">Lab artifacts not synced to this runtime</p>
            <p className="mt-2 text-sm text-amber-100/80">{lab.storage.note}</p>
          </div>
        ) : null}

        <LabControlPanel />

        <div className="mt-7 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card eyebrow="Baseline" title="Current live baseline">
            <SummaryMetrics summary={lab.baseline?.live_summary ?? null} />
            <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/35 p-4 text-sm text-slate-300">
              <p>
                <span className="font-bold text-white">Created:</span> {time(lab.baseline?.created_at)}
              </p>
              <p className="mt-1">
                <span className="font-bold text-white">Engine hash:</span>{" "}
                <span className="break-all">{lab.baseline?.engine_manifest_hash ?? "n/a"}</span>
              </p>
            </div>
          </Card>

          <Card eyebrow="Crisis" title="Crisis validation">
            <SummaryMetrics summary={lab.baseline?.crisis_summary ?? null} />
            <p className="mt-4 rounded-2xl border border-amber-300/25 bg-amber-400/10 p-4 text-sm text-amber-100">
              Crisis remains the hard gate. Candidates should not promote unless crisis improves without killing the
              220-320 annual trade cadence.
            </p>
          </Card>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <Card eyebrow="Runtime" title="Supervisor health">
            <div className="grid gap-3">
              <Metric label="Lock" value={lab.runtime.lock.health} />
              <Metric label="Active run" value={lab.runtime.queue.activeRunId ? "running" : "idle"} />
              <Metric label="Stage" value={lab.runtime.activeRun.stage ?? "none"} />
              <Metric label="Stage health" value={lab.runtime.activeRun.stageHealth} />
              <Metric label="Idle reason" value={lab.runtime.queue.idleReason ?? "none"} />
            </div>
            {lab.runtime.alerts.length > 0 ? (
              <div className="mt-4 space-y-2">
                {lab.runtime.alerts.map((alert) => (
                  <p key={alert.id} className={`rounded-2xl border p-3 text-sm ${tone(alert.severity)}`}>
                    {alert.message}
                  </p>
                ))}
              </div>
            ) : null}
          </Card>

          <Card eyebrow="Queue" title="Task pipeline">
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(lab.queue.counts).map(([status, count]) => (
                <Metric key={status} label={status} value={count} />
              ))}
            </div>
          </Card>

          <Card eyebrow="Operator" title="Local controls">
            <div className="space-y-3">
              {lab.operatorActions.map((action) => (
                <div key={action.command} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                  <p className="font-bold text-white">{action.label}</p>
                  <code className="mt-2 block rounded-xl bg-black/35 px-3 py-2 text-xs text-cyan-100">{action.command}</code>
                  <p className="mt-2 text-xs text-slate-400">{action.note}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card eyebrow="Decisions" title="Accepted / promoted watch">
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Total decisions" value={totalDecisions} />
              <Metric label="Promote" value={lab.decisions.counts.promote ?? 0} />
              <Metric label="Candidate" value={lab.decisions.counts.candidate ?? 0} />
            </div>
            <div className="mt-5 space-y-3">
              {lab.decisions.promotedOrCandidate.length > 0 ? lab.decisions.promotedOrCandidate.map((entry) => (
                <div key={`${entry.runId}-${entry.timestamp}`} className={`rounded-2xl border p-4 text-sm ${tone(entry.decision)}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-black">{entry.decision}</p>
                    <p className="text-xs opacity-80">{time(entry.timestamp)}</p>
                  </div>
                  <p className="mt-2">{entry.reason ?? "No reason recorded."}</p>
                  <p className="mt-2 text-xs opacity-80">PF {fmt(entry.aggregateSummary?.profitFactor)} | Crisis PF {fmt(entry.crisisSummary?.profitFactor)} | Score {fmt(entry.rankingScore)}</p>
                </div>
              )) : (
                <p className="rounded-2xl border border-white/10 bg-slate-950/35 p-4 text-sm text-slate-400">
                  No promoted/candidate records yet.
                </p>
              )}
            </div>
          </Card>

          <Card eyebrow="Rejections" title="Rejected / failed candidates">
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Reject" value={lab.decisions.counts.reject ?? 0} />
              <Metric label="Failed" value={lab.decisions.counts.failed ?? 0} />
              <Metric label="Recent shown" value={lab.decisions.rejectedOrFailed.length} />
            </div>
            <div className="mt-5 max-h-[620px] space-y-3 overflow-y-auto pr-1">
              {lab.decisions.rejectedOrFailed.map((entry) => (
                <div key={`${entry.runId}-${entry.timestamp}`} className={`rounded-2xl border p-4 text-sm ${tone(entry.decision)}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-black">{entry.decision}</p>
                    <p className="text-xs opacity-80">{time(entry.timestamp)}</p>
                  </div>
                  <p className="mt-2">{entry.failureSummary ?? entry.reason ?? "No failure reason recorded."}</p>
                  <p className="mt-2 text-xs opacity-80">Campaign {entry.campaignId ?? "n/a"} | Band {entry.rankingBand ?? "n/a"} | Score {fmt(entry.rankingScore)}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card eyebrow="Runs" title="Recent run history">
            <div className="space-y-3">
              {lab.runs.recent.length > 0 ? lab.runs.recent.map((run) => (
                <div key={run.runId} className={`rounded-2xl border p-4 text-sm ${tone(run.status)}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="break-all font-black">{run.runId}</p>
                    <span>{run.status}</span>
                  </div>
                  <p className="mt-2 text-xs opacity-80">Stage {run.stage ?? "n/a"} | Updated {time(run.updatedAt)}</p>
                  {run.error ? <p className="mt-2 text-xs opacity-80">{run.error}</p> : null}
                </div>
              )) : (
                <p className="rounded-2xl border border-white/10 bg-slate-950/35 p-4 text-sm text-slate-400">
                  No run folders available in this runtime.
                </p>
              )}
            </div>
          </Card>

          <Card eyebrow="Queue detail" title="Recent tasks">
            <div className="space-y-3">
              {lab.queue.recentTasks.length > 0 ? lab.queue.recentTasks.map((task) => (
                <div key={task.id} className={`rounded-2xl border p-4 text-sm ${tone(task.status)}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="break-all font-black">{task.id}</p>
                    <span>{task.status}</span>
                  </div>
                  <p className="mt-2 text-xs opacity-80">Type {task.type} | Priority {task.priority} | Decision {task.decision ?? "n/a"}</p>
                  <p className="mt-1 text-xs opacity-80">Campaign {task.campaignId ?? "n/a"} | Objective {task.campaignObjective ?? "n/a"}</p>
                  {task.error ? <p className="mt-2 text-xs opacity-80">{task.error}</p> : null}
                </div>
              )) : (
                <p className="rounded-2xl border border-white/10 bg-slate-950/35 p-4 text-sm text-slate-400">
                  No queue tasks available in this runtime.
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}
