"use client";

import React from "react";

export default function WelcomeSetup({
  onConnectBroker,
  onStartOffline,
}: {
  onConnectBroker: () => void;
  onStartOffline: () => void;
}) {
  const [busy, setBusy] = React.useState<"broker" | "offline" | null>(null);

  async function handleConnectBroker() {
    try {
      setBusy("broker");
      onConnectBroker();
    } finally {
      setBusy(null);
    }
  }

  async function handleStartOffline() {
    try {
      setBusy("offline");
      onStartOffline();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-ink-500">Welcome</div>
            <div className="mt-1 text-2xl font-semibold tracking-tight text-ink-900">
              Let’s set up your Syntrake.
            </div>
            <div className="mt-2 text-sm text-ink-700">
              Choose how you want to start. You can change this anytime.
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2 rounded-2xl border border-border-soft bg-canvas-50 px-3 py-2 text-[11px] font-semibold text-ink-700">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            Calm setup · 60 seconds
          </div>
        </div>
      </div>

      {/* Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Broker card */}
        <div className="group rounded-3xl border border-border-soft bg-white p-6 shadow-soft transition hover:shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-ink-900">
                🔗 Connect your broker <span className="text-ink-500">(recommended)</span>
              </div>
              <div className="mt-2 text-sm text-ink-700">
                Sync your real portfolio and get daily actions based on your holdings.
              </div>
            </div>

            <div className="rounded-2xl border border-border-soft bg-neutral-50 px-2 py-1 text-[11px] font-semibold text-ink-600">
              60s
            </div>
          </div>

          <ul className="mt-4 space-y-2 text-sm text-ink-700">
            <li>• Portfolio-aware Daily actions</li>
            <li>• Drift + risk alerts automatically</li>
            <li>• Opportunities adapt to your plan</li>
          </ul>

          {/* IMPORTANT: no bg-brand; force visible premium button */}
          <button
            type="button"
            onClick={handleConnectBroker}
            disabled={busy !== null}
            className="mt-5 w-full rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:opacity-60"
            style={{
              backgroundColor: "#0a0a0a",
              color: "#ffffff",
              border: "1px solid rgba(0,0,0,0.18)",
              boxShadow: "0 14px 30px rgba(0,0,0,0.10)",
            }}
          >
            {busy === "broker" ? "Opening connect…" : "Connect broker"}
          </button>

          <div className="mt-3 text-[12px] text-ink-500">
            You can disconnect anytime. Syntrake never places trades.
          </div>
        </div>

        {/* Offline card */}
        <div className="group rounded-3xl border border-border-soft bg-white p-6 shadow-soft transition hover:shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-ink-900">🧭 Start offline</div>
              <div className="mt-2 text-sm text-ink-700">
                Build a goal-based plan first. You can connect a broker later.
              </div>
            </div>
            <div className="rounded-2xl border border-border-soft bg-neutral-50 px-2 py-1 text-[11px] font-semibold text-ink-600">
              Calm
            </div>
          </div>

          <ul className="mt-4 space-y-2 text-sm text-ink-700">
            <li>• Define goal + risk profile</li>
            <li>• Add holdings manually (optional)</li>
            <li>• Daily routine stays simple</li>
          </ul>

          <button
            type="button"
            onClick={handleStartOffline}
            disabled={busy !== null}
            className="mt-5 w-full rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:opacity-60"
            style={{
              backgroundColor: "#ffffff",
              color: "#0a0a0a",
              border: "1px solid rgba(0,0,0,0.18)",
              boxShadow: "0 14px 30px rgba(0,0,0,0.06)",
            }}
          >
            {busy === "offline" ? "Starting…" : "Start offline"}
          </button>

          <div className="mt-3 text-[12px] text-ink-500">
            Perfect if you want guidance without linking accounts.
          </div>
        </div>
      </div>

      {/* Footer note */}
      <div className="rounded-3xl border border-border-soft bg-white p-5 text-[12px] text-ink-700 shadow-soft">
        <span className="font-semibold text-ink-900">How Syntrake guides you:</span>{" "}
        goal → plan → risk checks → next best action.{" "}
        <span className="text-ink-500">You stay in control, Syntrake does the heavy lifting.</span>
      </div>
    </div>
  );
}
