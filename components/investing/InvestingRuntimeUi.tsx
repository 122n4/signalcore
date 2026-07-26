import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Ban,
  CheckCircle2,
  CircleHelp,
  Database,
  History,
  ShieldCheck,
} from "lucide-react";

import type {
  InvestingUiCheckV1,
  InvestingUiDashboardV1,
  InvestingUiFailureV1,
  InvestingUiRunV1,
  InvestingUiRunsV1,
} from "@/lib/investing/ui";

const STATES = {
  healthy: {
    icon: CheckCircle2,
    label: "Saudável",
    tone: "border-emerald-300/30 bg-emerald-400/10 text-emerald-100",
  },
  degraded: {
    icon: AlertTriangle,
    label: "Parcial",
    tone: "border-amber-300/30 bg-amber-400/10 text-amber-100",
  },
  blocked: {
    icon: Ban,
    label: "Bloqueado",
    tone: "border-red-300/30 bg-red-400/10 text-red-100",
  },
  empty: {
    icon: Database,
    label: "Sem runs",
    tone: "border-blue-300/30 bg-blue-400/10 text-blue-100",
  },
  unknown: {
    icon: CircleHelp,
    label: "Não determinado",
    tone: "border-slate-300/20 bg-slate-400/10 text-slate-100",
  },
} as const;

const CHECK_LABEL: Readonly<Record<InvestingUiCheckV1, string>> = {
  pass: "Concluído",
  failed: "Falhou",
  blocked: "Bloqueado",
  incomplete: "Incompleto",
};

export function InvestingRuntimeShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#123654_0,#07111f_36%,#030712_100%)] px-4 py-7 text-white sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-5 rounded-[30px] border border-white/10 bg-slate-950/55 p-6 shadow-2xl shadow-black/30 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.32em] text-cyan-200/70">
              Syntrake
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Investing</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300 sm:text-base">
              Consulta read-only do âmbito Investing autenticado.
            </p>
          </div>
          <nav aria-label="Navegação Investing" className="flex flex-wrap gap-2">
            <NavLink href="/investing">Visão geral</NavLink>
            <NavLink href="/investing/runs">Histórico</NavLink>
            <NavLink href="/app">Produto</NavLink>
          </nav>
        </header>
        {children}
      </div>
    </main>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      className="rounded-full border border-white/10 px-4 py-2 text-sm font-bold hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
      href={href}
    >
      {children}
    </Link>
  );
}

export function InvestingFailurePanel({ failure }: { failure: InvestingUiFailureV1 }) {
  return (
    <section
      aria-labelledby="investing-failure-title"
      className="mt-6 rounded-[28px] border border-amber-300/30 bg-amber-400/10 p-6 text-amber-50"
    >
      <AlertTriangle aria-hidden="true" className="h-6 w-6" />
      <h2 id="investing-failure-title" className="mt-3 text-2xl font-bold">
        {failure.title}
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-amber-100/85">
        {failure.description}
      </p>
    </section>
  );
}

function StateBadge({ state }: Pick<InvestingUiDashboardV1, "state">) {
  const item = STATES[state];
  const Icon = item.icon;
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-bold ${item.tone}`}>
      <Icon aria-hidden="true" className="h-4 w-4" />
      {item.label}
    </span>
  );
}

export function InvestingCheck({
  label,
  value,
}: {
  label: string;
  value: InvestingUiCheckV1;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-2 flex items-center gap-2 font-semibold text-white">
        <ShieldCheck aria-hidden="true" className="h-4 w-4 text-cyan-300" />
        {CHECK_LABEL[value]}
      </p>
    </div>
  );
}

export function InvestingRunCard({ run }: { run: InvestingUiRunV1 }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-slate-950/35 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-bold text-white">{run.label}</h3>
          <p className="mt-1 text-sm text-slate-400">{run.occurredAt} UTC</p>
        </div>
        <span className="w-fit rounded-full border border-white/10 px-3 py-1 text-xs font-bold text-slate-200">
          {run.state}
        </span>
      </div>
      <p className="mt-4 text-sm text-slate-300">Qualidade: {run.quality}</p>
      <Link
        className="mt-4 inline-flex items-center gap-2 rounded-full border border-cyan-200/25 bg-cyan-300/10 px-4 py-2 text-sm font-bold text-cyan-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
        href={`/investing/runs/${encodeURIComponent(run.runId)}`}
      >
        Ver detalhe <Activity aria-hidden="true" className="h-4 w-4" />
      </Link>
    </article>
  );
}

export function InvestingDashboard({ data }: { data: InvestingUiDashboardV1 }) {
  return (
    <>
      <section
        aria-labelledby="investing-operational-state"
        className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.04] p-6"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="investing-operational-state" className="text-2xl font-bold">
              {data.title}
            </h2>
            <p className="mt-2 text-slate-300">{data.description}</p>
            <p className="mt-2 text-sm text-slate-500">Snapshot: {data.generatedAt} UTC</p>
          </div>
          <StateBadge state={data.state} />
        </div>
      </section>

      <section aria-labelledby="investing-checks" className="mt-6">
        <h2 id="investing-checks" className="text-2xl font-bold">Checks oficiais</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <InvestingCheck label="Integrity" value={data.integrity} />
          <InvestingCheck label="Verifier" value={data.verifier} />
          <InvestingCheck label="Replay" value={data.replay} />
        </div>
      </section>

      <section
        aria-labelledby="investing-metrics"
        className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.04] p-6"
      >
        <h2 id="investing-metrics" className="text-2xl font-bold">Métricas oficiais</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {data.metrics.map((metric) => (
            <div key={metric.key} className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                {metric.label}
              </p>
              <p className="mt-2 text-xl font-bold">{metric.displayValue}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="investing-latest-run" className="mt-6">
        <div className="flex items-center justify-between gap-4">
          <h2 id="investing-latest-run" className="text-2xl font-bold">Último run</h2>
          <Link className="inline-flex items-center gap-2 text-sm font-bold text-cyan-200" href="/investing/runs">
            Histórico <History aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-4">
          {data.latestRun ? (
            <InvestingRunCard run={data.latestRun} />
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
              <h3 className="font-bold">Sem runs</h3>
              <p className="mt-2 text-sm text-slate-400">
                Não existe atividade Investing para apresentar.
              </p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

export function InvestingRunHistory({ data }: { data: InvestingUiRunsV1 }) {
  return (
    <section aria-labelledby="investing-run-history" className="mt-6">
      <h2 id="investing-run-history" className="text-2xl font-bold">Histórico de runs</h2>
      <p className="mt-2 text-sm text-slate-400">
        Até 50 runs oficiais, em ordenação determinística. Snapshot: {data.generatedAt} UTC.
      </p>
      {data.runs.length > 0 ? (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {data.runs.map((run) => <InvestingRunCard key={run.runId} run={run} />)}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-6">
          <h3 className="font-bold">Sem runs</h3>
          <p className="mt-2 text-sm text-slate-400">
            Não existe atividade Investing para apresentar.
          </p>
        </div>
      )}
    </section>
  );
}
