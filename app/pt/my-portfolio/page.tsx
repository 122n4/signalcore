"use client";

import Link from "next/link";
import PremiumGate from "@/components/PremiumGate";
import PortfolioPreview from "@/components/PortfolioPreview";
import PortfolioEditor from "@/components/PortfolioEditor";

export default function MyPortfolioPagePT() {
  return (
    <main className="min-h-screen bg-white text-ink-900">
      <section className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-ink-500">SignalCore</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">O Meu Portefólio</h1>
            <p className="mt-2 text-sm text-ink-700">
              O teu portefólio + contexto SignalCore. Premium desbloqueia edição & guardar na cloud.
            </p>
          </div>

          <Link
            href="/pt/app"
            className="rounded-2xl border border-border-soft bg-white px-4 py-2 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
          >
            Ir para a App
          </Link>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {/* Preview grátis sempre visível */}
          <PortfolioPreview locale="pt" />

          {/* Editor premium */}
          <PremiumGate
            title="Editor de portefólio (Premium)"
            subtitle="Edição, guardar e ferramentas de planeamento estão incluídas no Premium."
          >
            <PortfolioEditor locale="pt" />
          </PremiumGate>
        </div>

        <p className="mt-10 text-xs text-ink-500">
          Conteúdo educativo. Investir envolve risco.
        </p>
      </section>
    </main>
  );
}