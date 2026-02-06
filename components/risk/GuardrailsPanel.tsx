"use client";

import React from "react";
import { Guardrail } from "@/lib/core/types";
import { journal } from "@/lib/journal/logger";

function badge(status: Guardrail["status"]) {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border";
  if (status === "ok") return `${base} border-emerald-200 bg-emerald-50 text-emerald-700`;
  if (status === "near") return `${base} border-amber-200 bg-amber-50 text-amber-700`;
  return `${base} border-red-200 bg-red-50 text-red-700`;
}

export function GuardrailsPanel({ guardrails }: { guardrails: Guardrail[] }) {
  React.useEffect(() => {
    const breaches = guardrails.filter((g) => g.status === "breach");
    if (breaches.length) {
      journal.log({
        type: "guardrail_breach",
        title: `Guardrail breach (${breaches.length})`,
        details: breaches.map((b) => `${b.label}: ${b.value}`).join("\n"),
        meta: { breaches },
      });
    }
  }, [guardrails]);

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <div className="text-sm font-semibold">Guardrails</div>
        <div className="text-xs text-neutral-500">
          Policy limits (should come from Planning). Status computed from current holdings (proxy).
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {guardrails.map((g) => (
          <div key={g.label} className="rounded-xl border border-neutral-200 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-neutral-900">{g.label}</div>
                <div className="text-xs text-neutral-600">{g.value}</div>
                {g.detail ? <div className="mt-1 text-xs text-neutral-500">{g.detail}</div> : null}
              </div>
              <span className={badge(g.status)}>{g.status.toUpperCase()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}