import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Porque SYNTRAKE | SYNTRAKE",
  description: "Os princípios informativos por trás da SYNTRAKE.",
};

export default function WhySyntrakePage() {
  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-16 text-white">
      <div className="mx-auto max-w-4xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">SYNTRAKE</p>
        <h1 className="mt-4 text-4xl font-black tracking-tight md:text-6xl">Clareza antes da complexidade.</h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-300">A SYNTRAKE foi pensada para tornar o trabalho diário mais compreensível, verificável e consistente.</p>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            ["Contexto", "Informação organizada para perceber o ponto de partida."],
            ["Disciplina", "Um processo repetível para não confundir urgência com prioridade."],
            ["Transparência", "Limites e estado do produto apresentados sem promessas implícitas."],
          ].map(([title, body]) => (
            <section key={title} className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
              <h2 className="text-xl font-bold">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-zinc-300">{body}</p>
            </section>
          ))}
        </div>
        <div className="mt-10 flex flex-wrap gap-4 text-sm font-semibold">
          <Link className="rounded-xl bg-white px-5 py-3 text-zinc-950" href="/how-it-works">Como funciona</Link>
          <Link className="rounded-xl border border-zinc-700 px-5 py-3" href="/">Página inicial</Link>
        </div>
      </div>
    </main>
  );
}
