// app/why-signalcore/page.tsx
import Link from "next/link";

export default function WhySignalCorePage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12 space-y-10">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Why SignalCore</h1>
        <p className="text-sm text-ink-600">
          <Link href="/" className="underline">Back to home</Link>
        </p>
      </div>

      <section className="rounded-3xl border border-border-soft bg-white p-8 shadow-card space-y-3">
        <h2 className="text-xl font-semibold">Charts don’t make decisions. Process does.</h2>
        <p className="text-sm text-ink-700">
          SignalCore is built to connect your goal to a disciplined system: plan → monitoring → next best action → safe execution.
        </p>
        <ul className="list-disc pl-5 text-sm text-ink-700 space-y-1">
          <li><span className="font-semibold">Goal-based:</span> everything is anchored to what you want to achieve.</li>
          <li><span className="font-semibold">Risk-controlled:</span> guardrails prevent blow-ups and emotional mistakes.</li>
          <li><span className="font-semibold">Human language:</span> the Copilot explains and guides step by step.</li>
          <li><span className="font-semibold">Audit trail:</span> journal records decisions for consistency and learning.</li>
        </ul>
      </section>

      <div className="flex gap-3 flex-wrap">
        <Link href="/sign-up" className="rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white shadow-soft hover:bg-signal-800">
          Start your plan
        </Link>
        <Link href="/pricing" className="rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold hover:bg-canvas-50">
          Pricing
        </Link>
      </div>
    </main>
  );
}