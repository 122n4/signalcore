import type { Metadata } from "next";
import { createProductionShadowParityServiceV1 } from "@/lib/investing/shadow-parity/composition.server";

export const metadata: Metadata = { title: "Shadow Parity | Syntrake" };
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const label = (value: string) => value.replaceAll("_", " ");

export default async function ShadowParityPage() {
  let result;
  try {
    result = await createProductionShadowParityServiceV1().progress();
  } catch {
    result = { ok: false as const, reason: "shadow_parity_progress_failed" };
  }
  if (!result.ok) return <main className="min-h-screen bg-slate-950 p-8 text-white"><section className="mx-auto max-w-3xl rounded-3xl border border-red-300/20 bg-red-500/10 p-8"><p className="text-xs font-bold uppercase tracking-[.25em] text-red-200">Shadow parity</p><h1 className="mt-3 text-3xl font-bold">Read-only status unavailable</h1><p className="mt-3 text-slate-300">The authenticated and allowlisted OPS scope could not be loaded.</p></section></main>;
  const progress = result.value;
  return <main className="min-h-screen bg-[radial-gradient(circle_at_top,#17324a,#020617_52%)] p-6 text-white"><div className="mx-auto max-w-6xl"><header className="rounded-[30px] border border-white/10 bg-slate-950/60 p-7"><p className="text-xs font-bold uppercase tracking-[.3em] text-cyan-200">Phase 7 - legacy cutover evidence</p><h1 className="mt-3 text-4xl font-black">Shadow parity, read only</h1><p className="mt-3 text-slate-300">{progress.consecutivePassedCycles}/30 consecutive daily cycles. This surface cannot run a cycle, cut over reads, remove legacy paths or activate beta.</p></header><section className="mt-6 grid gap-4 md:grid-cols-3"><article className="rounded-3xl border border-white/10 bg-white/[.04] p-5"><p className="text-slate-400">Consecutive</p><p className="mt-2 text-4xl font-black">{progress.consecutivePassedCycles}/30</p></article><article className="rounded-3xl border border-white/10 bg-white/[.04] p-5"><p className="text-slate-400">Cutover gate</p><p className="mt-2 text-2xl font-bold">{progress.readyForCutover ? "Evidence complete" : "Blocked"}</p></article><article className="rounded-3xl border border-white/10 bg-white/[.04] p-5"><p className="text-slate-400">Latest state</p><p className="mt-2 text-2xl font-bold">{progress.latest ? label(progress.latest.state) : "No cycles"}</p></article></section><section className="mt-6 overflow-x-auto rounded-3xl border border-white/10 bg-slate-950/60 p-5"><table className="w-full text-left text-sm"><thead className="text-xs uppercase tracking-wider text-slate-500"><tr><th className="py-3">Day</th><th>State</th><th>Dimensions</th><th>Cycle</th></tr></thead><tbody>{progress.history.map(cycle => <tr key={cycle.cycleId} className="border-t border-white/5"><td className="py-3">{cycle.dayKey}</td><td>{label(cycle.state)}</td><td>{cycle.dimensions.map(dimension => `${label(dimension.dimension)}: ${dimension.state}`).join(" - ")}</td><td className="font-mono text-xs text-slate-500">{cycle.cycleId.slice(0, 24)}...</td></tr>)}</tbody></table></section><p className="mt-5 text-xs text-slate-500">Read only - no raw snapshot payload - no execution controls</p></div></main>;
}
