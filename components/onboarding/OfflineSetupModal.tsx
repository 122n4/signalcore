"use client";

import React from "react";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-xs font-semibold text-ink-600">{label}</div>
      <div className="mt-1">{children}</div>
    </label>
  );
}

export default function OfflineSetupModal({
  open,
  onClose,
  onCompleted,
}: {
  open: boolean;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [saving, setSaving] = React.useState(false);

  if (!open) return null;

  async function finish() {
    setSaving(true);
    try {
      // Mark onboarding completed (offline)
      await fetch("/api/setup/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "offline" }),
      });

      onCompleted();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-lg rounded-3xl border border-border-soft bg-white p-5 shadow-card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-ink-500">Offline setup</div>
            <div className="mt-1 text-lg font-semibold text-ink-900">Define your goal in 30 seconds.</div>
            <div className="mt-1 text-sm text-ink-700">
              You can change this later in Planning.
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-border-soft bg-white px-3 py-2 text-xs font-semibold text-ink-700 hover:bg-neutral-50"
          >
            Close
          </button>
        </div>

        <div className="mt-4 grid gap-3">
          <Field label="Goal">
            <select className="w-full rounded-2xl border border-border-soft bg-white px-3 py-2 text-sm">
              <option>Investing</option>
            </select>
          </Field>

          <Field label="Risk profile">
            <select className="w-full rounded-2xl border border-border-soft bg-white px-3 py-2 text-sm">
              <option>Balanced</option>
              <option>Conservative</option>
              <option>Aggressive</option>
            </select>
          </Field>

          <Field label="Horizon">
            <select className="w-full rounded-2xl border border-border-soft bg-white px-3 py-2 text-sm">
              <option>Long</option>
              <option>Medium</option>
              <option>Short</option>
            </select>
          </Field>
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-border-soft bg-white px-4 py-2 text-sm font-semibold text-ink-900 hover:bg-neutral-50"
          >
            Not now
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={finish}
            className="rounded-2xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Finish setup"}
          </button>
        </div>
      </div>
    </div>
  );
}
