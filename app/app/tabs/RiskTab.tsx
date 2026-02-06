"use client";

import React from "react";
import { CopilotToolbelt } from "@/components/copilot/CopilotToolbelt";
import { RiskSnapshotCards } from "@/components/risk/RiskSnapshot";
import { RiskDriversTable } from "@/components/risk/RiskDriversTable";
import { StressTests } from "@/components/risk/StressTests";
import { GuardrailsPanel } from "@/components/risk/GuardrailsPanel";
import { RiskActions } from "@/components/risk/RiskActions";
import { RiskNarrative } from "@/components/risk/RiskNarrative";
import { MiniJournal } from "@/components/journal/MiniJournal";

import { RiskHorizonSelector, RiskHorizon } from "@/components/risk/RiskHorizon";
import { RiskBudget } from "@/components/risk/RiskBudget";
import { RiskHeatmap } from "@/components/risk/RiskHeatmap";
import { WhatIfPanel } from "@/components/risk/WhatIfPanel";

import {
  Candidate,
  Guardrail,
  RiskDriverRow,
  RiskSnapshot,
  StressResult,
} from "@/lib/core/types";

import { buildNarrative, fallbackCandidates, scaleSnapshotByHorizon, scaleStressByHorizon } from "@/lib/risk/utils";

const quickActions = [
  { id: "qa1", label: "Why did risk increase?", question: "Why did my portfolio risk increase recently? Give 3 causes and 3 actions (candidates)." },
  { id: "qa2", label: "Biggest hidden risk", question: "What is the biggest hidden risk in my portfolio? Explain and propose 3 actions (candidates)." },
  { id: "qa3", label: "Reduce drawdown", question: "Reduce expected drawdown without killing expected return. Propose 4 actions (candidates) with tradeoffs." },
  { id: "qa4", label: "Stress test + actions", question: "Based on stress tests, propose 3 tail-risk actions. Return candidates with guardrails checks." },
];

function mockSnapshot(): RiskSnapshot {
  return {
    volAnnual: 0.142,
    var95: 0.061,
    maxDrawdownEst: 0.28,
    concentrationTop5: 0.37,
    fxExposurePct: 0.54,
  };
}

function mockDrivers(): RiskDriverRow[] {
  return [
    { name: "US Equities", weightPct: 0.48, volAnnual: 0.18, riskContributionPct: 0.52 },
    { name: "Tech Tilt", weightPct: 0.16, volAnnual: 0.28, riskContributionPct: 0.22 },
    { name: "Emerging Markets", weightPct: 0.08, volAnnual: 0.22, riskContributionPct: 0.10 },
    { name: "Bonds", weightPct: 0.18, volAnnual: 0.08, riskContributionPct: 0.08 },
    { name: "Crypto", weightPct: 0.03, volAnnual: 0.60, riskContributionPct: 0.08 },
  ];
}

function mockStress(): StressResult[] {
  return [
    {
      scenario: "2008-like equity crash",
      portfolioImpactPct: -0.23,
      topContributors: [
        { name: "US Equities", impactPct: -0.14 },
        { name: "Tech Tilt", impactPct: -0.07 },
        { name: "EM", impactPct: -0.03 },
      ],
    },
    {
      scenario: "Rates shock",
      portfolioImpactPct: -0.06,
      topContributors: [
        { name: "Bonds", impactPct: -0.04 },
        { name: "US Equities", impactPct: -0.02 },
      ],
    },
    {
      scenario: "USD -10%",
      portfolioImpactPct: -0.03,
      topContributors: [{ name: "USD exposure", impactPct: -0.03 }],
    },
    {
      scenario: "Tech drawdown",
      portfolioImpactPct: -0.09,
      topContributors: [
        { name: "Tech Tilt", impactPct: -0.06 },
        { name: "US Equities", impactPct: -0.03 },
      ],
    },
  ];
}

function mockGuardrails(snapshot: RiskSnapshot): Guardrail[] {
  const dd = snapshot.maxDrawdownEst;
  return [
    { label: "Max single position", value: "≤ 7%", status: "near", detail: "Top holding ~6.6% (proxy)." },
    { label: "Equity exposure", value: "≤ 70%", status: "ok", detail: "Current ~64% (proxy)." },
    { label: "Crypto exposure", value: "≤ 5%", status: "ok", detail: "Current ~3% (proxy)." },
    {
      label: "Expected drawdown",
      value: "≤ 25%",
      status: dd > 0.25 ? "breach" : dd > 0.22 ? "near" : "ok",
      detail: `Estimated ${Math.round(dd * 100)}% (proxy).`,
    },
  ];
}

