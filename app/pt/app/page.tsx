"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";

import PortfolioPreview from "@/components/PortfolioPreview";
import PortfolioEditor from "@/components/PortfolioEditor";

type TabKey = "overview" | "portfolio" | "advisor";

export default function AppHomePT() {
  const [tab, setTab] = useState<TabKey>("overview");

  const weekly = useMemo(
    () => ({
      updatedAt: "Esta semana · Atualizado",
      market: "Cauteloso",
      crypto: "Neutro",
      teaser:
        "Esta semana recompensa seletividade, não urgência. Fazer menos costuma bater fazer mais.",
    }),
    []
  );

  return (
    <main className="min-h-screen bg-white text-ink-900">
      <section className="mx-auto max-w-7xl px-6 py-8">
        {/* Tabs */}
        <div className="flex flex-wrap gap-2">
          <TabButton active={tab === "overview"} onClick={() => setTab("overview")}>
            Visão geral
          </TabButton>
          <TabButton active={tab === "portfolio"} onClick={() => setTab("portfolio")}>
            Portefólio
          </TabButton>
          <TabButton active={tab === "advisor"} onClick={() => setTab("advisor")}>
            Advisor
          </TabButton>
        </div>

        {/* Content */}
        <div className="mt-8">
          {tab === "overview" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader title="ESTA SEMANA" subtitle={weekly.updatedAt} />

                <div className="mt-5 space-y-2">
                  <p className="text-lg font-semibold">
                    Postura do mercado:{" "}
                    <span className="text-ink-900">{weekly.market}</span>
                  </p>
                  <p className="text-lg font-semibold">
                    Postura cripto: <span className="text-ink-900">{weekly.crypto}</span>
                  </p>
                </div>

                <div className="mt-6 rounded-2xl border border-border-soft bg-canvas-50 p-4">
                  <p className="text-sm text-ink-700 italic">{weekly.teaser}</p>
                  <p className="mt-3 text-xs text-ink-500">
                    Contexto educativo. Sem previsões.
                  </p>
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <Link
                    href="/pt/pricing"
                    className="inline-flex items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft"
                  >
                    Ativar visão semanal completa
                  </Link>
                  <Link
                    href="/pt/example"
                    className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
                  >
                    Ver exemplo
                  </Link>
                </div>
              </Card>

              <Card className="bg-canvas-50">
                <CardHeader
                  title="O que o SignalCore faz"
                  subtitle="Feito para reduzir decisões, não aumentar."
                />

                <ul className="mt-5 space-y-3 text-sm text-ink-700">
                  <li>• Traduz o mercado em postura semanal calma.</li>
                  <li>• Ajuda-te a estruturar um plano com base no teu objetivo.</li>
                  <li>• Verifica se o plano continua coerente quando o contexto muda.</li>
                </ul>

                <div className="mt-6 rounded-2xl border border-border-soft bg-white p-4">
                  <p className="text-sm text-ink-700">
                    Usa qualquer broker. O SignalCore não executa ordens — mantém o teu plano coerente.
                  </p>
                </div>
              </Card>
            </div>
          )}

          {tab === "portfolio" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <SignedOut>
                <PortfolioPreview locale="pt" />
              </SignedOut>

              <SignedIn>
                <PortfolioEditor locale="pt" />
              </SignedIn>

              <Card className="bg-canvas-50">
                <CardHeader
                  title="Planeamento por objetivo"
                  subtitle="Diz onde queres chegar. O SignalCore mantém o caminho claro."
                />

                <div className="mt-5 space-y-3 text-sm text-ink-700">
                  <p>• Objetivo: 5.000€</p>
                  <p>• Horizonte: 3 anos</p>
                  <p>• Esforço mensal: calculado por intervalos (sem promessas)</p>
                </div>

                <div className="mt-6 rounded-2xl border border-border-soft bg-white p-4">
                  <p className="text-sm text-ink-700">
                    Membros recebem um plano + validação semanal. Se o contexto mudar de forma relevante,
                    o SignalCore “inclina” a direção — sem urgência.
                  </p>
                </div>

                <div className="mt-6">
                  <Link
                    href="/pt/pricing"
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft"
                  >
                    Desbloquear planeamento & Advisor
                  </Link>
                </div>
              </Card>
            </div>
          )}

          {tab === "advisor" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader
                  title="Advisor (membros)"
                  subtitle="Não diz o que comprar. Mantém o plano saudável."
                />

                <div className="mt-5 rounded-2xl border border-border-soft bg-canvas-50 p-4">
                  <p className="text-sm text-ink-700 italic">
                    Se o teu objetivo é chegar a 5.000€ em 3 anos, o SignalCore estrutura um plano mensal e
                    verifica se continua a fazer sentido à medida que o mercado muda.
                  </p>
                </div>

                <div className="mt-6 rounded-2xl border border-border-soft bg-white p-4">
                  <p className="text-sm text-ink-700">
                    Vais ver: alinhamento do plano, mudanças de postura e “se fosse criado hoje…” — apenas
                    quando a diferença é material.
                  </p>
                  <p className="mt-2 text-xs text-ink-500">
                    Sem sinais. Sem previsões. Só contexto e disciplina.
                  </p>
                </div>

                <div className="mt-6">
                  <Link
                    href="/pt/pricing"
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft"
                  >
                    Ativar Advisor
                  </Link>
                </div>
              </Card>

              <Card className="bg-canvas-50">
                <CardHeader
                  title="Porque isto é diferente"
                  subtitle="Brokers executam bem. O SignalCore ajuda-te a decidir bem."
                />
                <ul className="mt-5 space-y-3 text-sm text-ink-700">
                  <li>• Sem incentivo para transacionares mais.</li>
                  <li>• O plano é o centro — não o ruído do mercado.</li>
                  <li>• Guidance semanal que reduz decisões emocionais.</li>
                </ul>
              </Card>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "rounded-2xl px-4 py-2 text-sm font-semibold transition",
        active
          ? "bg-ink-900 text-white"
          : "border border-border-soft bg-white text-ink-700 hover:bg-canvas-50",
      ].join(" ")}
      type="button"
    >
      {children}
    </button>
  );
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-3xl border border-border-soft bg-white p-8 shadow-soft ${className}`}>
      {children}
    </div>
  );
}

function CardHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-ink-500">{title}</p>
      {subtitle ? <p className="mt-2 text-sm text-ink-700">{subtitle}</p> : null}
    </div>
  );
}