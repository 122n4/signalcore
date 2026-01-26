export default function WhySignalCorePT() {
  return (
    <main className="min-h-screen bg-white text-ink-900">
      <section className="mx-auto max-w-3xl px-4 py-20">
        <p className="text-xs font-semibold text-ink-500">SignalCore</p>

        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          Porque existe o SignalCore
        </h1>

        <p className="mt-6 text-lg text-ink-700">
          Hoje, os mercados são barulhentos, emocionais e confusos —
          especialmente para quem está a começar.
        </p>

        <p className="mt-4 text-ink-700">
          A maioria do conteúdo empurra as pessoas para reagirem mais rápido,
          preverem melhor ou seguirem a convicção de outros.
          O SignalCore nasce como resposta a isso.
        </p>

        {/* O PROBLEMA */}
        <div className="mt-14">
          <h2 className="text-2xl font-semibold">O problema</h2>

          <p className="mt-4 text-ink-700">
            Os iniciantes não têm falta de informação. Têm falta de estrutura.
          </p>

          <p className="mt-3 text-ink-700">
            Gráficos, opiniões, alertas e previsões criam a ilusão de controlo —
            mas levam muitas vezes à ansiedade e à inconsistência.
          </p>
        </div>

        {/* ERRO COMUM */}
        <div className="mt-12">
          <h2 className="text-2xl font-semibold">O erro mais comum</h2>

          <p className="mt-4 text-ink-700">
            A maioria das pessoas procura respostas para perguntas como:
          </p>

          <ul className="mt-4 list-disc pl-5 space-y-2 text-ink-700">
            <li>O que devo comprar?</li>
            <li>Quando devo vender?</li>
            <li>O que vai fazer o mercado?</li>
          </ul>

          <p className="mt-4 text-ink-700">
            Estas perguntas partem do princípio de que o futuro pode ser previsto.
            O SignalCore parte do princípio oposto.
          </p>
        </div>

        {/* ABORDAGEM */}
        <div className="mt-12">
          <h2 className="text-2xl font-semibold">A abordagem do SignalCore</h2>

          <p className="mt-4 text-ink-700">
            O SignalCore não tenta prever mercados.
            Classifica o ambiente.
          </p>

          <p className="mt-3 text-ink-700">
            Em vez de perguntar “o que vai acontecer?”, pergunta:
          </p>

          <ul className="mt-4 list-disc pl-5 space-y-2 text-ink-700">
            <li>Em que regime estamos?</li>
            <li>Onde estão os riscos?</li>
            <li>O que mudaria este cenário?</li>
          </ul>
        </div>

        {/* PARA QUEM */}
        <div className="mt-12">
          <h2 className="text-2xl font-semibold">Para quem é o SignalCore</h2>

          <ul className="mt-4 list-disc pl-5 space-y-2 text-ink-700">
            <li>Pessoas que procuram clareza, não alertas constantes</li>
            <li>Iniciantes que não querem estudar mercados horas a fio</li>
            <li>Investidores focados em risco e consistência</li>
            <li>Pensamento de longo prazo</li>
          </ul>
        </div>

        {/* PARA QUEM NÃO É */}
        <div className="mt-10">
          <h2 className="text-2xl font-semibold">Para quem não é</h2>

          <ul className="mt-4 list-disc pl-5 space-y-2 text-ink-700">
            <li>Quem procura sinais de trading</li>
            <li>Quem persegue ganhos rápidos</li>
            <li>Quem procura certezas em mercados incertos</li>
          </ul>
        </div>

        {/* COMO A IA PENSA */}
        <div className="mt-12">
          <h2 className="text-2xl font-semibold">Como pensa o SignalCore</h2>

          <p className="mt-4 text-ink-700">
            O SignalCore utiliza um sistema de IA desenhado para pensar como
            um analista calmo e consciente do risco — não como um motor de previsões.
          </p>

          <p className="mt-3 text-ink-700">
            Analisa o mercado de forma contínua, mas só comunica quando algo
            realmente relevante muda.
          </p>
        </div>

        {/* CTA */}
        <div className="mt-16 rounded-3xl border border-border-soft bg-white p-8 text-center shadow-soft">
          <p className="text-sm text-ink-500">Acesso antecipado</p>

          <p className="mt-2 text-3xl font-semibold">
            €9 <span className="text-base font-normal text-ink-500">/ mês</span>
          </p>

          <p className="mt-4 text-sm text-ink-700">
            Um plano. Acesso completo. Preço inicial.
          </p>

          <a
            href="/pt/pricing"
            className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft"
          >
            Obter acesso antecipado
          </a>
        </div>

        <p className="mt-10 text-xs text-ink-500">
          Conteúdo educativo. Sem sinais. Sem previsões.
        </p>
      </section>
    </main>
  );
}