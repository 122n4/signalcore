"use client";

import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import PortfolioApp from "@/components/PortfolioApp";

export default function MyPortfolioPagePT() {
  return (
    <>
      <SignedOut>
        <main className="min-h-screen bg-white text-ink-900">
          <section className="mx-auto max-w-3xl px-6 py-16">
            <p className="text-xs font-semibold text-ink-500">SignalCore</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              O Meu Portefólio
            </h1>
            <p className="mt-3 text-ink-700">
              Esta área é privada. Inicia sessão para criares o teu portefólio e veres orientação contextual de risco.
            </p>

            <div className="mt-8 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/sign-in?redirect_url=/pt/my-portfolio"
                  className="inline-flex items-center justify-center rounded-2xl bg-ink-900 px-6 py-3 text-sm font-semibold text-white hover:opacity-95"
                >
                  Entrar
                </Link>
                <Link
                  href="/sign-up?redirect_url=/pt/my-portfolio"
                  className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
                >
                  Criar conta
                </Link>
              </div>
              <p className="mt-4 text-xs text-ink-500">
                Conteúdo educativo. Sem sinais de compra/venda.
              </p>
            </div>
          </section>
        </main>
      </SignedOut>

      <SignedIn>
        <PortfolioApp locale="pt" regime="Transitional" />
      </SignedIn>
    </>
  );
}