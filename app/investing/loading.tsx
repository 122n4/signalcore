import { InvestingRuntimeShell } from "@/components/investing/InvestingRuntimeUi";

export default function InvestingLoading() {
  return (
    <InvestingRuntimeShell>
      <section aria-busy="true" aria-live="polite" className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
        <h2 className="text-2xl font-bold">A carregar Investing</h2>
        <p className="mt-2 text-slate-300">A obter informação oficial do âmbito autenticado.</p>
      </section>
    </InvestingRuntimeShell>
  );
}
