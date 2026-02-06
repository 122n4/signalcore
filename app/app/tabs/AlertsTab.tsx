"use client";

import React, { useMemo } from "react";
import { useAlerts } from "@/lib/alerts/useAlerts";
import { usePaid } from "@/lib/usePaid";

import { AlertsHumanPanel } from "@/components/alerts/AlertsHumanPanel";
import { AlertsProPanel } from "@/components/alerts/AlertsProPanel";
import { AlertsCopilotPanel } from "@/components/alerts/AlertsCopilotPanel";

type AlertsTabProps = {
  locale?: "en" | "pt";
};

export default function AlertsTab({ locale = "en" }: AlertsTabProps) {
  const { isPaid } = usePaid();
  const pt = locale === "pt";

  const { alerts, loading, dismiss, dismissAll } = useAlerts();

  const t = useMemo(() => {
    return {
      title: pt ? "Alertas" : "Alerts",
      subtitle: pt
        ? "O SignalCore trabalha por ti mesmo quando estás offline."
        : "SignalCore works for you even when you’re offline.",
      pro: pt ? "Camada Pro" : "Pro layer",
      locked: pt
        ? "O Pro desbloqueia alertas inteligentes e automação."
        : "Pro unlocks smart alerts and automation.",
      upgrade: pt ? "Upgrade" : "Upgrade",
    };
  }, [pt]);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
      <div className="space-y-4">
        <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <div className="text-xl font-semibold text-ink-900">{t.title}</div>
          <div className="mt-2 text-sm text-ink-600">{t.subtitle}</div>
          {loading ? (
            <div className="mt-3 text-xs text-ink-500">Loading…</div>
          ) : (
            <div className="mt-3 text-xs text-ink-500">
              Active alerts: {alerts.length}
            </div>
          )}
        </div>

        <AlertsHumanPanel
          alerts={alerts}
          onDismiss={dismiss}
          onClearAll={dismissAll}
          locale={locale}
        />

        <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-ink-900">{t.pro}</div>
              <div className="mt-1 text-sm text-ink-600">{t.locked}</div>
            </div>

            {!isPaid && (
              <a
                href="/pricing"
                className="rounded-2xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
              >
                {t.upgrade}
              </a>
            )}
          </div>
        </div>

        <AlertsProPanel alerts={alerts} locale={locale} />
      </div>

      <div className="space-y-4">
        <AlertsCopilotPanel alerts={alerts} locale={locale} />

        <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <div className="text-sm font-semibold text-ink-900">
            Retention logic (why this converts)
          </div>
          <div className="mt-2 text-sm text-ink-600 leading-relaxed">
            Alerts make SignalCore feel alive. Users subscribe when they feel the
            system is protecting them and guiding them daily.
          </div>

          <div className="mt-4 rounded-2xl border border-border-soft bg-neutral-50 p-4 text-sm text-ink-700">
            The best products aren’t “tools”.
            <br />
            They are <span className="font-semibold">systems</span>.
          </div>
        </div>
      </div>
    </div>
  );
}