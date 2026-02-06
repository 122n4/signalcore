// app/market-map/page.tsx
import Link from "next/link";

export default function PreviewPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12 space-y-10">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Preview</h1>
        <p className="text-sm text-ink-600">
          A quick look at the SignalCore experience · <Link href="/" className="underline">Back to home</Link>
        </p>
      </div>

      <section className="rounded-3xl border border-border-soft bg-canvas-50 p-8 shadow-card space-y-4">
        <div className="text-xs font-semibold text-ink-500">Copilot Daily Pulse (example)</div>
        <div className="rounded-2xl border border-border-soft bg-white p-5">
          <div className="text-sm font-semibold">Status</div>
          <div className="mt-1 text-sm text-ink-700">You’re close to a safety limit (FX exposure).</div>
        </div>
        <div className="rounded-2xl border border-border-soft bg-white p-5">
          <div className="text-sm font-semibold">Why</div>
          <ul className="mt-2 list-disc pl-5 text-sm text-ink-700 space-y-1">
            <li>Portfolio drifted outside plan bands.</li>
            <li>Concentration is rising faster than target.</li>
          </ul>
        </div>
        <div className="rounded-2xl border border-border-soft bg-white p-5">
          <div className="text-sm font-semibold">Next step</div>
          <div className="mt-1 text-sm text-ink-700">Reduce FX risk by ~3% before adding new positions.</div>
          <div className="mt-4 flex flex-wrap gap-2">
            <div className="rounded-2xl bg-ink-900 px-4 py-2 text-xs font-semibold text-white">Send to Execution</div>
            <div className="rounded-2xl border border-border-soft bg-white px-4 py-2 text-xs font-semibold">Explain simply</div>
            <div className="rounded-2xl border border-border-soft bg-white px-4 py-2 text-xs font-semibold">Show Pro details</div>
          </div>
        </div>
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