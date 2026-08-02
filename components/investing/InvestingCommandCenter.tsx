"use client";

import { buildInvestingCommandModel } from "@/lib/investing/ui/commandCenter";

const VIEW_COPY: Record<string, { eyebrow: string; title: string; reason: string; action: string }> = {
  daily: {
    eyebrow: "Today’s priority",
    title: "One decision. Fully explained.",
    reason: "Start here to see what requires attention, why it matters and whether any capital action is justified today.",
    action: "Review today",
  },
  planning: {
    eyebrow: "Investment mandate",
    title: "Turn your objective into clear boundaries.",
    reason: "Your goal, horizon and risk posture govern every recommendation Syntrake makes. Change them only when your circumstances change.",
    action: "Review plan",
  },
  portfolio: {
    eyebrow: "Source of truth",
    title: "Keep the portfolio accurate and actionable.",
    reason: "Syntrake uses these holdings to detect concentration, drift and missing exposure. Correct data produces credible decisions.",
    action: "Review holdings",
  },
  advisor: {
    eyebrow: "Strategic explanation",
    title: "Understand why before changing course.",
    reason: "Advisor explains the structural issue, its impact and the correction path. Execution remains separate and explicit.",
    action: "Review strategy",
  },
  autonomy: {
    eyebrow: "Controlled automation",
    title: "Automation stays inside your mandate.",
    reason: "Review permissions, safeguards and execution boundaries before allowing any automated workflow.",
    action: "Review controls",
  },
};

export default function InvestingCommandCenter(props: {
  activeView: string;
  hasPlan: boolean;
  onNavigate: (href: string) => void;
}) {
  const missingPlan = buildInvestingCommandModel({ hasPlan: false, hasHoldings: false, doneToday: false });
  const page = VIEW_COPY[props.activeView] ?? VIEW_COPY.daily;
  const title = props.hasPlan ? page.title : missingPlan.title;
  const reason = props.hasPlan ? page.reason : missingPlan.reason;
  const eyebrow = props.hasPlan ? page.eyebrow : missingPlan.eyebrow;
  const actionLabel = props.hasPlan ? page.action : missingPlan.actionLabel;
  const actionHref = props.hasPlan ? `/app?tab=${props.activeView}&mode=investing` : missingPlan.actionHref;
  const steps = [
    { key: "planning", label: "Plan" },
    { key: "portfolio", label: "Portfolio" },
    { key: "daily", label: "Today" },
    { key: "advisor", label: "Review" },
  ];

  return (
    <section className="overflow-hidden rounded-[28px] border border-slate-700/70 bg-[radial-gradient(circle_at_85%_0%,rgba(59,130,246,.16),transparent_34%),linear-gradient(145deg,#101b31_0%,#0a1222_58%,#080f1d_100%)] text-white shadow-[0_28px_80px_rgba(2,8,23,.28)]">
      <div className="grid gap-0 xl:grid-cols-[1fr_320px]">
        <div className="p-6 md:p-8">
          <span className="rounded-full border border-blue-300/25 bg-blue-300/10 px-3 py-1 text-[11px] font-black uppercase tracking-[.18em] text-blue-100">{eyebrow}</span>
          <h1 className="mt-5 max-w-3xl text-3xl font-black tracking-[-.045em] text-white md:text-[42px] md:leading-[1.06]">{title}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">{reason}</p>
          {!props.hasPlan || props.activeView !== "daily" ? (
            <button type="button" onClick={() => props.onNavigate(actionHref)} className="mt-6 rounded-2xl bg-blue-400 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-blue-300">
              {actionLabel}
            </button>
          ) : null}
        </div>

        <div className="border-t border-slate-700/70 bg-black/10 p-6 xl:border-l xl:border-t-0">
          <div className="text-[11px] font-black uppercase tracking-[.18em] text-slate-500">Investing path</div>
          <p className="mt-2 text-sm leading-6 text-slate-400">The detailed figures load once in the workspace below. Navigation stays instant.</p>
          <div className="mt-5 space-y-2">
            {steps.map((step, index) => {
              const active = step.key === props.activeView;
              const planDone = step.key === "planning" && props.hasPlan;
              return (
                <button key={step.key} type="button" onClick={() => props.onNavigate(`/app?tab=${step.key}&mode=investing`)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${active ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/[.05] hover:text-slate-200"}`}>
                  <span className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-black ${planDone ? "bg-emerald-400/15 text-emerald-300" : active ? "bg-blue-400 text-slate-950" : "border border-slate-600"}`}>{planDone ? "✓" : index + 1}</span>
                  <span className="font-semibold">{step.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
