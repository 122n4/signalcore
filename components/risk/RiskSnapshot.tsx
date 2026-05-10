"use client";

import React from "react";
import { RiskSnapshot } from "@/lib/core/types";
import { pct } from "@/lib/risk/utils";

function Card({ label, value, help }: { label: string; value: string; help: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold text-neutral-600">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900">{value}</div>
      <div className="mt-2 text-xs text-neutral-500 leading-relaxed">{help}</div>
    </div>
  );
}

export function RiskSnapshotCards({ snapshot }: { snapshot: RiskSnapshot }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
      <Card
        label="Volatility (annual)"
        value={pct(snapshot.volAnnual)}
        help="Annualized portfolio volatility proxy. Used for budgeting and guardrails."
      />
      <Card
        label="VaR 95%"
        value={pct(snapshot.var95)}
        help="Potential loss over period at 95% confidence (proxy). Not a guarantee."
      />
      <Card
        label="Max drawdown (est.)"
        value={pct(snapshot.maxDrawdownEst)}
        help="Estimated peak-to-trough loss under adverse conditions (proxy)."
      />
      <Card
        label="Top-5 concentration"
        value={pct(snapshot.concentrationTop5)}
        help="Weight in top 5 positions. Higher = more idiosyncratic tail risk."
      />
      <Card
        label="FX exposure"
        value={pct(snapshot.fxExposurePct)}
        help="Share exposed to non-base currency (proxy)."
      />
    </div>
  );
}