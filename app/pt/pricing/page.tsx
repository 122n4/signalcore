"use client";

import { useState } from "react";
import { useUser, SignInButton } from "@clerk/nextjs";

export default function PricingPT() {
  const { user, isLoaded, isSignedIn } = useUser();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function goCheckout() {
    setError(null);

    if (!isLoaded) return;

    if (!isSignedIn || !user) {
      setError("Faz login para continuar.");
      return;
    }

    const email = user.primaryEmailAddress?.emailAddress;
    if (!email) {
      setError("Não foi possível encontrar o teu email.");
      return;
    }

    try {
      setLoading(true);

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          email,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "Falha no checkout.");
        setLoading(false);
        return;
      }

      window.location.href = data.url;
    } catch (e: any) {
      setError(e?.message || "Falha no checkout.");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-white text-ink-900">
      <section className="mx-auto max-w-4xl px-4 py-20">
        <p className="text-xs font-semibold text-ink-500">Preço</p>

        <h1 className="mt-2 text-4xl font-semibold tracking-tight">
          Preço simples. Acesso antecipado.
        </h1>

        <p className="mt-4 max-w-2xl text-ink-700">
          O SignalCore está numa fase inicial. Este preço reflete acesso antecipado
          para pessoas que querem construir perspetiva de longo prazo desde o início.
        </p>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {/* Plano */}
          <div className="rounded-3xl border border-border-soft bg-white p-8 shadow-soft">
            <h2 className="text-lg font-semibold">
              SignalCore — Acesso Total
            </h2>

            <p className="mt-2 text-sm text-ink-500">
              Preço de acesso antecipado
            </p>

            <div className="mt-6 flex items-baseline gap-2">
              <span className="text-4xl font-semibold">€9</span>
              <span className="text-sm text-ink-500">/ mês</span>
            </div>

            <ul className="mt-6 space-y-3 text-sm text-ink-700">
              <li>✓ Market Map semanal</li>
              <li>✓ Acesso ao arquivo completo</li>
              <li>✓ Horizontes curto, médio e longo</li>
              <li>✓ Perspetiva orientada ao risco</li>
              <li>✓ Atualizações contínuas</li>
            </ul>

            <button
              onClick={goCheckout}
              disabled={loading}
              className="mt-8 inline-flex w-full items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft disabled:opacity-60"
            >
              {loading ? "A redirecionar…" : "Obter acesso"}
            </button>

            {!isSignedIn && (
              <div className="mt-3 text-center">
                <SignInButton mode="modal">
                  <button className="text-sm font-semibold text-signal-700 underline underline-offset-4">
                    Fazer login para continuar
                  </button>
                </SignInButton>
              </div>
            )}

            {error && (
              <p className="mt-3 text-center text-sm text-red-600">
                {error}
              </p>
            )}

            <p className="mt-4 text-xs text-ink-500 text-center">
              O preço vai aumentar no futuro. Podes cancelar quando quiseres.
            </p>
          </div>

          {/* Notas */}
          <div className="rounded-3xl border border-border-soft bg-canvas-50 p-8 shadow-card">
            <h3 className="text-sm font-semibold">
              Para quem é
            </h3>

            <ul className="mt-4 space-y-3 text-sm text-ink-700">
              <li>• Pessoas que querem clareza, não ruído</li>
              <li>• Iniciantes que não querem estudar horas</li>
              <li>• Investidores focados em risco e consistência</li>
              <li>• Quem pensa no longo prazo</li>
            </ul>

            <p className="mt-6 text-sm text-ink-700">
              O SignalCore não é sobre sinais ou previsões.
              É sobre pensar com clareza e agir com disciplina.
            </p>
          </div>
        </div>

        <p className="mt-12 text-xs text-ink-500">
          Conteúdo educativo. Investir envolve risco.
        </p>
      </section>
    </main>
  );
}