export default function RiskTab() {
  const [horizon, setHorizon] = React.useState<RiskHorizon>("1M");

  const snapshotBase = React.useMemo(() => mockSnapshot(), []);
  const drivers = React.useMemo(() => mockDrivers(), []);
  const stressBase = React.useMemo(() => mockStress(), []);

  const snapshot = React.useMemo(() => scaleSnapshotByHorizon(snapshotBase, horizon), [snapshotBase, horizon]);
  const stress = React.useMemo(() => scaleStressByHorizon(stressBase, horizon), [stressBase, horizon]);

  const guardrails = React.useMemo(() => mockGuardrails(snapshot), [snapshot]);

  const [candidates, setCandidates] = React.useState<Candidate[]>([]);
  const [lastCopilotSummary, setLastCopilotSummary] = React.useState<string>("");

  const narrative = React.useMemo(() => buildNarrative(snapshot, drivers, guardrails, stress), [snapshot, drivers, guardrails, stress]);

  const copilotState = React.useMemo(() => {
    return {
      horizon,
      snapshot,
      drivers,
      guardrails,
      stress,
      intent: "institutional risk analysis + actionable candidates + quantification",
    };
  }, [horizon, snapshot, drivers, guardrails, stress]);

  const effectiveCandidates = candidates.length ? candidates : fallbackCandidates(snapshot);

  // Risk budget (proxy): allocate risk budget by buckets and compare to used risk contribution.
  const budgetRows = React.useMemo(() => {
    // budget is a product choice; proxy numbers here
    const budgets: Record<string, number> = {
      "US Equities": 0.45,
      "Tech Tilt": 0.15,
      "Emerging Markets": 0.10,
      "Bonds": 0.20,
      "Crypto": 0.10,
    };
    return drivers.map((d) => ({
      bucket: d.name,
      budgetPct: budgets[d.name] ?? 0.10,
      usedPct: d.riskContributionPct,
    }));
  }, [drivers]);

  // Heatmap (proxy): exposures to factors
  const heatmap = React.useMemo(() => {
    const factors = ["Equity beta", "Rates", "Credit", "FX", "Liquidity"];
    const rows = drivers.map((d) => {
      // proxy mapping based on bucket name
      const name = d.name.toLowerCase();
      const f: Record<string, number> = {
        "Equity beta": name.includes("equities") || name.includes("tech") || name.includes("em") ? 0.8 : name.includes("crypto") ? 0.9 : 0.2,
        "Rates": name.includes("bonds") ? 0.85 : 0.25,
        "Credit": name.includes("bonds") ? 0.55 : 0.15,
        "FX": name.includes("em") ? 0.6 : 0.3,
        "Liquidity": name.includes("crypto") ? 0.75 : name.includes("em") ? 0.45 : 0.25,
      };
      return { name: d.name, factors: f };
    });
    return { factors, rows };
  }, [drivers]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-lg font-semibold tracking-tight">Risk</div>
            <div className="text-sm text-neutral-600">
              Institutional risk: horizon-aware snapshot, drivers, stress, budgets, factor map, and quantified actions.
            </div>
          </div>
          <div className="text-xs text-neutral-500">v3 (max) · proxies now · Engine v2 wiring next</div>
        </div>
      </div>

      {/* Horizon */}
      <RiskHorizonSelector value={horizon} onChange={setHorizon} />

      {/* Brief */}
      <RiskNarrative text={narrative} />

      {/* Snapshot */}
      <RiskSnapshotCards snapshot={snapshot} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Left: analysis */}
        <div className="space-y-4 xl:col-span-2">
          <RiskDriversTable rows={drivers} />
          <RiskBudget rows={budgetRows} />
          <RiskHeatmap factors={heatmap.factors} rows={heatmap.rows} />
          <StressTests results={stress} />
          <GuardrailsPanel guardrails={guardrails} />
          <WhatIfPanel snapshot={snapshot} drivers={drivers} />
          <RiskActions candidates={effectiveCandidates} />
        </div>

        {/* Right: Copilot + Journal (sticky) */}
        <div className="space-y-4 xl:sticky xl:top-4 h-fit">
          <CopilotToolbelt
            context="risk"
            state={copilotState}
            title="Copilot — Risk"
            quickActions={quickActions}
            onCandidates={(cands, summary) => {
              setCandidates(cands);
              if (summary) setLastCopilotSummary(summary);
            }}
          />

          {lastCopilotSummary ? (
            <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="text-sm font-semibold">Last Copilot insight</div>
              <div className="mt-2 text-xs text-neutral-700 whitespace-pre-wrap leading-relaxed">{lastCopilotSummary}</div>
            </div>
          ) : null}

          <MiniJournal limit={10} />
        </div>
      </div>
    </div>
  );
}