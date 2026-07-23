import type { ReactNode } from "react";

import type { InvestingOperatingLoopSummary } from "@/lib/investing/ui/operatingLoop";

type LoopAction = {
  label: string;
  href?: string;
  onClick?: () => void;
};

function clsx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function formatMoneyEur(value: number) {
  const sign = value < 0 ? "-" : "";
  const amount = Math.round(Math.abs(value));
  const grouped = String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}${grouped} EUR`;
}

function renderAction(action: LoopAction, primary: boolean) {
  const baseClass = primary
    ? "inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white"
    : "inline-flex items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900";

  if (action.href) {
    return (
      <a key={`${action.label}-${primary ? "primary" : "secondary"}`} href={action.href} className={baseClass}>
        {action.label}
      </a>
    );
  }

  return (
    <button
      key={`${action.label}-${primary ? "primary" : "secondary"}`}
      type="button"
      onClick={action.onClick}
      className={baseClass}
    >
      {action.label}
    </button>
  );
}

export default function InvestingOperatingLoopRail(props: {
  summary: InvestingOperatingLoopSummary;
  theme?: "light" | "dark";
  primaryAction?: LoopAction | null;
  secondaryAction?: LoopAction | null;
  rightBadge?: ReactNode;
}) {
  const theme = props.theme ?? "light";
  const isDark = theme === "dark";

  const shellClass = isDark
    ? "rounded-[22px] border border-[#23314c] bg-[linear-gradient(180deg,#101a2f_0%,#0c1526_100%)] p-5 text-[#eef5ff] shadow-[0_18px_50px_rgba(0,0,0,.22)]"
    : "rounded-[22px] border border-zinc-200 bg-white p-5 text-zinc-900 shadow-sm";
  const subTextClass = isDark ? "text-[#9bb0c9]" : "text-zinc-600";
  const metricCardClass = isDark
    ? "rounded-2xl border border-[#23314c] bg-[#0d182d] px-4 py-3"
    : "rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3";
  const stepClass = (state: "done" | "active" | "idle") =>
    clsx(
      "rounded-2xl border px-4 py-3",
      isDark
        ? state === "done"
          ? "border-emerald-500/30 bg-emerald-500/10"
          : state === "active"
            ? "border-sky-500/30 bg-sky-500/10"
            : "border-[#23314c] bg-[#0d182d]"
        : state === "done"
          ? "border-emerald-200 bg-emerald-50"
          : state === "active"
            ? "border-sky-200 bg-sky-50"
            : "border-zinc-200 bg-zinc-50",
    );
  const stepToneClass = (state: "done" | "active" | "idle") =>
    isDark
      ? state === "done"
        ? "text-emerald-200"
        : state === "active"
          ? "text-sky-100"
          : "text-[#a6b7cf]"
      : state === "done"
        ? "text-emerald-700"
        : state === "active"
          ? "text-sky-700"
          : "text-zinc-700";

  return (
    <section className={shellClass}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className={clsx("text-[11px] font-semibold uppercase tracking-[0.18em]", isDark ? "text-[#91a3bc]" : "text-zinc-500")}>
            Investing operating loop
          </div>
          <div className={clsx("mt-2 text-2xl font-semibold tracking-tight", isDark ? "text-white" : "text-zinc-900")}>
            {props.summary.headline}
          </div>
          <p className={clsx("mt-2 max-w-2xl text-sm leading-7", subTextClass)}>{props.summary.body}</p>
        </div>
        {props.rightBadge ? <div className="shrink-0">{props.rightBadge}</div> : null}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <div className={metricCardClass}>
          <div className={clsx("text-[11px] font-semibold uppercase tracking-[0.16em]", isDark ? "text-[#7f95b2]" : "text-zinc-500")}>Loop progress</div>
          <div className={clsx("mt-2 text-2xl font-semibold", isDark ? "text-white" : "text-zinc-900")}>
            {props.summary.progressDone}/{props.summary.progressTotal}
          </div>
          <div className={clsx("mt-1 text-xs", subTextClass)}>{props.summary.completionPct}% complete</div>
        </div>
        <div className={metricCardClass}>
          <div className={clsx("text-[11px] font-semibold uppercase tracking-[0.16em]", isDark ? "text-[#7f95b2]" : "text-zinc-500")}>Streak</div>
          <div className={clsx("mt-2 text-2xl font-semibold", isDark ? "text-white" : "text-zinc-900")}>{props.summary.streakDays}d</div>
          <div className={clsx("mt-1 text-xs", subTextClass)}>Continuity compounds trust.</div>
        </div>
        <div className={metricCardClass}>
          <div className={clsx("text-[11px] font-semibold uppercase tracking-[0.16em]", isDark ? "text-[#7f95b2]" : "text-zinc-500")}>Receipts</div>
          <div className={clsx("mt-2 text-2xl font-semibold", isDark ? "text-white" : "text-zinc-900")}>{props.summary.receiptsCount}</div>
          <div className={clsx("mt-1 text-xs", subTextClass)}>Proof keeps the loop grounded.</div>
        </div>
        <div className={metricCardClass}>
          <div className={clsx("text-[11px] font-semibold uppercase tracking-[0.16em]", isDark ? "text-[#7f95b2]" : "text-zinc-500")}>Next review</div>
          <div className={clsx("mt-2 text-2xl font-semibold", isDark ? "text-white" : "text-zinc-900")}>{props.summary.nextReviewLabel}</div>
          <div className={clsx("mt-1 text-xs", subTextClass)}>
            Weekly confirmed: {formatMoneyEur(props.summary.weeklyConfirmedEur)}
          </div>
        </div>
      </div>

      <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-black/10">
        <div
          className={clsx(
            "h-full rounded-full",
            isDark ? "bg-[linear-gradient(90deg,#4a88ff_0%,#6db3ff_100%)]" : "bg-[linear-gradient(90deg,#1d4ed8_0%,#60a5fa_100%)]",
          )}
          style={{ width: `${Math.max(0, Math.min(100, props.summary.completionPct))}%` }}
        />
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-4">
        {props.summary.steps.map((step, index) => (
          <div key={step.key} className={stepClass(step.state)}>
            <div className={clsx("text-[11px] font-semibold uppercase tracking-[0.16em]", stepToneClass(step.state))}>
              Step {index + 1}
            </div>
            <div className={clsx("mt-2 text-sm font-semibold", isDark ? "text-white" : "text-zinc-900")}>{step.label}</div>
            <div className={clsx("mt-1 text-xs leading-6", subTextClass)}>{step.detail}</div>
          </div>
        ))}
      </div>

      <div className={clsx("mt-5 rounded-2xl border px-4 py-4", isDark ? "border-[#23314c] bg-[#0b1323]" : "border-zinc-200 bg-zinc-50")}>
        <div className={clsx("text-[11px] font-semibold uppercase tracking-[0.16em]", isDark ? "text-[#7f95b2]" : "text-zinc-500")}>
          Why return
        </div>
        <div className={clsx("mt-2 text-sm leading-7", isDark ? "text-[#d7e6fa]" : "text-zinc-700")}>
          {props.summary.whyReturn}
        </div>
      </div>

      {props.primaryAction || props.secondaryAction ? (
        <div className="mt-5 flex flex-wrap gap-3">
          {props.primaryAction ? renderAction(props.primaryAction, true) : null}
          {props.secondaryAction ? renderAction(props.secondaryAction, false) : null}
        </div>
      ) : null}
    </section>
  );
}
