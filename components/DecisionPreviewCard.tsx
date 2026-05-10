import type { LandingDecisionPreview } from "@/lib/landing/landingCopy";

function formatSignedPct(v: number) {
  const rounded = Math.round(v * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}%`;
}

type DecisionPreviewCardProps = {
  title: string;
  data: LandingDecisionPreview;
  labels: {
    autopilotConfidence: string;
    edgeVsBaseline: string;
    reason: string;
    nextEvaluation: string;
  };
};

export default function DecisionPreviewCard({ title, data, labels }: DecisionPreviewCardProps) {
  const decisionTone =
    data.decision === "BUY"
      ? "good"
      : data.decision === "REDUCE" || data.decision === "CLOSE"
        ? "warn"
        : "neutral";
  const toneClass =
    decisionTone === "good"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : decisionTone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-zinc-200 bg-zinc-100 text-zinc-800";

  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.6)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</div>
        {data.stateLabel ? <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-[11px] font-semibold text-zinc-700">{data.stateLabel}</span> : null}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <div className="text-4xl font-semibold tracking-tight text-zinc-950">{data.decision}</div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${toneClass}`}>{data.decision}</span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">{labels.autopilotConfidence}</div>
          <div className="mt-1 text-xl font-semibold text-zinc-900">{Math.round(data.autopilotConfidencePct)}%</div>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">{labels.edgeVsBaseline}</div>
          <div className="mt-1 text-xl font-semibold text-zinc-900">{formatSignedPct(data.edgeVsBaselinePct)}</div>
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-700">
        <span className="font-semibold text-zinc-900">{labels.reason}:</span> {data.reason}
      </div>

      <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
        <span className="font-semibold text-zinc-900">{labels.nextEvaluation}:</span> {data.nextEvaluationLabel}
      </div>
    </div>
  );
}