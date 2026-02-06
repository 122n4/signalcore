"use client";

import React, { useMemo } from "react";
import type { UserAlert } from "@/lib/alerts/types";

export function AlertsHumanPanel({
  alerts,
  onDismiss,
  onClearAll,
  locale = "en",
}: {
  alerts: UserAlert[];
  onDismiss: (id: string) => void;
  onClearAll: () => void;
  locale?: "en" | "pt";
}) {
  const pt = locale === "pt";

  const t = useMemo(() => {
    return {
      title: pt ? "O que o SignalCore detetou" : "What SignalCore detected",
      subtitle: pt
        ? "Isto é o que precisa da tua atenção. Sem ruído. Sem pânico."
        : "This is what needs your attention. No noise. No panic.",
      clear: pt ? "Limpar tudo" : "Clear all",
      empty: pt
        ? "Sem alertas. O teu plano está estável."
        : "No alerts. Your plan is stable.",
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
          onClick={onClearAll}
          className="rounded-full border border-border-soft bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-neutral-50"
        >
          {t.clear}
        </button>
      </div>

      {alerts.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-border-soft bg-neutral-50 p-4 text-sm text-ink-700">
          {t.empty}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {alerts.slice(0, 20).map((a) => (
            <HumanAlertCard key={a.id} a={a} onDismiss={onDismiss} />
          ))}
        </div>
      )}
    </div>
  );
}

function HumanAlertCard({
  a,
  onDismiss,
}: {
  a: UserAlert;
  onDismiss: (id: string) => void;
}) {
  const tone =
    a.severity === "danger"
      ? "border-rose-200 bg-rose-50"
      : a.severity === "warning"
      ? "border-amber-200 bg-amber-50"
      : a.severity === "success"
      ? "border-emerald-200 bg-emerald-50"
      : "border-border-soft bg-neutral-50";

  return (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-ink-900">{a.title}</div>
          <div className="mt-1 text-sm text-ink-700 leading-relaxed">
            {a.message}
          </div>

          {a.action?.href ? (
            <a
              href={a.action.href}
              className="mt-3 inline-flex items-center rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-ink-800 shadow-soft hover:opacity-95"
            >
              {a.action.label ?? "Open"}
            </a>
          ) : null}

          <div className="mt-2 text-xs text-ink-500">
            {String(a.created_at).slice(0, 19).replace("T", " ")}
          </div>
        </div>

        <button
          onClick={() => onDismiss(a.id)}
          className="shrink-0 rounded-full border border-border-soft bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-neutral-50"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}