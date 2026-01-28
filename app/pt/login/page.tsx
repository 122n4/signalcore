import React from "react";

export default function LoginPagePT() {
  return (
    <main className="min-h-screen bg-white text-ink-900">
      <section className="mx-auto max-w-7xl px-6 py-14">
        <div className="mx-auto max-w-xl">
          <p className="text-xs font-semibold text-ink-500">SignalCore</p>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            Entrar no SignalCore
          </h1>

          <p className="mt-2 text-sm text-ink-700">
            Cria a tua conta grátis em segundos. Sem cartão.
          </p>

          <p className="mt-4 text-xs text-ink-500">
            Contexto de mercado calmo e focado no risco — atualizado semanalmente.
          </p>

          <div className="mt-8 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
            <div className="space-y-3">
              <a
                href="/sign-in"
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-ink-900 px-5 py-3 text-sm font-semibold text-white shadow-soft hover:opacity-95"
              >
                Continuar com Google
              </a>

              <a
                href="/sign-in"
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border-soft bg-white px-5 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
              >
                Continuar com email
              </a>

              <a
                href="/sign-up"
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border-soft bg-white px-5 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
              >
                Criar conta
              </a>

              <p className="pt-2 text-xs text-ink-500">
                Nunca publicamos nada. A tua conta serve apenas para guardar
                preferências e a tua área privada de portfolio.
              </p>
            </div>

            <div className="mt-8">
              <h2 className="text-base font-semibold">Porquê criar conta?</h2>

              <ul className="mt-3 space-y-2 text-sm text-ink-700">
                <li>• Guardar preferências (EN/PT)</li>
                <li>• Criar uma área privada “My Portfolio”</li>
                <li>• Ter estrutura semanal calma — sem spam</li>
              </ul>

              <p className="mt-4 text-sm text-ink-700">
                <span className="font-semibold">
                  O SignalCore não diz o que comprar.
                </span>{" "}
                Ajuda-te a decidir melhor ao longo do tempo.
              </p>
            </div>

            <div className="mt-8 rounded-2xl border border-border-soft bg-canvas-50 p-4">
              <h3 className="text-sm font-semibold">Privacidade &amp; segurança</h3>
              <ul className="mt-2 space-y-1 text-sm text-ink-700">
                <li>• O teu portfolio é privado</li>
                <li>• Sem ligação a bancos ou corretoras</li>
                <li>• Podes apagar a tua conta quando quiseres</li>
              </ul>
            </div>

            <div className="mt-8 flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-500">
              <a className="hover:underline" href="/pt/pricing">
                Preços
              </a>
              <a className="hover:underline" href="/pt/why-signalcore">
                Método
              </a>
              <a className="hover:underline" href="/pt">
                Início
              </a>
            </div>
          </div>

          <p className="mt-6 text-xs text-ink-500">
            Conteúdo educativo. Sem sinais. Sem previsões.
          </p>
        </div>
      </section>
    </main>
  );
}