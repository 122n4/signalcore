"use client";

type WeeklyData = {
  title: string;
  updatedAt: string;
  stance: string;
  regime: string;
  summary: string;
  checklist: string[];
  disclaimers?: string[];
};

export function WeeklyAdvisorView({ data }: { data: WeeklyData | null }) {
  if (!data) {
    return (
      <section className="rounded-3xl border border-border-soft bg-white p-8 shadow-soft">
        <p className="text-xs font-semibold text-ink-500">THIS WEEK</p>
        <p className="mt-3 text-sm text-ink-700">Loading weekly brief…</p>
      </section>
    );
  }

  const updated = new Date(data.updatedAt).toLocaleString();

  return (
    <section className="rounded-3xl border border-border-soft bg-white p-8 shadow-soft">
      <p className="text-xs font-semibold text-ink-500">THIS WEEK</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight">{data.title}</h2>

      <p className="mt-2 text-sm text-ink-700">
        Stance: <span className="font-semibold text-ink-900">{data.stance}</span> · Regime:{" "}
        <span className="font-semibold text-ink-900">{data.regime}</span>
      </p>

      <div className="mt-4 rounded-2xl border border-border-soft bg-canvas-50 p-4">
        <p className="text-sm text-ink-700 italic">{data.summary}</p>
        <p className="mt-2 text-xs text-ink-500">Updated: {updated}</p>
      </div>

      <div className="mt-6">
        <p className="text-sm font-semibold text-ink-900">Weekly checklist</p>
        <ul className="mt-3 space-y-2 text-sm text-ink-700">
          {(data.checklist ?? []).map((x, i) => (
            <li key={i}>• {x}</li>
          ))}
        </ul>
      </div>

      <p className="mt-6 text-xs text-ink-500">
        {(data.disclaimers ?? ["Educational context only."]).join(" ")}
      </p>
    </section>
  );
}