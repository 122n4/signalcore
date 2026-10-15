import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Começar | SYNTRAKE",
  description: "Uma introdução informativa à SYNTRAKE.",
};

export default function StartPage() {
  return (
    <main className="min-h-screen bg-white px-6 py-16 text-zinc-950">
      <section className="mx-auto max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">SYNTRAKE</p>
        <h1 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">Começa por perceber o processo.</h1>
        <p className="mt-6 text-lg leading-8 text-zinc-700">Esta página é apenas informativa. Não cria contas, não inicia onboarding e não liga serviços externos.</p>
        <ol className="mt-10 space-y-4">
          {["Conhece o produto e os seus limites.", "Consulta as funcionalidades atualmente disponíveis.", "Escolhe se a SYNTRAKE se adequa ao teu fluxo."].map((item, index) => (
            <li key={item} className="flex gap-4 rounded-2xl border border-zinc-200 p-5"><span className="font-bold text-zinc-500">{index + 1}</span><span className="text-sm leading-6 text-zinc-700">{item}</span></li>
          ))}
        </ol>
        <div className="mt-10 flex flex-wrap gap-4 text-sm font-semibold underline">
          <Link href="/how-it-works">Ver como funciona</Link>
          <Link href="/pricing">Consultar pricing</Link>
        </div>
      </section>
    </main>
  );
}
