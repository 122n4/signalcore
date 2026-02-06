"use client";

import React from "react";
import { StressResult } from "@/lib/core/types";
import { journal } from "@/lib/journal/logger";
import { pct, severityFromImpact } from "@/lib/risk/utils";

function badge(sev: "low" | "medium" | "high") {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border";
  if (sev === "high") return `${base} border-red-200 bg-red-50 text-red-700`;
  if (sev === "medium") return `${base} border-amber-200 bg-amber-50 text-amber-700`;
  return `${base} border-emerald-200 bg-emerald-50 text-emerald-700`;
}

export function StressTests(props: { results: StressResult[]; onRun?: (scenario: string) => void }) {
  const { results, onRun } = props;

  function runScenario(s: string) {
    journal.log({
      type: "stress_test_run",
      title: `Stress test: ${s}`,
      details: "User ran a stress test scenario.",
      meta: { scenario: s },
    });
    onRun?.(s);
  }

  const scenarios = ["2008-like equity crash", "Rates shock", "USD -10%", "Tech drawdown"];

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-sm font-semibold">Stress tests</div>
          <div className="text-xs text-neutral-500">Scenario-style shocks (v1 proxies). Use to validate guardrails.</div>
        </div>

        <div className="flex flex-wrap gap-2">
          {scenarios.map((s) => (
            <button
              key={s}
              onClick={() => runScenario(s)}
              className="rounded-xl border border-neutral-200 px-3 py-1.5 text-xs hover:bg-neutral-50"
            >
              Run: {s}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-neutral-500">
            <tr>
              <th className="py-2">Scenario</th>
              <th className="py-2">Impact</th>
              <th className="py-2">Severity</th>
              <th className="py-2">Top contributors</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => {
              const sev = severityFromImpact(r.portfolioImpactPct);
              return (
                <tr key={r.scenario} className="border-t border-neutral-200">
                  <td className="py-2 font-medium text-neutral-900">{r.scenario}</td>
                  <td className="py-2 font-semibold text-neutral-900">{pct(r.portfolioImpactPct)}</td>
                  <td className="py-2">
                    <span className={badge(sev)}>{sev.toUpperCase()}</span>
                  </td>
                  <td className="py-2 text-neutral-700">
                    {r.topContributors.slice(0, 3).map((c, i) => (
                      <span key={c.name}>
                        {c.name} ({pct(c.impactPct)})
                        {i < 2 ? " · " : ""}
                      </span>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-xs text-neutral-500">
        Next: connect Engine v2 covariance + factor/regime shocks for real stress attribution.
      </div>
    </div>
  );
}