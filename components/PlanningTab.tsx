"use client";

import { useMemo, useState } from "react";
import { alertsStore } from "@/lib/alerts/clientStore";

type PlanningTabProps = {
  locale: "pt" | "en";
  isPaid: boolean;
};

export default function PlanningTab({ locale, isPaid }: PlanningTabProps) {
  const pt = locale === "pt";
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const t = useMemo(() => {
    return {
      title: pt ? "Planeamento" : "Planning",
      subtitle: pt
        ? "Define o teu objetivo e deixa o SignalCore manter disciplina por ti."
        : "Define your goal, and let SignalCore enforce discipline for you.",

      ctaTitle: pt ? "Plan Alerts" : "Plan Alerts",
      ctaDesc: pt
        ? "O SignalCore vigia o teu plano automaticamente e avisa-te se algo estiver a desviar."
        : "SignalCore monitors your plan automatically and warns you if anything drifts.",

      enable: pt ? "Ativar alertas do plano" : "Enable plan alerts",
      test: pt ? "Testar um alerta" : "Send a test alert",
      done: pt ? "Feito. Alertas ativos ✅" : "Done. Alerts are live ✅",

      proHint: pt
        ? "No Pro, o SignalCore cria alertas inteligentes (drift, breach, weekly brief)."
        : "On Pro, SignalCore auto-creates smart alerts (drift, breach, weekly brief).",

      upgrade: pt ? "Fazer upgrade" : "Upgrade",
    };
  }, [pt]);

  async function enablePlanAlerts() {
    setBusy(true);
    setMsg(null);

    try {
      // 1) Plan drift
      await alertsStore.create({
        type: "planning",
        title: pt ? "Plan drift monitoring enabled" : "Plan drift monitoring enabled",
        message: pt
          ? "Vou avisar-te se o teu portfólio se desviar demasiado do teu plano."
          : "I’ll notify you if your portfolio drifts too far from your plan.",
        severity: "success",
        dedupe_key: "planning_enable_drift_v1",
        action: { label: pt ? "Ver Risk" : "Open Risk", href: "/risk-test" },
      });

      // 2) Guardrails breach
      await alertsStore.create({
        type: "planning",
        title: pt ? "Guardrails alerts enabled" : "Guardrails alerts enabled",
        message: pt
          ? "Vou avisar-te quando houver risco excessivo, concentração, ou drawdown fora do orçamento."
          : "I’ll warn you when risk is excessive, concentration spikes, or drawdown breaches your budget.",
        severity: "info",
        dedupe_key: "planning_enable_guardrails_v1",
        action: { label: pt ? "Ver Advisor" : "Open Advisor", href: "/advisor-test" },
      });

      // 3) Weekly discipline
      await alertsStore.create({
        type: "planning",
        title: pt ? "Weekly discipline check enabled" : "Weekly discipline check enabled",
        message: pt
          ? "Todas as semanas vou resumir o estado do teu plano e o melhor próximo passo."
          : "Every week I’ll summarize your plan health and the next best action.",
        severity: "info",
        dedupe_key: "planning_enable_weekly_v1",
        action: { label: pt ? "Ver Daily" : "Open Daily", href: "/app/daily" },
      });

      setMsg(t.done);
    } catch {
      setMsg(pt ? "Erro ao criar alertas." : "Failed to create alerts.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTestAlert() {
    setBusy(true);
    setMsg(null);

    try {
      await alertsStore.create({
        type: "planning",
        title: pt ? "Teste de alerta" : "Test alert",
        message: pt
          ? "Se estás a ver isto, os alertas estão a funcionar e a gravar no Supabase."
          : "If you see this, alerts are working and saving to Supabase.",
        severity: "warning",
        dedupe_key: `planning_test_alert_${Date.now()}`, // no dedupe for test
        action: { label: pt ? "Ver Alerts" : "Open Alerts", href: "/app/alerts-test" },
      });

      setMsg(pt ? "Alerta enviado ✅" : "Alert sent ✅");
    } catch {
      setMsg(pt ? "Erro ao enviar alerta." : "Failed to send alert.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
        <div className="text-xl font-semibold text-ink-900">{t.title}</div>
        <div className="mt-2 text-sm text-ink-600">{t.subtitle}</div>
      </div>

      <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-ink-900">{t.ctaTitle}</div>
            <div className="mt-1 text-sm text-ink-600">{t.ctaDesc}</div>
          </div>

          {!isPaid && (
            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
              Pro
            </span>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={enablePlanAlerts}
            disabled={busy}
            className="rounded-2xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50"
          >
            {busy ? "…" : t.enable}
          </button>

          <button
            onClick={sendTestAlert}
            disabled={busy}
            className="rounded-2xl border border-border-soft bg-white px-4 py-2 text-sm font-semibold text-ink-800 hover:bg-neutral-50 disabled:opacity-50"
          >
            {busy ? "…" : t.test}
          </button>

          {!isPaid && (
            <a
              href="/pricing"
              className="ml-auto rounded-2xl border border-border-soft bg-white px-4 py-2 text-sm font-semibold text-ink-800 hover:bg-neutral-50"
            >
              {t.upgrade}
            </a>
          )}
        </div>

        {msg && (
          <div className="mt-4 rounded-2xl border border-border-soft bg-neutral-50 p-4 text-sm text-ink-800">
            {msg}
          </div>
        )}

        <div className="mt-4 text-xs text-ink-500">{t.proHint}</div>
      </div>

      {!isPaid ? (
        <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <div className="text-sm font-semibold text-ink-900">
            {pt ? "Plano grátis" : "Free plan"}
          </div>
          <div className="mt-1 text-sm text-ink-600">
            {pt
              ? "Podes criar o teu plano e testar o sistema. No Pro desbloqueias automação real."
              : "You can build your plan and test the system. Pro unlocks real automation."}
          </div>
        </div>
      ) : (
        <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <div className="text-sm font-semibold text-ink-900">
            {pt ? "Premium ativo" : "Premium active"}
          </div>
          <div className="mt-1 text-sm text-ink-600">
            {pt
              ? "Tens o sistema completo a trabalhar por ti."
              : "You have the full system working for you."}
          </div>
        </div>
      )}
    </div>
  );
}