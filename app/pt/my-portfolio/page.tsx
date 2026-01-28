import Link from "next/link";
import { auth } from "@clerk/nextjs/server";

export default function MyPortfolioPagePT() {
  const { userId } = auth();

  // Não logado → CTA para login
  if (!userId) {
    return (
      <main className="min-h-screen bg-white text-ink-900">
        <section className="mx-auto max-w-3xl px-6 py-16">
          <p className="text-xs font-semibold text-ink-500">SignalCore</p>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            O Meu Portefólio
          </h1>

          <p className="mt-3 text-ink-700">
            Esta área é privada. Inicia sessão para adicionares os teus ativos e veres orientação contextual de risco.
          </p>

          <div className="mt-8 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
            <h2 className="text-lg font-semibold">Porquê iniciar sessão?</h2>
            <ul className="mt-4 list-disc pl-5 space-y-2 text-sm text-ink-700">
              <li>Guardar o teu portefólio</li>
              <li>Ver encaixe com o regime e risco contextual (não performance)</li>
              <li>Ter explicações simples para iniciantes</li>
            </ul>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/sign-in"
                className="inline-flex items-center justify-center rounded-2xl bg-ink-900 px-6 py-3 text-sm font-semibold text-white hover:opacity-95"
              >
                Entrar
              </Link>

              <Link
                href="/sign-up"
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
    );
  }

  // Logado → placeholder do portfolio
  return (
    <main className="min-h-screen bg-white text-ink-900">
      <section className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-xs font-semibold text-ink-500">SignalCore</p>

        <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
          O Meu Portefólio
        </h1>

        <p className="mt-3 text-ink-700">
          Sessão iniciada ✅ (userId: <span className="font-mono">{userId}</span>)
        </p>

        <div className="mt-8 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold">Próximo passo</h2>
          <p className="mt-3 text-ink-700">
            A seguir vamos construir o Portefólio v1: adicionar ativos, ver encaixe com o regime e receber orientação
            por horizonte (curto/médio/longo) — com legendas para iniciantes.
          </p>

          <p className="mt-5 text-sm font-semibold text-ink-900">
            Resultados consistentes vêm de decisões consistentes. O SignalCore foca-se no contexto que sustenta ambos.
          </p>

          <p className="mt-4 text-xs text-ink-500">
            Esta é uma página placeholder. As funcionalidades do portefólio serão adicionadas a seguir.
          </p>
        </div>
      </section>
    </main>
  );
}