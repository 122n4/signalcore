"use client";

import React, { useMemo } from "react";
import { Plan } from "@/lib/planning/types";

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function sumBuckets(plan: Plan) {
  return (plan.buckets ?? []).reduce((s: number, b: any) => s + (b.targetPct ?? 0), 0);
}

export default function PlanCoherenceCard({
  plan,
  onApplyFixes,
}: {
  plan: Plan;
  onApplyFixes: (next: Plan) => void;
}) {
  const report = useMemo(() => {
    const issues: { id: string; title: string; fix?: (p: Plan) => Plan }[] = [];

    const sum = sumBuckets(plan);
    if (sum !== 100) {
      issues.push({
        id: "bucket_sum",
        title: `Bucket weights sum to ${sum}%. Must be 100%.`,
        fix: (p) => {
          const s = sumBuckets(p);
          if (!s) return p;
          const next = {
            ...p,
            buckets: p.buckets.map((b: any) => ({
              ...b,
              targetPct: clamp(Math.round((b.targetPct / s) * 100), 0, 100),
            })),
          };
          return next;
        },
      });
    }

    if ((plan.guardrails?.maxSinglePositionPct ?? 0) > 20) {
      issues.push({
        id: "single_pos",
        title: "Single position cap is too high for an institutional plan.",
        fix: (p) => ({
          ...p,
          guardrails: { ...p.guardrails, maxSinglePositionPct: 12 },
        }),
      });
    }

    if ((plan.guardrails?.maxTop5ConcentrationPct ?? 0) > 70) {
      issues.push({
        id: "top5",
        title: "Top 5 concentration is too high.",
        fix: (p) => ({
          ...p,
          guardrails: { ...p.guardrails, maxTop5ConcentrationPct: 55 },
        }),
      });
    }

    if ((plan.policy?.maxPositions ?? 0) < 10) {
      issues.push({
        id: "positions",
        title: "Max positions is too low. Diversification will suffer.",
        fix: (p) => ({
          ...p,
          policy: { ...p.policy, maxPositions: 20 },
        }),
      });
    }

    if (!plan.policy?.forbidden || String(plan.policy.forbidden).length < 10) {
      issues.push({
        id: "forbidden",
        title: "Policy missing forbidden assets. This weakens discipline.",
        fix: (p) => ({
          ...p,
          policy: {
            ...p.policy,
            forbidden: "Leverage, illiquid microcaps, meme pumps, unhedged concentrated bets",
          },
        }),
      });
    }

    const score = clamp(100 - issues.length * 12, 35, 100);

    return { score, issues };
  }, [plan]);

  const grade =
    report.score >= 90
      ? "Institutional"
      : report.score >= 75
      ? "Strong"
      : report.score >= 60
      ? "Needs work"
      : "Fragile";

  function applyFixes() {
    let next = { ...plan };
    for (const i of report.issues) {
      if (i.fix) next = i.fix(next);
    }
    next.updatedAt = Date.now();
    onApplyFixes(next);
  }

  return (
    <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-ink-900">
            Plan Coherence
          </div>
          <div className="mt-1 text-sm text-ink-600">
            Institutional checks to prevent hidden plan failure.
          </div>
        </div>

        <div className="text-right">
          <div className="text-xl font-semibold text-ink-900">{report.score}</div>
          <div className="text-xs font-semibold text-ink-500">{grade}</div>
        </div>
      </div>

      {report.issues.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          No coherence issues detected. This plan is clean.
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {report.issues.slice(0, 6).map((i) => (
            <div
              key={i.id}
              className="rounded-2xl border border-border-soft bg-neutral-50 p-3 text-sm text-ink-800"
            >
              {i.title}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <button
          onClick={applyFixes}
          disabled={report.issues.length === 0}
          className="rounded-2xl bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Apply Fixes
        </button>
      </div>

      <div className="mt-3 text-xs text-ink-500">
        This is not advice. It is a discipline layer.
      </div>
    </div>
  );
}
