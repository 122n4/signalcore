"use client";
import React from "react";
import { Plan } from "@/lib/planning/types";

function field(label: string, value: any, onChange: (v: any) => void, placeholder: string) {
  return (
    <div className="rounded-xl border border-neutral-200 p-3">
      <div className="text-xs font-semibold text-neutral-600">{label}</div>
      <input
        type="number"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
        placeholder={placeholder}
      />
    </div>
  );
}

export default function GuardrailsCard(props: { plan: Plan; onChange: (p: Plan) => void }) {
  const { plan, onChange } = props;

  function setG(key: string, v: any) {
    onChange({ ...plan, guardrails: { ...plan.guardrails, [key]: v }, updatedAt: Date.now() });
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm space-y-3">
      <div>
        <div className="text-sm font-semibold">Guardrails</div>
        <div className="text-xs text-neutral-500">Hard limits. Alerts & Advisor enforce these before profit-seeking.</div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {field("Max drawdown (%)", plan.guardrails.maxDrawdownPct, (v) => setG("maxDrawdownPct", v), "25")}
        {field("Max single position (%)", plan.guardrails.maxSinglePositionPct, (v) => setG("maxSinglePositionPct", v), "10")}
        {field("Top-5 concentration (%)", plan.guardrails.maxTop5ConcentrationPct, (v) => setG("maxTop5ConcentrationPct", v), "40")}
        {field("Turnover cap / month (%)", plan.guardrails.turnoverMonthlyPct, (v) => setG("turnoverMonthlyPct", v), "30")}
        {field("Min diversification score", plan.guardrails.minDiversificationScore, (v) => setG("minDiversificationScore", v), "60")}
      </div>

      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600">
        Pro tip: keep guardrails realistic; too strict creates “false alarms” and blocks goal acceleration.
      </div>
    </div>
  );
}
