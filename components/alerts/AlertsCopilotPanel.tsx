"use client";

import React, { useMemo, useState } from "react";
import type { UserAlert } from "@/lib/alerts/types";
import { alertsStore } from "@/lib/alerts/clientStore";

type Msg = { role: "user" | "assistant"; content: string };

export function AlertsCopilotPanel({
  locale = "en",
  alerts,
}: {
  locale?: "en" | "pt";
  alerts: UserAlert[];
}) {
  const pt = locale === "pt";
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content: pt
        ? "Posso sugerir alertas melhores, remover ruido e deixar o Syntrake a trabalhar por ti."
        : "I can suggest better alerts, remove noise, and keep Syntrake working for you.",
    },
  ]);

  const quick = useMemo(
    () =>
      pt
        ? [
            "Sugere os 3 alertas mais importantes para mim.",
            "Remove alertas desnecessarios.",
            "Cria alertas de drift e breach.",
            "Quero um briefing semanal automatico.",
          ]
        : [
            "Suggest the 3 most important alerts for me.",
            "Remove unnecessary alerts.",
            "Create drift + breach alerts.",
            "I want an automatic weekly briefing.",
          ],
    [pt]
  );

  async function send(text: string) {
    const t = text.trim();
    if (!t) return;

    setMessages((m) => [...m, { role: "user", content: t }]);
    setInput("");
    setBusy(true);

    try {
      const nowKey = Date.now();

      if (t.toLowerCase().includes("weekly") || t.toLowerCase().includes("semanal")) {
        await alertsStore.create({
          type: "advisor",
          title: "Weekly briefing enabled",
          message: pt
            ? "Todas as semanas vou resumir o teu plano, drift e o melhor proximo passo."
            : "Every week I'll summarize your plan, drift, and the next best action.",
          severity: "success",
          dedupe_key: "alerts_weekly_briefing_v1",
          action: { label: pt ? "Abrir Daily" : "Open Daily", href: "/app?tab=daily" },
        });

        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: pt ? "Feito. Ativei o briefing semanal (sem spam)." : "Done. Weekly briefing is enabled (no spam).",
          },
        ]);
      } else {
        await alertsStore.create({
          type: "risk",
          title: "Risk drift watch enabled",
          message: pt
            ? "Vou avisar-te se a tua carteira ficar mais arriscada do que o teu perfil permite."
            : "I'll notify you if your portfolio becomes riskier than your profile allows.",
          severity: "warning",
          dedupe_key: "alerts_risk_drift_watch_v1",
          action: { label: pt ? "Abrir Risk" : "Open Risk", href: "/risk-test" },
          meta: { source: "alerts_copilot", createdAt: nowKey },
        });

        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: pt
              ? "Ativei um alerta institucional de drift de risco. Se quiseres, adiciono breach + concentracao."
              : "Enabled an institutional risk drift alert. If you want, I can add breach + concentration.",
          },
        ]);
      }
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: pt ? "Erro ao criar alertas. Tenta novamente." : "Failed to create alerts. Try again.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-ink-900">Copilot (Alerts)</div>
          <div className="mt-1 text-sm text-ink-600">
            {pt ? "O Copilot cria alertas inteligentes sem te bombardear." : "Copilot creates smart alerts without spamming you."}
          </div>
        </div>

        <span className="rounded-full border border-border-soft bg-neutral-50 px-3 py-1 text-xs font-semibold text-ink-700">
          {alerts.length} active
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {quick.map((q) => (
          <button
            key={q}
            onClick={() => send(q)}
            className="rounded-full border border-border-soft bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-neutral-50"
          >
            {q}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {messages.slice(-8).map((m, i) => (
          <div
            key={i}
            className={`rounded-2xl border px-4 py-3 text-sm ${
              m.role === "assistant" ? "border-border-soft bg-neutral-50 text-ink-900" : "border-border-soft bg-white text-ink-900"
            }`}
          >
            <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void send(input);
          }}
          placeholder={pt ? "Pede alertas..." : "Ask for alerts..."}
          className="h-11 w-full rounded-2xl border border-border-soft bg-white px-4 text-sm outline-none"
        />
        <button
          onClick={() => void send(input)}
          disabled={busy || !input.trim()}
          className="h-11 rounded-2xl bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "..." : "Send"}
        </button>
      </div>
    </div>
  );
}

