import React from "react";

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-white text-ink-900">
      <section className="mx-auto max-w-7xl px-6 py-14">
        <div className="mx-auto max-w-xl">
          <p className="text-xs font-semibold text-ink-500">SignalCore</p>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            Sign in to SignalCore
          </h1>

          <p className="mt-2 text-sm text-ink-700">
            Create your free account in seconds. No card required.
          </p>

          <p className="mt-4 text-xs text-ink-500">
            Calm, risk-first market context — updated weekly.
          </p>

          <div className="mt-8 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
            <div className="space-y-3">
              <a
                href="/sign-in"
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-ink-900 px-5 py-3 text-sm font-semibold text-white shadow-soft hover:opacity-95"
              >
                Continue with Google
              </a>

              <a
                href="/sign-in"
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border-soft bg-white px-5 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
              >
                Continue with email
              </a>

              <a
                href="/sign-up"
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border-soft bg-white px-5 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
              >
                Create account
              </a>

              <p className="pt-2 text-xs text-ink-500">
                We’ll never post anything. Your account is only used to save your
                preferences and your private portfolio view.
              </p>
            </div>

            <div className="mt-8">
              <h2 className="text-base font-semibold">Why create an account?</h2>

              <ul className="mt-3 space-y-2 text-sm text-ink-700">
                <li>• Save your Market Map preferences (EN/PT)</li>
                <li>• Build a private “My Portfolio” view</li>
                <li>• Get calm weekly structure — not alert spam</li>
              </ul>

              <p className="mt-4 text-sm text-ink-700">
                <span className="font-semibold">
                  SignalCore doesn’t tell you what to buy.
                </span>{" "}
                It helps you make better decisions over time.
              </p>
            </div>

            <div className="mt-8 rounded-2xl border border-border-soft bg-canvas-50 p-4">
              <h3 className="text-sm font-semibold">Privacy &amp; security</h3>
              <ul className="mt-2 space-y-1 text-sm text-ink-700">
                <li>• Your portfolio is private</li>
                <li>• No bank/broker connections</li>
                <li>• You can delete your account anytime</li>
              </ul>
            </div>

            <div className="mt-8 flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-500">
              <a className="hover:underline" href="/pricing">
                Pricing
              </a>
              <a className="hover:underline" href="/why-signalcore">
                Method
              </a>
              <a className="hover:underline" href="/">
                Home
              </a>
            </div>
          </div>

          <p className="mt-6 text-xs text-ink-500">
            Educational content only. No signals. No predictions.
          </p>
        </div>
      </section>
    </main>
  );
}