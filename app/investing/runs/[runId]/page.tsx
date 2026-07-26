import {
  InvestingCheck,
  InvestingFailurePanel,
  InvestingRuntimeShell,
} from "@/components/investing/InvestingRuntimeUi";
import { loadInvestingRunV1 } from "@/lib/investing/ui/server/loader.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function InvestingRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const data = await loadInvestingRunV1(runId);
  return (
    <InvestingRuntimeShell>
      {data.kind !== "ready" ? (
        <InvestingFailurePanel failure={data} />
      ) : (
        <article
          aria-labelledby="investing-run-detail"
          className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.04] p-6"
        >
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-200/70">
            Detalhe operacional
          </p>
          <h2 id="investing-run-detail" className="mt-2 break-words text-2xl font-bold">
            {data.run.label}
          </h2>
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="text-slate-500">Timestamp</dt><dd>{data.run.occurredAt} UTC</dd></div>
            <div><dt className="text-slate-500">Estado</dt><dd>{data.run.state}</dd></div>
            <div><dt className="text-slate-500">Qualidade</dt><dd>{data.run.quality}</dd></div>
            <div><dt className="text-slate-500">Resultado</dt><dd>{data.run.outcome}</dd></div>
          </dl>
          <section aria-labelledby="investing-run-checks" className="mt-6">
            <h3 id="investing-run-checks" className="text-xl font-bold">Checks oficiais</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <InvestingCheck label="Integrity" value={data.run.integrity} />
              <InvestingCheck label="Verifier" value={data.run.verifier} />
              <InvestingCheck label="Replay" value={data.run.replay} />
            </div>
          </section>
        </article>
      )}
    </InvestingRuntimeShell>
  );
}
