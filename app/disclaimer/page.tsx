// app/disclaimer/page.tsx
import Link from "next/link";

export default function DisclaimerPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Disclaimer</h1>
        <p className="text-sm text-ink-600">
          <Link href="/" className="underline">
            Back to home
          </Link>
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">No financial advice</h2>
        <p className="text-sm text-ink-700">
          SignalCore is an educational decision-support tool. It does not provide investment, legal, tax, or accounting
          advice. Any examples, templates, outputs, or mentions of securities/tickers are informational only.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">You are responsible</h2>
        <p className="text-sm text-ink-700">
          You are solely responsible for your investment decisions and outcomes. Always do your own research and
          consider consulting qualified professionals.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Risk of loss</h2>
        <p className="text-sm text-ink-700">
          Investing involves risk, including possible loss of principal. Past performance does not guarantee future
          results. Markets may be volatile and unpredictable.
        </p>
      </section>
    </main>
  );
}