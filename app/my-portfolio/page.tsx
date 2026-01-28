import Link from "next/link";
import { auth } from "@clerk/nextjs/server";

export default function MyPortfolioPage() {
  const { userId } = auth();

  // Não logado → CTA para login
  if (!userId) {
    return (
      <main className="min-h-screen bg-white text-ink-900">
        <section className="mx-auto max-w-3xl px-6 py-16">
          <p className="text-xs font-semibold text-ink-500">SignalCore</p>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            My Portfolio
          </h1>

          <p className="mt-3 text-ink-700">
            This area is private. Sign in to add your assets and view contextual risk guidance.
          </p>

          <div className="mt-8 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
            <h2 className="text-lg font-semibold">Why sign in?</h2>
            <ul className="mt-4 list-disc pl-5 space-y-2 text-sm text-ink-700">
              <li>Save your portfolio</li>
              <li>See regime fit & contextual risk (not performance)</li>
              <li>Get beginner-friendly explanations</li>
            </ul>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/sign-in"
                className="inline-flex items-center justify-center rounded-2xl bg-ink-900 px-6 py-3 text-sm font-semibold text-white hover:opacity-95"
              >
                Sign in
              </Link>

              <Link
                href="/sign-up"
                className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
              >
                Create account
              </Link>
            </div>

            <p className="mt-4 text-xs text-ink-500">
              Educational content only. No buy/sell signals.
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
          My Portfolio
        </h1>

        <p className="mt-3 text-ink-700">
          You’re signed in ✅ (userId: <span className="font-mono">{userId}</span>)
        </p>

        <div className="mt-8 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold">What’s next</h2>
          <p className="mt-3 text-ink-700">
            Next we’ll build Portfolio v1: add assets, see regime fit, and get short/medium/long
            horizon guidance — with tooltips for beginners.
          </p>

          <p className="mt-5 text-sm font-semibold text-ink-900">
            Consistent results come from consistent decisions. SignalCore focuses on the context that supports both.
          </p>

          <p className="mt-4 text-xs text-ink-500">
            This is a placeholder page. Portfolio features will be added next.
          </p>
        </div>
      </section>
    </main>
  );
}