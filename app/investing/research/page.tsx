import type { Metadata } from "next";
import { createProductionResearchOpsServiceV1 } from "@/lib/investing/research/ops/composition.server";

export const metadata: Metadata = { title: "Investing Research | Syntrake" };
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const label = (value: string) => value.replaceAll("_", " ");

export default async function ResearchPage() {
  let result: Awaited<ReturnType<ReturnType<typeof createProductionResearchOpsServiceV1>["load"]>>;
  try {
    result = await createProductionResearchOpsServiceV1().load();
  } catch {
    result = { ok: false, reason: "research_ops_read_failed" };
  }

  if (!result.ok) {
    return (
      <main className="min-h-screen bg-slate-950 p-8 text-white">
        <section className="mx-auto max-w-3xl rounded-3xl border border-red-300/20 bg-red-500/10 p-8">
          <p className="text-xs font-bold uppercase tracking-[.25em] text-red-200">Investing Research</p>
          <h1 className="mt-3 text-3xl font-bold">Research evidence unavailable</h1>
          <p className="mt-3 text-slate-300">The authenticated research scope could not be read. No decision is opened from unavailable evidence.</p>
        </section>
      </main>
    );
  }

  const snapshot = result.value;
  const total = snapshot.counts.reduce((sum, item) => sum + item.count, 0);
  const requiresAttention = snapshot.counts
    .filter((item) => ["failed", "blocked"].includes(item.state))
    .reduce((sum, item) => sum + item.count, 0);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#15334a,#020617_48%)] p-5 text-white md:p-10">
      <div className="mx-auto max-w-6xl">
        <header className="rounded-[32px] border border-white/10 bg-slate-950/60 p-6 md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.3em] text-cyan-200">Investing Research</p>
              <h1 className="mt-3 text-3xl font-black md:text-4xl">Evidence behind the portfolio</h1>
              <p className="mt-3 max-w-2xl text-slate-300">A read-only view of the research supporting Investing. Research can inform a decision, but it cannot place an order or activate a strategy.</p>
            </div>
            <a href="/app?mode=investing&tab=daily" className="rounded-xl bg-cyan-200 px-4 py-3 text-center text-sm font-black text-slate-950">Back to Overview</a>
          </div>
        </header>

        <section className="mt-6 grid gap-3 sm:grid-cols-3">
          <Summary label="Evidence records" value={String(total)} />
          <Summary label="Requires attention" value={String(requiresAttention)} tone={requiresAttention > 0 ? "warn" : "good"} />
          <Summary label="Last updated" value={new Date(snapshot.generatedAt).toLocaleDateString("pt-PT")} />
        </section>

        <details className="mt-6 rounded-[28px] border border-white/10 bg-slate-950/55 p-5 md:p-6">
          <summary className="cursor-pointer text-lg font-bold">Research status by area</summary>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {snapshot.counts.map((item) => (
              <article key={`${item.category}:${item.state}`} className="rounded-2xl border border-white/10 bg-white/[.04] p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label(item.category)}</p>
                <p className="mt-2 text-2xl font-black">{item.count}</p>
                <p className="mt-1 text-sm text-cyan-100">{label(item.state)}</p>
              </article>
            ))}
          </div>
        </details>

        <details className="mt-4 rounded-[28px] border border-white/10 bg-slate-950/55 p-5 md:p-6">
          <summary className="cursor-pointer text-lg font-bold">Recent research activity</summary>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-slate-500"><tr><th className="py-3">Area</th><th>Identifier</th><th>State</th><th>Observed</th><th>Reason</th></tr></thead>
              <tbody>{snapshot.recent.map((row, index) => (
                <tr key={`${row.category}:${row.id}:${index}`} className="border-t border-white/5">
                  <td className="py-3 text-slate-300">{label(row.category)}</td>
                  <td className="max-w-72 truncate font-mono text-xs text-slate-400">{row.id}</td>
                  <td className="text-cyan-100">{label(row.state)}</td>
                  <td className="text-slate-400">{row.occurredAt ? new Date(row.occurredAt).toLocaleString("pt-PT") : "—"}</td>
                  <td className="text-slate-400">{row.reasonCode ?? "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </details>
      </div>
    </main>
  );
}

function Summary({ label: summaryLabel, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "good" | "warn" }) {
  const color = tone === "good" ? "text-emerald-200" : tone === "warn" ? "text-amber-200" : "text-white";
  return (
    <article className="rounded-2xl border border-white/10 bg-slate-950/55 p-5">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{summaryLabel}</p>
      <p className={`mt-2 text-2xl font-black ${color}`}>{value}</p>
    </article>
  );
}
