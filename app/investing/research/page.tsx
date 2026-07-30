import type {Metadata} from "next";
import {createProductionResearchOpsServiceV1} from
 "@/lib/investing/research/ops/composition.server";
export const metadata:Metadata={title:"Research Lab Ops | Syntrake"};
export const runtime="nodejs";export const dynamic="force-dynamic";
const label=(v:string)=>v.replaceAll("_"," ");
export default async function ResearchLabOpsPage(){
 let result:Awaited<ReturnType<ReturnType<typeof createProductionResearchOpsServiceV1>["load"]>>;
 try{result=await createProductionResearchOpsServiceV1().load();}
 catch{result={ok:false,reason:"research_ops_read_failed"};}
 if(!result.ok)return <main className="min-h-screen bg-slate-950 p-8 text-white">
  <section className="mx-auto max-w-3xl rounded-3xl border border-red-300/20 bg-red-500/10 p-8">
   <p className="text-xs font-bold uppercase tracking-[.25em] text-red-200">Research Lab</p>
   <h1 className="mt-3 text-3xl font-bold">Observability unavailable</h1>
   <p className="mt-3 text-slate-300">The authenticated research scope could not be read.</p>
  </section></main>;
 const snapshot=result.value;
 return <main className="min-h-screen bg-[radial-gradient(circle_at_top,#15334a,#020617_48%)] p-5 text-white md:p-10">
  <div className="mx-auto max-w-7xl">
   <header className="rounded-[32px] border border-white/10 bg-slate-950/60 p-7">
    <p className="text-xs font-bold uppercase tracking-[.3em] text-cyan-200">Investing Research Lab</p>
    <h1 className="mt-3 text-4xl font-black">Scientific operations, read only</h1>
    <p className="mt-3 max-w-3xl text-slate-300">Datasets, jobs, experiments, failures, reports, decisions and promotion status for the authenticated scope. This surface cannot decide science or promote candidates.</p>
    <p className="mt-4 text-xs text-slate-500">Snapshot {new Date(snapshot.generatedAt).toLocaleString("pt-PT")}</p>
   </header>
   <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    {snapshot.counts.map(item=><article key={`${item.category}:${item.state}`}
     className="rounded-2xl border border-white/10 bg-white/[.04] p-5">
     <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label(item.category)}</p>
     <p className="mt-3 text-3xl font-black">{item.count}</p>
     <p className="mt-1 text-sm text-cyan-100">{label(item.state)}</p>
    </article>)}
   </section>
   <section className="mt-6 rounded-[28px] border border-white/10 bg-slate-950/55 p-6">
    <h2 className="text-2xl font-bold">Recent scoped activity</h2>
    <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm">
     <thead className="text-xs uppercase tracking-wider text-slate-500"><tr>
      <th className="py-3">Area</th><th>Identifier</th><th>State</th><th>Observed</th><th>Reason</th>
     </tr></thead><tbody>{snapshot.recent.map((row,index)=><tr
      key={`${row.category}:${row.id}:${index}`} className="border-t border-white/5">
      <td className="py-3 text-slate-300">{label(row.category)}</td>
      <td className="max-w-72 truncate font-mono text-xs text-slate-400">{row.id}</td>
      <td className="text-cyan-100">{label(row.state)}</td>
      <td className="text-slate-400">{row.occurredAt?new Date(row.occurredAt).toLocaleString("pt-PT"):"—"}</td>
      <td className="text-slate-400">{row.reasonCode??"—"}</td>
     </tr>)}</tbody>
    </table></div>
   </section>
  </div>
 </main>;
}
