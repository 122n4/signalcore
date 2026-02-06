// app/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

const FOUNDING_TOTAL = 500;

function getFoundingLeft() {
  // Optional: set FOUNDING_LEFT="312" in .env.local
  // This should be remaining spots (e.g., 312 means 312/500 remaining).
  const raw = process.env.FOUNDING_LEFT;
  const n = raw ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return null;
  const clamped = Math.max(0, Math.min(FOUNDING_TOTAL, Math.floor(n)));
  return clamped;
}

function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "signal" | "good";
}) {
  const cls =
    tone === "signal"
      ? "border-signal-200 bg-signal-50 text-signal-900"
      : tone === "good"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : "border-border-soft bg-white text-ink-700";
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${cls}`}>
      {children}
    </span>
  );
}

function SectionTitle({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="space-y-2">
      {eyebrow ? <div className="text-xs font-semibold text-ink-500">{eyebrow}</div> : null}
      <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h2>
      {subtitle ? <p className="max-w-3xl text-base text-ink-700">{subtitle}</p> : null}
    </div>
  );
}

export default async function Home() {
  const { userId } = await auth();
  if (userId) redirect("/app");

  const foundingLeft = getFoundingLeft();

  return (
    <main className="min-h-screen bg-white text-ink-900">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border-soft bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-2xl bg-ink-900 text-white flex items-center justify-center text-sm font-semibold">
              SC
            </div>
            <div>
              <div className="text-sm font-semibold leading-tight">SignalCore</div>
              <div className="text-xs text-ink-500 leading-tight">
                Goal-based investing, institutional discipline
              </div>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm text-ink-700">
            <Link href="/why-signalcore" className="hover:text-ink-900">
              Why
            </Link>
            <Link href="/how-it-works" className="hover:text-ink-900">
              How it works
            </Link>
            <Link href="/market-map" className="hover:text-ink-900">
              Preview
            </Link>
            <Link href="/pricing" className="hover:text-ink-900 font-semibold">
              Pricing
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/sign-in"
              className="hidden sm:inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-4 py-2 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="inline-flex items-center justify-center rounded-2xl bg-ink-900 px-4 py-2 text-sm font-semibold text-white shadow-soft hover:opacity-90"
            >
              Start free
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="mx-auto max-w-7xl px-6 pt-14 pb-10">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="signal">
                <span className="h-2 w-2 rounded-full bg-signal-700" />
                Founding Members: first {FOUNDING_TOTAL} get <span className="font-semibold">$19/mo forever</span>
                {foundingLeft !== null ? (
                  <span className="ml-1 rounded-full border border-signal-200 bg-white px-2 py-0.5 text-[11px] font-semibold">
                    {foundingLeft}/{FOUNDING_TOTAL} remaining
                  </span>
                ) : null}
              </Pill>
              <Pill>Goal-based</Pill>
              <Pill>Risk-controlled</Pill>
              <Pill>Human mode + Pro mode</Pill>
            </div>

            <h1 className="mt-5 text-4xl font-semibold tracking-tight md:text-6xl">
              Your personal CIO —
              <br />
              built to maximize returns
              <br />
              without losing control.
            </h1>

            <p className="mt-5 max-w-xl text-base text-ink-700 md:text-lg">
              SignalCore turns your goal into a professional plan, monitors risk like an institution, and tells you the
              next best action — in human language.
            </p>

            <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <Link
                href="/sign-up"
                className="inline-flex items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white shadow-soft hover:bg-signal-800"
              >
                Start free
              </Link>

              <Link
                href="/pricing"
                className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
              >
                See pricing
              </Link>

              <Link
                href="/market-map"
                className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
              >
                Watch preview
              </Link>
            </div>

            <div className="mt-5 text-sm text-ink-600">
              Free mode available. <span className="text-ink-500">Upgrade when you’re ready.</span>
            </div>

            {/* Proof bullets */}
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="rounded-3xl border border-border-soft bg-white p-4 shadow-soft">
                <div className="text-sm font-semibold">Clarity</div>
                <div className="mt-1 text-sm text-ink-700">One next step at a time.</div>
              </div>
              <div className="rounded-3xl border border-border-soft bg-white p-4 shadow-soft">
                <div className="text-sm font-semibold">Discipline</div>
                <div className="mt-1 text-sm text-ink-700">Plan bands + guardrails.</div>
              </div>
              <div className="rounded-3xl border border-border-soft bg-white p-4 shadow-soft">
                <div className="text-sm font-semibold">Explainable</div>
                <div className="mt-1 text-sm text-ink-700">Journal + rationale.</div>
              </div>
            </div>
          </div>

          {/* Demo / Daily Pulse */}
          <div className="rounded-3xl border border-border-soft bg-canvas-50 p-6 shadow-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-ink-500">Copilot Daily Pulse (example)</p>
                <p className="mt-1 text-lg font-semibold">Know exactly what to do today.</p>
              </div>
              <Pill tone="good">Human mode</Pill>
            </div>

            <div className="mt-5 space-y-3">
              <div className="rounded-2xl border border-border-soft bg-white p-4">
                <p className="text-sm font-semibold">Today</p>
                <p className="mt-1 text-sm text-ink-700">
                  You’re close to a safety limit <span className="font-semibold">(FX exposure)</span>.
                </p>
              </div>

              <div className="rounded-2xl border border-border-soft bg-white p-4">
                <p className="text-sm font-semibold">Why</p>
                <ul className="mt-2 list-disc pl-5 text-sm text-ink-700 space-y-1">
                  <li>Portfolio drifted outside plan bands.</li>
                  <li>Concentration rising faster than target.</li>
                </ul>
              </div>

              <div className="rounded-2xl border border-border-soft bg-white p-4">
                <p className="text-sm font-semibold">Next best action</p>
                <p className="mt-1 text-sm text-ink-700">
                  Reduce FX risk by <span className="font-semibold">~3%</span> before adding new positions.
                </p>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <div className="inline-flex items-center justify-center rounded-2xl bg-ink-900 px-4 py-2 text-xs font-semibold text-white">
                    Send to Execution
                  </div>
                  <div className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-4 py-2 text-xs font-semibold text-ink-900">
                    Explain simply
                  </div>
                  <div className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-4 py-2 text-xs font-semibold text-ink-900">
                    Show Pro view
                  </div>
                </div>
              </div>

              <p className="text-xs text-ink-500">
                Calm. Clear. Actionable. Designed to reduce panic and increase disciplined performance.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* THE BIG PROMISE / PROOF LAYER */}
      <section className="mx-auto max-w-7xl px-6 py-12">
        <SectionTitle
          eyebrow="What makes SignalCore different"
          title="Most platforms give you tools. SignalCore gives you a decision process."
          subtitle="Instead of guessing what to buy/sell, SignalCore aligns every move to your goal, checks risk first, then produces a safe next step you can actually execute."
        />

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
            <div className="text-sm font-semibold">Goal → Plan</div>
            <p className="mt-2 text-sm text-ink-700">
              Buckets, policy, guardrails, and playbooks — built once, refined over time.
            </p>
          </div>

          <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
            <div className="text-sm font-semibold">Risk first</div>
            <p className="mt-2 text-sm text-ink-700">
              Drift, limits, concentration, FX, stress tests — fixes come before new risk-taking.
            </p>
          </div>

          <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
            <div className="text-sm font-semibold">Next best action</div>
            <p className="mt-2 text-sm text-ink-700">
              One clear step. One reason. One safe action — with full rationale in the journal.
            </p>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="mx-auto max-w-7xl px-6 py-12">
        <SectionTitle
          eyebrow="How it works"
          title="One next step at a time."
          subtitle="Beginners stay calm in Human Mode. Pros can toggle to Pro Mode to see every driver, stress test, and constraint."
        />

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
            <p className="text-xs font-semibold text-ink-500">Step 1</p>
            <h3 className="mt-2 text-lg font-semibold">Set your goal</h3>
            <p className="mt-2 text-sm text-ink-700">Define what you want and your timeframe.</p>
          </div>

          <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
            <p className="text-xs font-semibold text-ink-500">Step 2</p>
            <h3 className="mt-2 text-lg font-semibold">Build a plan</h3>
            <p className="mt-2 text-sm text-ink-700">Buckets + guardrails + policy + playbooks.</p>
          </div>

          <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
            <p className="text-xs font-semibold text-ink-500">Step 3</p>
            <h3 className="mt-2 text-lg font-semibold">Execute safely</h3>
            <p className="mt-2 text-sm text-ink-700">Actions are blocked if they violate your rules.</p>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/sign-up"
            className="inline-flex items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white shadow-soft hover:bg-signal-800"
          >
            Start free
          </Link>
          <Link
            href="/how-it-works"
            className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
          >
            Learn more
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
          >
            See pricing
          </Link>
        </div>
      </section>

      {/* WHO IT'S FOR */}
      <section className="mx-auto max-w-7xl px-6 py-12">
        <SectionTitle
          eyebrow="Who it’s for"
          title="Built for beginners. Loved by pros."
          subtitle="SignalCore starts simple, and reveals institutional detail only when you want it."
        />

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
            <div className="text-sm font-semibold">Beginners</div>
            <p className="mt-2 text-sm text-ink-700">
              Human Mode guidance. Clear steps. No panic.
            </p>
          </div>

          <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
            <div className="text-sm font-semibold">Intermediate</div>
            <p className="mt-2 text-sm text-ink-700">
              A coherent workflow instead of juggling tools.
            </p>
          </div>

          <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
            <div className="text-sm font-semibold">Advanced</div>
            <p className="mt-2 text-sm text-ink-700">
              Pro Mode: full risk drivers, stress tests, audit trail.
            </p>
          </div>
        </div>
      </section>

      {/* PRICING TEASER */}
      <section className="mx-auto max-w-7xl px-6 py-12">
        <div className="rounded-3xl border border-border-soft bg-white p-8 shadow-card">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div>
              <SectionTitle
                eyebrow="Pricing"
                title="One plan. Everything included."
                subtitle="Start free. Upgrade when you want full execution, alerts, and institutional risk tooling."
              />

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Pill tone="signal">
                  Founding Members: first {FOUNDING_TOTAL} get <span className="font-semibold">$19/mo forever</span>
                  {foundingLeft !== null ? (
                    <span className="ml-1 rounded-full border border-signal-200 bg-white px-2 py-0.5 text-[11px] font-semibold">
                      {foundingLeft}/{FOUNDING_TOTAL} remaining
                    </span>
                  ) : null}
                </Pill>
                <Pill>Cancel anytime</Pill>
                <Pill>Free mode available</Pill>
              </div>
            </div>

            <div className="w-full max-w-md rounded-3xl border border-border-soft bg-canvas-50 p-6">
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="text-sm font-semibold text-ink-500">SignalCore Pro</div>
                  <div className="mt-1 text-3xl font-semibold">$29</div>
                  <div className="text-sm text-ink-700">per month</div>
                </div>
                <div className="text-right text-sm text-ink-700">
                  <div className="font-semibold">$290 / year</div>
                  <div className="text-xs text-ink-500">2 months free</div>
                </div>
              </div>

              <ul className="mt-5 space-y-2 text-sm text-ink-700">
                <li>• Execution Desk (safe actions)</li>
                <li>• Smart alerts (drift/breaches)</li>
                <li>• Risk stress testing + drivers</li>
                <li>• Full journal (audit trail)</li>
              </ul>

              <div className="mt-6 flex flex-col gap-2">
                <Link
                  href="/pricing"
                  className="inline-flex items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white shadow-soft hover:bg-signal-800"
                >
                  See pricing & subscribe
                </Link>
                <Link
                  href="/sign-up"
                  className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
                >
                  Start free
                </Link>
              </div>

              <p className="mt-3 text-xs text-ink-500">
                Educational decision-support tool. Not financial advice.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* MINI FAQ */}
      <section className="mx-auto max-w-7xl px-6 py-12">
        <SectionTitle
          eyebrow="FAQ"
          title="Short answers. Clear expectations."
        />

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
            <div className="text-sm font-semibold">Do I need to pay to try it?</div>
            <p className="mt-2 text-sm text-ink-700">
              No. Start in Free Mode. Upgrade when you want full execution, alerts, and advanced risk tooling.
            </p>
          </div>
          <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
            <div className="text-sm font-semibold">Is this financial advice?</div>
            <p className="mt-2 text-sm text-ink-700">
              No. SignalCore is an educational decision-support tool. You remain responsible for decisions and outcomes.
            </p>
          </div>
          <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
            <div className="text-sm font-semibold">Can I cancel anytime?</div>
            <p className="mt-2 text-sm text-ink-700">
              Yes. Cancel anytime from the billing portal. Your account remains accessible in Free Mode.
            </p>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="mx-auto max-w-7xl px-6 py-14">
        <div className="rounded-3xl border border-border-soft bg-ink-900 p-10 text-white shadow-card">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Stop guessing. Start executing a plan.</h2>
          <p className="mt-4 max-w-3xl text-base text-white/80 md:text-lg">
            Build a goal-based plan, get the next best action, and stay calm through volatility — with institutional
            risk control behind the scenes.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/sign-up"
              className="inline-flex items-center justify-center rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-white/90"
            >
              Start free
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center rounded-2xl border border-white/20 bg-white/10 px-6 py-3 text-sm font-semibold text-white hover:bg-white/15"
            >
              See pricing
            </Link>
          </div>

          <p className="mt-5 text-xs text-white/60">
            SignalCore is an educational decision-support tool and does not provide financial advice. Investing involves
            risk, including possible loss of principal.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border-soft bg-white">
        <div className="mx-auto max-w-7xl px-6 py-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-ink-600">© {new Date().getFullYear()} SignalCore. All rights reserved.</div>

          <div className="flex flex-wrap gap-4 text-sm">
            <Link className="text-ink-700 hover:text-ink-900" href="/pricing">
              Pricing
            </Link>
            <Link className="text-ink-700 hover:text-ink-900" href="/why-signalcore">
              Why
            </Link>
            <Link className="text-ink-700 hover:text-ink-900" href="/how-it-works">
              How it works
            </Link>
            <Link className="text-ink-700 hover:text-ink-900" href="/market-map">
              Preview
            </Link>
            <span className="text-ink-300">·</span>
            <Link className="text-ink-700 hover:text-ink-900" href="/terms">
              Terms
            </Link>
            <Link className="text-ink-700 hover:text-ink-900" href="/privacy">
              Privacy
            </Link>
            <Link className="text-ink-700 hover:text-ink-900" href="/disclaimer">
              Disclaimer
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}