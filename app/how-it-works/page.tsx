import type { Metadata } from "next";
import Link from "next/link";
import Faq from "@/components/commercial/Faq";

export const metadata: Metadata = {
  title: "Como funciona | SYNTRAKE",
  description: "Conhece o fluxo informativo da SYNTRAKE e a forma como o produto organiza decisões.",
};

export default function HowItWorksPage() {
  return (
    <main className="min-h-screen bg-white px-6 py-16 text-zinc-950">
      <div className="mx-auto max-w-5xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">SYNTRAKE</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-black tracking-tight md:text-6xl">Decisões mais claras, num fluxo que consegues acompanhar.</h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-700">A SYNTRAKE organiza contexto, prioridades e próximos passos para que o utilizador compreenda o processo antes de agir.</p>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {["Define o contexto", "Revê o que mudou", "Escolhe o próximo passo"].map((title, index) => (
            <section key={title} className="rounded-3xl border border-zinc-200 bg-zinc-50 p-6">
              <p className="text-xs font-bold text-zinc-500">0{index + 1}</p>
              <h2 className="mt-4 text-xl font-bold">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-zinc-700">O produto mantém a informação relevante visível e separa contexto de ação para reduzir decisões apressadas.</p>
            </section>
          ))}
        </div>
        <section className="mt-12 rounded-3xl border border-zinc-200 p-6 md:p-8">
          <h2 className="text-2xl font-bold">Perguntas frequentes</h2>
          <div className="mt-6"><Faq /></div>
        </section>
        <nav className="mt-8 flex flex-wrap gap-4 text-sm font-semibold underline">
          <Link href="/">Voltar à página inicial</Link>
          <Link href="/pricing">Ver pricing</Link>
          <Link href="/why-syntrake">Porque SYNTRAKE</Link>
        </nav>
      </div>
    </main>
  );
}
