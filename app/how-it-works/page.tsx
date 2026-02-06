// app/how-it-works/page.tsx
import Link from "next/link";

export default function HowItWorksPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12 space-y-10">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">How it works</h1>
        <p className="text-sm text-ink-600">
          <Link href="/" className="underline">Back to home</Link>
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <div className="text-xs font-semibold text-ink-500">Step 1</div>
          <div className="mt-2 text-lg font-semibold">Set your goal</div>
          <p className="mt-2 text-sm text-ink-700">
            Define what you want and your timeframe. SignalCore aligns everything to this.
          </p>
        </div>

        <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <div className="text-xs font-semibold text-ink-500">Step 2</div>
          <div className="mt-2 text-lg font-semibold">Build a plan</div>
          <p className="mt-2 text-sm text-ink-700">
            Buckets + guardrails + policy + playbooks. A real framework, not random trades.
          </p>
        </div>

        <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <div className="text-xs font-semibold text-ink-500">Step 3</div>
          <div className="mt-2 text-lg font-semibold">Follow the next best action</div>
          <p className="mt-2 text-sm text-ink-700">
            The Copilot suggests one move, explains why, and can send it to Execution safely.
          </p>
        </div>
      </div>

      <section className="rounded-3xl border border-border-soft bg-white p-8 shadow-card space-y-3">
        <h2 className="text-xl font-semibold">What makes it “institutional”</h2>
        <ul className="list-disc pl-5 text-sm text-ink-700 space-y-1">
          <li>Guardrails gate risk-taking.</li>
          <li>Drift and band rebalancing keep discipline.</li>
          <li>Execution turns decisions into safe actions.</li>
          <li>Journal records the “why” behind every move.</li>
        </ul>
      </section>

      <div className="flex gap-3 flex-wrap">
        <Link href="/sign-up" className="rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white shadow-soft hover:bg-signal-800">
          Build my plan
        </Link>
        <Link href="/market-map" className="rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold hover:bg-canvas-50">
          Watch demo (preview)
        </Link>
      </div>
    </main>
  );
}