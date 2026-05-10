"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  /** Se já tens broker ligado (ou snapshot), passa true */
  hasBroker?: boolean;
  /** Se já tens plano ativo, passa true */
  hasPlan?: boolean;

  /** Callback opcional: quando clicar “Connect broker” */
  onConnectBroker?: () => void;

  /** Callback opcional: quando clicar “Start offline” */
  onStartOffline?: () => void;
};

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function WelcomeStart({
  hasBroker = false,
  hasPlan = false,
  onConnectBroker,
  onStartOffline,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<"broker" | "offline" | null>(null);

  const title = useMemo(() => {
    if (hasBroker && hasPlan) return "You’re set ✅";
    if (hasBroker) return "Nice — broker connected";
    if (hasPlan) return "Plan active — ready to guide you";
    return "Let’s set up your Syntrake";
  }, [hasBroker, hasPlan]);

  const subtitle = useMemo(() => {
    if (hasBroker && hasPlan) return "Open Daily to see today’s next best action.";
    if (hasBroker) return "Next: define your goal so Daily can guide you properly.";
    if (hasPlan) return "Next: connect a broker (recommended) or keep going offline.";
    return "Choose how you want to start. You can change this anytime.";
  }, [hasBroker, hasPlan]);

  async function handleConnectBroker() {
    try {
      setBusy("broker");
      if (onConnectBroker) return onConnectBroker();

      // fallback: vai para a tab Daily (ou uma rota tua, se tiveres)
      // Se tens um fluxo próprio de connect, troca esta linha pelo teu route.
      router.push("/app?tab=daily");
    } finally {
      setBusy(null);
    }
  }

  async function handleStartOffline() {
    try {
      setBusy("offline");
      if (onStartOffline) return onStartOffline();

      // fallback: manda para Planning (onde o user cria o objetivo/plano)
      router.push("/app?tab=planning");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold text-ink-500">Welcome</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-900">
            {title}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-600">{subtitle}</p>
        </div>

        {(hasBroker || hasPlan) && (
          <button
            type="button"
            onClick={() => router.push("/app?tab=daily")}
            className="rounded-2xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
          >
            Go to Daily
          </button>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Card 1: Connect broker */}
        <div className={cx("rounded-3xl border border-border-soft p-5 shadow-soft", "bg-white")}>
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-ink-900">🔗 Connect your broker (recommended)</div>
            <span className="rounded-full border border-border-soft bg-neutral-50 px-2 py-0.5 text-[11px] font-semibold text-ink-600">
              60 seconds
            </span>
          </div>

          <p className="mt-2 text-sm text-ink-600">
            Sync your real portfolio and get daily actions based on your actual holdings,
            risk and drift — automatically.
          </p>

          <ul className="mt-4 space-y-2 text-sm text-ink-700">
            <li>• Daily becomes portfolio-aware</li>
            <li>• Opportunities adapt to your plan + regime</li>
            <li>• Alerts warn before drift gets expensive</li>
          </ul>

          <button
  type="button"
  onClick={handleConnectBroker}
  disabled={busy !== null}
  className="mt-5 w-full rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-60"
  style={{
    backgroundColor: "#0a0a0a",
    color: "#ffffff",
    border: "1px solid (3, 1, 1, 0.2)",
    boxShadow: "0 8px 20px  (0,0,0,0.15)",
    opacity: busy !== null ? 0.6 : 1,
  }}
>
  {busy === "broker" ? "Opening connect…" : "Connect broker"}
</button>

          <div className="mt-2 text-[11px] text-ink-500">
            You can disconnect anytime. Syntrake never places trades.
          </div>
        </div>

        {/* Card 2: Offline */}
        <div className={cx("rounded-3xl border border-border-soft p-5 shadow-soft", "bg-neutral-50")}>
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-ink-900">🧭 Start offline</div>
            <span className="rounded-full border border-border-soft bg-white px-2 py-0.5 text-[11px] font-semibold text-ink-600">
              No broker needed
            </span>
          </div>

          <p className="mt-2 text-sm text-ink-600">
            Set your goal and plan first. You can optionally add holdings manually —
            or connect a broker later.
          </p>

          <ul className="mt-4 space-y-2 text-sm text-ink-700">
            <li>• Build a goal-based plan in Planning</li>
            <li>• Get a “next best action” routine</li>
            <li>• Learn the process with calm guidance</li>
          </ul>

          <button
            type="button"
            onClick={handleStartOffline}
            disabled={busy !== null}
            className="mt-5 w-full rounded-2xl border border-border-soft bg-white px-4 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50 disabled:opacity-60"
          >
            {busy === "offline" ? "Starting…" : "Start offline"}
          </button>

          <div className="mt-2 text-[11px] text-ink-500">
            Best for beginners: goal first, then portfolio.
          </div>
        </div>
      </div>

      {/* Small footer note */}
      <div className="mt-5 rounded-2xl border border-border-soft bg-white p-4 text-[11px] text-ink-600">
        <span className="font-semibold">How Syntrake works:</span> goal → plan → risk checks → next best action.
        You stay in control, Syntrake stays on top of markets.
      </div>
    </div>
  );
}
