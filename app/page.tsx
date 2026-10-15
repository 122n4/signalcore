import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "SYNTRAKE — clareza para decisões mais disciplinadas",
  description: "Conhece a SYNTRAKE: contexto, risco e próximos passos apresentados de forma clara.",
};

function Panel({ title, eyebrow, children }: { title: string; eyebrow: string; children: ReactNode }) {
  return (
    <article className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(12,24,66,0.78),rgba(8,17,42,0.86))] p-5 shadow-[0_24px_80px_rgba(6,12,40,0.3)] md:p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-cyan-100/55">{eyebrow}</p>
      <h3 className="mt-2 text-2xl font-semibold tracking-tight text-white">{title}</h3>
      <div className="mt-5 overflow-hidden rounded-[22px] border border-white/10 bg-[#0a1534]/90 p-4">{children}</div>
    </article>
  );
}

function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "blue" | "amber" | "green" }) {
  const styles = {
    neutral: "border-white/10 bg-white/[0.04] text-white/70",
    blue: "border-cyan-300/20 bg-cyan-300/10 text-cyan-100",
    amber: "border-amber-300/20 bg-amber-300/10 text-amber-100",
    green: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
  };
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${styles[tone]}`}>{children}</span>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/8 bg-white/[0.035] p-3"><p className="text-[10px] uppercase tracking-[0.16em] text-white/40">{label}</p><p className="mt-2 text-lg font-semibold text-white">{value}</p></div>;
}

function MiniBars() {
  return <div className="flex h-28 items-end gap-2">{[38, 54, 45, 72, 61, 82, 68, 90, 76, 96].map((height, index) => <div key={index} className="flex-1 rounded-t-md bg-gradient-to-t from-blue-600 to-cyan-200" style={{ height: `${height}%` }} />)}</div>;
}

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#07111f] text-white">
      <section className="relative mx-auto max-w-7xl px-6 pb-20 pt-8 md:pt-12">
        <div className="absolute inset-x-0 top-0 -z-0 h-[620px] bg-[radial-gradient(circle_at_50%_0%,rgba(44,103,255,0.24),transparent_60%)]" />
        <nav className="relative z-10 flex items-center justify-between border-b border-white/10 pb-5">
          <Link href="/" className="flex items-center gap-3 text-lg font-semibold tracking-tight"><span className="h-7 w-7 rounded-full bg-[radial-gradient(circle_at_30%_30%,#67afff,#275cff)] shadow-[0_0_24px_rgba(73,123,255,0.42)]" />SYNTRAKE</Link>
          <div className="hidden items-center gap-6 text-sm text-white/65 md:flex"><a href="#product" className="hover:text-white">Produto</a><a href="#decision" className="hover:text-white">Decisão</a><Link href="/how-it-works" className="hover:text-white">Como funciona</Link><Link href="/pricing" className="hover:text-white">Pricing</Link></div>
          <div className="flex items-center gap-3 text-sm font-semibold"><Link href="/sign-in" className="hidden text-white/70 hover:text-white sm:inline">Entrar</Link><Link href="/sign-up" className="rounded-xl bg-white px-4 py-2 text-[#07111f]">Começar</Link></div>
        </nav>

        <div className="relative z-10 mx-auto max-w-4xl py-24 text-center md:py-32">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200/75">SYNTRAKE · DECISION CLARITY</p>
          <h1 className="mt-6 text-5xl font-black tracking-[-0.04em] md:text-7xl">Menos ruído.<br /><span className="text-cyan-200">Mais clareza para decidir.</span></h1>
          <p className="mx-auto mt-7 max-w-2xl text-lg leading-8 text-white/65">A SYNTRAKE organiza contexto, risco e próximos passos para tornares o teu processo mais consistente — sem esconder os limites da informação.</p>
          <div className="mt-9 flex flex-wrap justify-center gap-3"><Link href="/sign-up" className="rounded-2xl bg-[linear-gradient(135deg,#3f82ff,#5ea1ff)] px-6 py-3 text-sm font-semibold shadow-[0_12px_36px_rgba(49,115,255,0.28)]">Explorar SYNTRAKE</Link><Link href="/how-it-works" className="rounded-2xl border border-white/15 bg-white/[0.04] px-6 py-3 text-sm font-semibold text-white/85">Ver como funciona</Link></div>
          <p className="mt-5 text-xs text-white/40">Demonstrações informativas. Não constituem recomendação financeira.</p>
        </div>

        <section id="decision" className="relative z-10 rounded-[32px] border border-white/10 bg-white/[0.035] p-4 shadow-[0_30px_120px_rgba(0,0,0,0.3)] md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4"><div><p className="text-[10px] uppercase tracking-[0.22em] text-white/40">Decision workspace · preview</p><p className="mt-1 text-sm font-semibold text-white/85">Uma leitura compacta do que merece atenção agora</p></div><div className="flex gap-2"><Tag tone="blue">Contexto visível</Tag><Tag>Demo</Tag></div></div>
          <div className="grid gap-4 pt-5 lg:grid-cols-[1.35fr_0.65fr]"><div className="rounded-2xl border border-white/8 bg-[#0a1534]/80 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[0.18em] text-white/40">Próximo passo</p><p className="mt-2 text-3xl font-semibold text-amber-200">REVER RISCO</p></div><Tag tone="amber">Atenção elevada</Tag></div><p className="mt-4 max-w-2xl text-sm leading-6 text-white/60">A informação disponível deve ser revista antes de qualquer decisão. A SYNTRAKE torna explícitos o contexto, a confiança e o que ainda falta confirmar.</p><div className="mt-5 grid gap-3 sm:grid-cols-3"><Metric label="Confiança" value="42%" /><Metric label="Próxima revisão" value="2h" /><Metric label="Estado" value="A rever" /></div></div><div className="rounded-2xl border border-white/8 bg-[#0a1738]/80 p-5"><p className="text-[10px] uppercase tracking-[0.18em] text-white/40">Sinal de processo</p><p className="mt-3 text-2xl font-semibold text-cyan-200">Esperar também é decidir</p><p className="mt-3 text-sm leading-6 text-white/55">Quando a informação não é suficientemente clara, o próximo passo pode ser não agir.</p></div></div>
        </section>
      </section>

      <section id="product" className="mx-auto max-w-7xl px-6 py-24"><div className="max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-200/65">O produto</p><h2 className="mt-4 text-4xl font-bold tracking-tight md:text-5xl">Uma visão coerente do teu processo.</h2><p className="mt-5 text-base leading-7 text-white/60">Os painéis seguintes são demonstrações visuais da proposta SYNTRAKE. O estado real de cada funcionalidade depende da versão disponível no produto.</p></div><div className="mt-12 grid gap-5 lg:grid-cols-2">
        <Panel eyebrow="Trading · demo" title="Lê o fluxo antes de agir"><div className="flex items-center justify-between"><Tag tone="blue">Radar informativo</Tag><span className="text-xs text-white/40">Atualização pendente</span></div><div className="mt-5"><MiniBars /></div><div className="mt-4 grid grid-cols-3 gap-2"><Metric label="Atenção" value="Alta" /><Metric label="Contexto" value="Misto" /><Metric label="Ação" value="Rever" /></div></Panel>
        <Panel eyebrow="Investing · demo" title="Mantém o plano visível"><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-white/8 p-4"><p className="text-[10px] uppercase tracking-[0.15em] text-white/40">Objetivo</p><p className="mt-2 text-xl font-semibold">Plano em revisão</p><p className="mt-2 text-xs text-white/50">Contexto e horizonte apresentados num só lugar.</p></div><div className="rounded-xl border border-white/8 p-4"><p className="text-[10px] uppercase tracking-[0.15em] text-white/40">Guardrails</p><p className="mt-2 text-xl font-semibold text-emerald-200">Definidos</p><p className="mt-2 text-xs text-white/50">Limites visíveis antes do próximo passo.</p></div></div><div className="mt-4 h-2 rounded-full bg-white/10"><div className="h-full w-[68%] rounded-full bg-gradient-to-r from-cyan-400 to-blue-500" /></div></Panel>
        <Panel eyebrow="Portfolio · demo" title="Percebe a concentração"><div className="grid grid-cols-2 gap-3"><Metric label="Diversificação" value="Em análise" /><Metric label="Exposição" value="Monitorizada" /></div><div className="mt-4 space-y-3">{[["Contexto principal", "68%"], ["Alternativas", "42%"], ["Reserva", "24%"]].map(([label, value]) => <div key={label}><div className="mb-1 flex justify-between text-xs text-white/60"><span>{label}</span><span>{value}</span></div><div className="h-2 rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-300" style={{ width: value }} /></div></div>)}</div></Panel>
        <Panel eyebrow="Advisor · demo" title="Transforma contexto em perguntas úteis"><div className="space-y-3"><div className="rounded-xl border border-cyan-300/15 bg-cyan-300/[0.06] p-4 text-sm text-cyan-50">O que mudou desde a última revisão?</div><div className="rounded-xl border border-white/8 p-4 text-sm text-white/65">Que informação falta confirmar antes de decidir?</div><div className="rounded-xl border border-white/8 p-4 text-sm text-white/65">Qual é o próximo passo mais simples?</div></div></Panel>
        <Panel eyebrow="Risk · demo" title="Torna o risco explícito"><div className="flex items-center gap-5"><div className="flex h-28 w-28 items-center justify-center rounded-full border-[10px] border-amber-300/30 border-t-amber-200 text-2xl font-bold">72</div><div><p className="font-semibold text-amber-100">Revisão necessária</p><p className="mt-2 text-sm leading-6 text-white/55">A apresentação do risco é informativa e não substitui aconselhamento profissional.</p></div></div></Panel>
        <Panel eyebrow="Automation · demo" title="Repete o que funciona"><div className="space-y-3"><div className="flex items-center justify-between rounded-xl border border-white/8 p-4"><span className="text-sm text-white/75">Revisão semanal</span><Tag tone="green">Preparada</Tag></div><div className="flex items-center justify-between rounded-xl border border-white/8 p-4"><span className="text-sm text-white/75">Alertas de contexto</span><Tag>Configurável</Tag></div><div className="flex items-center justify-between rounded-xl border border-white/8 p-4"><span className="text-sm text-white/75">Memória do processo</span><Tag tone="blue">Em evolução</Tag></div></div></Panel>
      </div></section>

      <section className="border-y border-white/10 bg-[#09152d] px-6 py-24"><div className="mx-auto max-w-5xl text-center"><p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-200/65">Sem caixa negra</p><h2 className="mt-4 text-4xl font-bold tracking-tight md:text-5xl">A decisão continua a ser tua.</h2><p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-white/60">A SYNTRAKE apresenta contexto, limites e perguntas. Não promete resultados e não executa decisões financeiras a partir desta landing.</p><div className="mt-9 flex flex-wrap justify-center gap-3"><Link href="/sign-up" className="rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-[#07111f]">Começar gratuitamente</Link><Link href="/pricing" className="rounded-2xl border border-white/15 px-6 py-3 text-sm font-semibold text-white/85">Ver pricing</Link></div></div></section>

      <footer className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5 px-6 py-10 text-sm text-white/45"><span>© SYNTRAKE</span><div className="flex flex-wrap gap-5"><Link href="/how-it-works" className="hover:text-white">Como funciona</Link><Link href="/why-syntrake" className="hover:text-white">Porque SYNTRAKE</Link><Link href="/terms" className="hover:text-white">Termos</Link><Link href="/privacy" className="hover:text-white">Privacidade</Link></div></footer>
    </main>
  );
}
