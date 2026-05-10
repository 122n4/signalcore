"use client";

import TrackedLink from "@/components/TrackedLink";

function Check({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm text-ink-700">
      <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-ink-900 text-white text-[10px] font-semibold">
        OK
      </span>
      <div className="leading-snug">{children}</div>
    </div>
  );
}

export default function WelcomeClient() {
  return (
    <main className="relative mx-auto w-full max-w-5xl px-6 py-12">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-24 left-1/2 h-72 w-[46rem] -translate-x-1/2 rounded-full bg-gradient-to-r from-slate-200/40 via-emerald-200/30 to-cyan-200/30 blur-3xl" />
      </div>

      <div className="flex flex-col gap-3">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border-soft bg-white/80 px-3 py-1 text-xs text-ink-700 shadow-sm">
          <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          Goal quiz + actions in under 2 minutes
        </div>

        <h1 className="text-3xl font-semibold tracking-tight text-ink-900 md:text-4xl">
          Configure Syntrake around your real money goal.
        </h1>
        <p className="max-w-2xl text-sm text-ink-600 md:text-base">
          Connect your broker now, or start with a quiz that turns your goal into a realistic plan and concrete first
          actions.
        </p>

        <div className="mt-2 flex flex-wrap gap-2 text-xs text-ink-600">
          <div className="rounded-full border border-border-soft bg-white/80 px-3 py-1 shadow-sm">Private by default</div>
          <div className="rounded-full border border-border-soft bg-white/80 px-3 py-1 shadow-sm">Disconnect anytime</div>
          <div className="rounded-full border border-border-soft bg-white/80 px-3 py-1 shadow-sm">Action-first onboarding</div>
        </div>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <div className="group rounded-3xl border border-border-soft bg-white p-7 shadow-soft transition hover:shadow-card">
          <div className="text-sm font-semibold text-ink-900">Connect your broker (recommended)</div>
          <p className="mt-3 text-sm text-ink-600">Sync real holdings and get portfolio-aware actions immediately.</p>

          <div className="mt-5 space-y-3">
            <Check>Instant holdings sync</Check>
            <Check>Daily actions based on your actual risk</Check>
            <Check>Faster automation and reconciliation</Check>
          </div>

          <TrackedLink
            href="/app?tab=autonomy&brokerSetup=1"
            eventName="onboarding_choice"
            eventData={{ choice: "connect_broker" }}
            className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-ink-900 px-4 py-3 text-sm font-semibold text-white hover:opacity-95"
          >
            Connect broker
          </TrackedLink>
          <div className="mt-2 text-center text-xs text-ink-500">Usually takes about 60 seconds.</div>
        </div>

        <div className="group rounded-3xl border border-border-soft bg-white p-7 shadow-soft transition hover:shadow-card">
          <div className="text-sm font-semibold text-ink-900">Start with goal quiz</div>
          <p className="mt-3 text-sm text-ink-600">
            Define target, horizon, and budget. Syntrake checks realism and prepares first actions.
          </p>

          <div className="mt-5 space-y-3">
            <Check>No account linking required</Check>
            <Check>Realistic target check</Check>
            <Check>Starter actions auto-generated</Check>
          </div>

          <TrackedLink
            href="/app?tab=planning&offlineSetup=1"
            eventName="onboarding_choice"
            eventData={{ choice: "start_goal_quiz" }}
            className="mt-6 inline-flex w-full items-center justify-center rounded-2xl border border-border-soft bg-white px-4 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
          >
            Start goal quiz
          </TrackedLink>
          <div className="mt-2 text-center text-xs text-ink-500">Best for first-time users.</div>
        </div>
      </div>

      <div className="mt-10 rounded-3xl border border-border-soft bg-white/80 p-6 text-sm text-ink-700 shadow-soft">
        <div className="font-semibold text-ink-900">What happens after setup?</div>
        <p className="mt-2">
          Syntrake activates your plan, sends you first to Portfolio to confirm holdings or apply Starter Pack, and then to Daily.
        </p>
        <p className="mt-2 text-xs text-ink-600">
          Value proof in your first 10 minutes: one clear decision, one protection/progress signal, and one explicit next step.
        </p>
      </div>
    </main>
  );
}
