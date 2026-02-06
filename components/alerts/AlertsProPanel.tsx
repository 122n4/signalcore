"use client";

import React, { useMemo, useState } from "react";
import type { UserAlert } from "@/lib/alerts/types";

export function AlertsProPanel({
  alerts,
  locale = "en",
}: {
  alerts: UserAlert[];
  locale?: "en" | "pt";
}) {
  const pt = locale === "pt";
  const [open, setOpen] = useState(false);

  const t = useMemo(() => {
    return {
      title: pt ? "Pro Terminal (Alerts)" : "Pro Terminal (Alerts)",
      subtitle: pt
        ? "Vê a camada institucional: tipos, dedupe, meta e ações."
        : "View the institutional layer: types, dedupe, meta and actions.",
      show: pt ? "Mostrar" : "Show",
      hide: pt ? "Esconder" : "Hide",
      empty: pt ? "Sem alertas." : "No alerts.",
    };
  }, [pt]);

  return (
    <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-ink-900">{t.title}</div>
          <div className="mt-1 text-sm text-ink-600">{t.subtitle}</div>
        </div>

        <button
          onClick={() => setOpen((s) => !s)}
          className="rounded-full border border-border-soft bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-neutral-50"
        >
          {open ? t.hide : t.show}
        </button>
      </div>

      {!open ? (
        <div className="mt-4 rounded-2xl border border-border-soft bg-neutral-50 p-4 text-sm text-ink-700">
          Toggle <span className="font-semibold">{t.show}</span> to view full
          alert payloads.
        </div>
      ) : alerts.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-border-soft bg-neutral-50 p-4 text-sm text-ink-700">
          {t.empty}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {alerts.slice(0, 25).map((a) => (
            <div
              key={a.id}
              className="rounded-2xl border border-border-soft bg-white p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-border-soft bg-neutral-50 px-2.5 py-1 text-xs font-semibold text-ink-700">
                  {a.type}
                </span>
                <span className="rounded-full border border-border-soft bg-neutral-50 px-2.5 py-1 text-xs font-semibold text-ink-700">
                  {a.severity}
                </span>
                {a.dedupe_key ? (
                  <span className="rounded-full border border-border-soft bg-neutral-50 px-2.5 py-1 text-xs font-semibold text-ink-700">
                    dedupe: {a.dedupe_key}
                  </span>
                ) : null}
              </div>

              <div className="mt-2 text-sm font-semibold text-ink-900">
                {a.title}
              </div>
              <div className="mt-1 text-sm text-ink-700">{a.message}</div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-border-soft bg-neutral-50 p-3">
                  <div className="text-xs font-semibold text-ink-500">
                    Action
                  </div>
                  <pre className="mt-2 overflow-auto text-xs text-ink-800">
                    {JSON.stringify(a.action ?? null, null, 2)}
                  </pre>
                </div>

                <div className="rounded-2xl border border-border-soft bg-neutral-50 p-3">
                  <div className="text-xs font-semibold text-ink-500">Meta</div>
                  <pre className="mt-2 overflow-auto text-xs text-ink-800">
                    {JSON.stringify(a.meta ?? null, null, 2)}
                  </pre>
                </div>
              </div>

              <div className="mt-2 text-xs text-ink-500">
                {String(a.created_at).slice(0, 19).replace("T", " ")}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}