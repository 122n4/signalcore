"use client";

import React from "react";

type Tone = "neutral" | "good" | "warn" | "bad";

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200/90 bg-white/90 px-3 py-1 text-[11px] font-medium text-slate-600 shadow-[0_8px_18px_-16px_rgba(79,96,135,0.3)]">
      {children}
    </span>
  );
}

function Badge({
  tone = "neutral",
  children,
}: {
  tone?: Tone;
  children: React.ReactNode;
}) {
  const styles =
    tone === "good"
      ? "border-emerald-200/80 bg-emerald-50/90 text-emerald-700"
      : tone === "warn"
        ? "border-amber-200/80 bg-amber-50/90 text-amber-800"
        : tone === "bad"
          ? "border-rose-200/80 bg-rose-50/90 text-rose-700"
          : "border-slate-200 bg-slate-50/80 text-slate-700";
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold shadow-[0_10px_22px_-18px_rgba(79,96,135,0.32)]",
        styles
      )}
    >
      {children}
    </span>
  );
}

function Chip({
  tone = "neutral",
  children,
}: {
  tone?: Tone;
  children: React.ReactNode;
}) {
  const styles =
    tone === "good"
      ? "border-emerald-200/80 bg-emerald-50/90 text-emerald-700"
      : tone === "warn"
        ? "border-amber-200/80 bg-amber-50/90 text-amber-800"
        : tone === "bad"
          ? "border-rose-200/80 bg-rose-50/90 text-rose-700"
          : "border-slate-200 bg-slate-50/80 text-slate-700";
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium shadow-[0_10px_18px_-16px_rgba(79,96,135,0.26)]",
        styles
      )}
    >
      {children}
    </span>
  );
}

function Card({
  title,
  subtitle,
  right,
  children,
  className,
  headerClassName,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  headerClassName?: string;
}) {
  return (
    <div
      className={clsx(
        "relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.95))] shadow-[0_28px_80px_-58px_rgba(79,96,135,0.26)]",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[linear-gradient(180deg,rgba(226,232,240,0.26),transparent)]" />
      <div
        className={clsx(
          "relative flex items-start justify-between gap-4 px-6 pt-5",
          headerClassName
        )}
      >
        <div className="space-y-1">
          <div className="text-[13px] font-semibold tracking-tight text-slate-900">{title}</div>
          {subtitle ? <div className="text-[12px] text-slate-500">{subtitle}</div> : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
      <div className="relative px-6 pb-6 pt-4">{children}</div>
    </div>
  );
}

type HeaderVariant = "intro" | "simple" | "default";
type HeaderBaseProps = {
  section: "header";
  variant: HeaderVariant;
  onRefresh: () => void;
  refreshing: boolean;
  refreshDisabled: boolean;
};

type IntroHeaderProps = HeaderBaseProps & {
  variant: "intro";
  overnightEvaluationHeadline: string;
  overnightEvaluationSubtext: string;
  overnightEvaluationGeneratedAtLabel: string | null;
  hasPlan: boolean;
  hasHoldings: boolean;
  holdingsCount: number;
  description: string;
};

type SimpleHeaderProps = HeaderBaseProps & {
  variant: "simple";
  description: string;
};

type TrialUrgency = {
  tone: Tone;
  message: string;
};

type DefaultHeaderProps = HeaderBaseProps & {
  variant: "default";
  overnightEvaluationHeadline: string;
  overnightEvaluationSubtext: string;
  overnightEvaluationGeneratedAtLabel: string | null;
  isBeginnerUX: boolean;
  autopilotScore: number;
  safetyScore: number | null;
  growthScore: number | null;
  pressureScore: number | null;
  hasPlan: boolean;
  hasHoldings: boolean;
  holdingsCount: number;
  cycleStateLabel: string;
  cycleStateTone: Tone;
  effectiveAccessLabel: string;
  effectiveAccessTone: Tone;
  showDetails: boolean;
  receiptsCount: number;
  lastSnapshotLabel: string;
  confirmedTodayLabel: string;
  trialUrgency: TrialUrgency | null;
};

type AdvancedCardProps = {
  section: "card";
  variant: "advanced";
  isBeginnerUX: boolean;
  nextBestTone: Tone;
  nextBestBadge: string;
  nextBestSubtitle: string;
  canClose: boolean;
  onCloseTheDay: () => void;
  markingDone: boolean;
  closeTheDayLabel: string;
  primaryTitle: string;
  primaryDesc: string;
  nextBestWhyNowText: string;
  doneToday: boolean;
  nextActionReady: boolean;
  nextActionCountdownLabel: string;
  nextBestReasonChips: string[];
  fallbackReasonChips: string[];
  nextBestMaskedByPaywall: boolean;
  primaryCtaAction: string | null;
  primaryCtaHref: string;
  primaryKind: string;
  primaryCtaLabel: string;
  starterPackLength: number;
  hasPlan: boolean;
  hasHoldings: boolean;
  onApplyStarterPack: () => void;
  applyingStarter: boolean;
  onGoToPlanning: () => void;
  onGoToPortfolio: () => void;
  paywallPreviewStatus: string | null;
  paywallPreviewTitle: string;
  paywallPreviewMessage: string;
  paywallPreviewSubtitle: string;
  paywallPreviewReason: string;
  onOpenPaywall: () => void;
  paywallTrustLine: string;
};

type SimpleCardProps = {
  section: "card";
  variant: "simple";
  simpleDecisionTone: Tone;
  simpleDecision: string;
  simpleCommandLabel: string;
  simpleProbabilityEdgePct: number;
  simpleProbabilityEdgeLabel: string;
  simpleConfidencePct: number;
  simpleShortReason: string;
  simpleExecutionStreakDays: number;
};

export type DecisionHeroProps =
  | IntroHeaderProps
  | SimpleHeaderProps
  | DefaultHeaderProps
  | AdvancedCardProps
  | SimpleCardProps;

function renderHeader(props: IntroHeaderProps | SimpleHeaderProps | DefaultHeaderProps) {
  if (props.variant === "intro") {
    return (
      <div className="mb-6 flex items-start justify-between gap-5">
        <div className="space-y-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Syntrake Daily</div>
          <div className="max-w-4xl space-y-2">
            <h1 className="text-[38px] font-semibold tracking-tight text-slate-900">Today&apos;s Decision</h1>
            <div className="max-w-3xl text-base leading-relaxed text-slate-600">{props.description}</div>
          </div>
          <div className="rounded-[24px] border border-slate-200/90 bg-white/92 px-4 py-4 shadow-[0_18px_42px_-34px_rgba(79,96,135,0.22)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Overnight evaluation context</div>
            <div className="mt-2 text-base font-semibold text-slate-900">{props.overnightEvaluationHeadline}</div>
            <div className="mt-1 text-sm leading-relaxed text-slate-600">{props.overnightEvaluationSubtext}</div>
            {props.overnightEvaluationGeneratedAtLabel ? (
              <div className="mt-2 text-[11px] text-slate-500">Generated at: {props.overnightEvaluationGeneratedAtLabel}</div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="good">First daily briefing</Badge>
            <Badge tone={props.hasPlan ? "good" : "warn"}>{props.hasPlan ? "Plan active" : "Plan missing"}</Badge>
            <Badge tone={props.hasHoldings ? "good" : "warn"}>
              {props.hasHoldings ? `Holdings: ${props.holdingsCount}` : "Holdings: none"}
            </Badge>
          </div>
        </div>
        <button
          onClick={props.onRefresh}
          disabled={props.refreshDisabled}
          className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          {props.refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>
    );
  }

  if (props.variant === "simple") {
    return (
      <div className="mb-6 flex items-start justify-between gap-5">
        <div className="space-y-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Syntrake Daily</div>
          <h1 className="text-[36px] font-semibold tracking-tight text-slate-900">Today&apos;s Decision</h1>
          <div className="max-w-3xl text-base leading-relaxed text-slate-600">{props.description}</div>
        </div>
        <button
          onClick={props.onRefresh}
          disabled={props.refreshDisabled}
          className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          {props.refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>
    );
  }

  return (
    <div className="mb-6 flex items-start justify-between gap-5">
      <div className="space-y-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Syntrake Daily</div>
        <div className="rounded-[24px] border border-slate-200/90 bg-white/92 px-4 py-4 shadow-[0_18px_42px_-34px_rgba(79,96,135,0.22)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Overnight evaluation context</div>
          <div className="mt-2 text-base font-semibold text-slate-900">{props.overnightEvaluationHeadline}</div>
          <div className="mt-1 text-sm leading-relaxed text-slate-600">{props.overnightEvaluationSubtext}</div>
          {props.overnightEvaluationGeneratedAtLabel ? (
            <div className="mt-2 text-[11px] text-slate-500">Generated at: {props.overnightEvaluationGeneratedAtLabel}</div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-3 text-[38px] font-semibold tracking-tight text-slate-900">Today&apos;s Decision</h1>

          {!props.isBeginnerUX ? (
            <Pill>
              Autopilot Score: <span className="ml-1 font-semibold">{props.autopilotScore}</span>
            </Pill>
          ) : null}

          {!props.isBeginnerUX && typeof props.safetyScore === "number" ? (
            <Pill>
              Safety: <span className="ml-1 font-semibold">{Math.round(props.safetyScore)}</span>
            </Pill>
          ) : null}

          {!props.isBeginnerUX && typeof props.growthScore === "number" ? (
            <Pill>
              Growth: <span className="ml-1 font-semibold">{Math.round(props.growthScore)}</span>
            </Pill>
          ) : null}

          {!props.isBeginnerUX && typeof props.pressureScore === "number" ? (
            <Pill>
              Pressure: <span className="ml-1 font-semibold">{Math.round(props.pressureScore)}</span>
            </Pill>
          ) : null}

          <Badge tone={props.hasPlan ? "good" : "warn"}>{props.hasPlan ? "Plan active" : "Plan missing"}</Badge>
          <Badge tone={props.hasHoldings ? "good" : "warn"}>
            {props.hasHoldings ? `Holdings: ${props.holdingsCount}` : "Holdings: none"}
          </Badge>
          <Badge tone={props.cycleStateTone}>{props.cycleStateLabel}</Badge>
          <Badge tone={props.effectiveAccessTone}>{props.effectiveAccessLabel}</Badge>
        </div>

        {props.showDetails ? (
          <div className="flex flex-wrap items-center gap-2">
            <Pill>Receipts: {props.receiptsCount}</Pill>
            <Pill>Last snapshot: {props.lastSnapshotLabel}</Pill>
            <Pill>
              Confirmed today: <span className="ml-1 font-semibold">{props.confirmedTodayLabel}</span>
            </Pill>
          </div>
        ) : null}

        {props.trialUrgency ? (
          <div
            className={clsx(
              "rounded-2xl border px-3 py-2 text-xs font-semibold shadow-[0_12px_24px_-22px_rgba(79,96,135,0.24)]",
              props.trialUrgency.tone === "bad"
                ? "border-rose-200 bg-rose-50 text-rose-900"
                : props.trialUrgency.tone === "warn"
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-emerald-200 bg-emerald-50 text-emerald-900"
            )}
          >
            {props.trialUrgency.message}
          </div>
        ) : null}
      </div>

      <button
        onClick={props.onRefresh}
        disabled={props.refreshDisabled}
        className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
      >
        {props.refreshing ? "Refreshing..." : "Refresh"}
      </button>
    </div>
  );
}

function renderAdvancedCard(props: AdvancedCardProps) {
  const highlightTone =
    props.nextBestTone === "bad"
      ? "border-rose-200/90 bg-gradient-to-br from-rose-50/95 via-white to-rose-50/60"
      : props.nextBestTone === "warn"
        ? "border-amber-200/90 bg-gradient-to-br from-amber-50/95 via-white to-amber-50/60"
        : props.nextBestTone === "good"
          ? "border-emerald-200/90 bg-gradient-to-br from-emerald-50/95 via-white to-emerald-50/60"
          : "border-slate-200/90 bg-gradient-to-br from-slate-50/95 via-white to-slate-50/60";

  return (
    <Card
      title={props.isBeginnerUX ? "Today's Command" : "Today's Decision"}
      subtitle={props.nextBestSubtitle}
      className={clsx(
        props.nextBestTone === "bad" &&
          "border-rose-300/90 shadow-[0_0_0_1px_rgba(244,63,94,0.14),0_24px_54px_-34px_rgba(244,63,94,0.45)]",
        props.nextBestTone === "warn" &&
          "border-amber-300/90 shadow-[0_0_0_1px_rgba(245,158,11,0.14),0_24px_54px_-34px_rgba(245,158,11,0.35)]",
        props.nextBestTone === "good" &&
          "border-emerald-300/90 shadow-[0_0_0_1px_rgba(16,185,129,0.14),0_24px_54px_-34px_rgba(16,185,129,0.35)]",
        "ring-1 ring-zinc-900/5"
      )}
      headerClassName={clsx(
        props.nextBestTone === "bad" && "bg-gradient-to-r from-rose-50/95 via-white to-rose-50/60",
        props.nextBestTone === "warn" && "bg-gradient-to-r from-amber-50/95 via-white to-amber-50/60",
        props.nextBestTone === "good" && "bg-gradient-to-r from-emerald-50/95 via-white to-emerald-50/60"
      )}
      right={
        <div className="flex items-center gap-2">
          <Badge tone={props.nextBestTone}>{props.nextBestBadge}</Badge>
          {props.canClose ? (
            <button
              onClick={props.onCloseTheDay}
              disabled={props.markingDone}
              className="rounded-2xl bg-gradient-to-r from-zinc-900 to-zinc-700 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_16px_34px_-22px_rgba(79,96,135,0.55)] transition hover:from-black hover:to-zinc-800 disabled:opacity-50"
            >
              {props.markingDone ? "Closing..." : props.closeTheDayLabel}
            </button>
          ) : null}
        </div>
      }
    >
      <div className="space-y-5">
        <div
          className={clsx(
            "relative overflow-hidden rounded-[24px] border px-5 py-5",
            highlightTone
          )}
        >
          <div
            className={clsx(
              "pointer-events-none absolute inset-x-0 top-0 h-1.5",
              props.nextBestTone === "bad" && "bg-gradient-to-r from-rose-400 to-rose-500",
              props.nextBestTone === "warn" && "bg-gradient-to-r from-amber-400 to-amber-500",
              props.nextBestTone === "good" && "bg-gradient-to-r from-emerald-400 to-emerald-500",
              props.nextBestTone === "neutral" && "bg-gradient-to-r from-slate-400 to-slate-500"
            )}
          />
          <div className="pointer-events-none absolute -right-10 top-10 h-28 w-28 rounded-full bg-sky-100/65 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-40 bg-[linear-gradient(180deg,rgba(255,255,255,0),rgba(226,232,240,0.35))]" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div
                className={clsx(
                  "text-[15px] font-semibold uppercase tracking-[0.18em]",
                  props.nextBestTone === "warn"
                    ? "text-amber-700"
                    : props.nextBestTone === "good"
                      ? "text-emerald-700"
                      : props.nextBestTone === "bad"
                        ? "text-rose-700"
                        : "text-slate-600"
                )}
              >
                {props.nextBestBadge}
              </div>
              <div className="text-[34px] font-semibold leading-none tracking-tight text-slate-900">{props.primaryTitle}</div>
              <div className="max-w-3xl text-base leading-relaxed text-slate-600">{props.primaryDesc}</div>
            </div>
            <div className="min-w-[180px] rounded-[22px] border border-white/75 bg-white/75 px-4 py-4 shadow-[0_18px_42px_-30px_rgba(79,96,135,0.28)] backdrop-blur">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Decision posture</div>
              <div className="mt-2 text-lg font-semibold text-slate-900">{props.nextBestSubtitle}</div>
              <div className="mt-2 text-sm leading-relaxed text-slate-600">{props.nextBestWhyNowText}</div>
            </div>
          </div>
          <div className="relative mt-5 overflow-hidden rounded-[22px] border border-slate-200/80 bg-white/70 px-4 py-4">
            <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-slate-300/60" />
            <div className="pointer-events-none absolute inset-0 opacity-90">
              <div className="absolute inset-x-10 bottom-10 h-20 bg-[linear-gradient(90deg,rgba(16,185,129,0.02),rgba(16,185,129,0.18),rgba(16,185,129,0.02))] [clip-path:polygon(0_72%,100%_0,100%_86%,0_100%)]" />
              <div className="absolute inset-x-12 bottom-6 h-16 bg-[linear-gradient(90deg,rgba(96,165,250,0.02),rgba(96,165,250,0.18),rgba(96,165,250,0.02))] [clip-path:polygon(0_34%,100%_74%,100%_100%,0_60%)]" />
              <div className="absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-400 bg-white shadow-[0_0_0_6px_rgba(167,243,208,0.55)]" />
            </div>
            <div className="relative flex items-end justify-between gap-3 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
              <span>Defensive</span>
              <span>Base</span>
              <span>Accelerated</span>
            </div>
          </div>
          {props.doneToday ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Chip tone={props.nextActionReady ? "good" : "warn"}>
                {props.nextActionReady ? "Next cycle ready now" : `Next cycle in ${props.nextActionCountdownLabel}`}
              </Chip>
              <Chip tone="neutral">Day closed</Chip>
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
          <div className="space-y-4">
            <div className="rounded-[22px] border border-slate-200/80 bg-white/85 px-4 py-4 text-sm leading-relaxed text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
              <span className="font-semibold text-slate-900">Why now:</span> {props.nextBestWhyNowText}
            </div>
            <div className="flex flex-wrap gap-2">
              {(props.nextBestReasonChips.length > 0 ? props.nextBestReasonChips : props.fallbackReasonChips).map((reason, idx) => (
                <Chip key={idx} tone="neutral">
                  {reason}
                </Chip>
              ))}
            </div>
          </div>
          <div className="rounded-[22px] border border-slate-200/80 bg-white/92 px-4 py-4 shadow-[0_18px_40px_-32px_rgba(79,96,135,0.18)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Execution status</div>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-2">
                <span>Command state</span>
                <span className="font-semibold text-slate-900">{props.doneToday ? "Closed" : "Active"}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-2">
                <span>Next cycle</span>
                <span className="font-semibold text-slate-900">{props.nextActionReady ? "Ready" : props.nextActionCountdownLabel}</span>
              </div>
            </div>
          </div>
        </div>

        <div className={clsx("flex flex-wrap gap-3 pt-1", props.nextBestMaskedByPaywall && "pointer-events-none select-none blur-[3px] opacity-70")}>
          {props.primaryCtaAction === "apply_starter_pack" && props.starterPackLength > 0 ? (
            <button
              onClick={props.onApplyStarterPack}
              disabled={props.applyingStarter}
              className="rounded-2xl bg-gradient-to-r from-zinc-900 to-zinc-700 px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_38px_-24px_rgba(79,96,135,0.48)] transition hover:from-black hover:to-zinc-800 disabled:opacity-50"
            >
              {props.applyingStarter ? "Applying..." : "Apply Starter Pack"}
            </button>
          ) : props.primaryCtaHref ? (
            <a
              href={props.primaryCtaHref}
              className={clsx(
                "inline-flex items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold transition",
                props.primaryKind === "ghost"
                  ? "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
                  : "bg-gradient-to-r from-zinc-900 to-zinc-700 text-white shadow-[0_18px_38px_-24px_rgba(79,96,135,0.48)] hover:from-black hover:to-zinc-800"
              )}
            >
              {props.primaryCtaLabel}
            </a>
          ) : props.starterPackLength > 0 && props.hasPlan && !props.hasHoldings ? (
            <button
              onClick={props.onApplyStarterPack}
              disabled={props.applyingStarter}
              className="rounded-2xl bg-gradient-to-r from-zinc-900 to-zinc-700 px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_38px_-24px_rgba(79,96,135,0.48)] transition hover:from-black hover:to-zinc-800 disabled:opacity-50"
            >
              {props.applyingStarter ? "Applying..." : "Apply Starter Pack"}
            </button>
          ) : null}

          {!props.hasPlan ? (
            <button
              onClick={props.onGoToPlanning}
              className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
            >
              Go to Planning
            </button>
          ) : null}

          {props.hasPlan && !props.hasHoldings ? (
            <button
              onClick={props.onGoToPortfolio}
              className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
            >
              Go to Portfolio
            </button>
          ) : null}
        </div>

        {props.nextBestMaskedByPaywall ? (
          <div className="rounded-[24px] border border-amber-200/90 bg-gradient-to-br from-amber-50 via-white to-amber-50/70 px-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="warn">{props.paywallPreviewStatus === "READY" ? "Preview ready" : "Preview only"}</Badge>
              <div className="text-sm font-semibold text-amber-900">{props.paywallPreviewTitle}</div>
            </div>
            <div className="mt-2 text-sm text-amber-900/90">{props.paywallPreviewMessage}</div>
            <div className="mt-1 text-xs text-amber-900/85">{props.paywallPreviewSubtitle}</div>
            {props.paywallPreviewReason ? <div className="mt-1 text-xs text-amber-900/80">Reasoning: {props.paywallPreviewReason}</div> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={props.onOpenPaywall}
                className="rounded-2xl bg-gradient-to-r from-zinc-900 to-zinc-700 px-4 py-2.5 text-xs font-semibold text-white shadow-[0_14px_28px_-20px_rgba(79,96,135,0.42)] transition hover:from-black hover:to-zinc-800"
              >
                Start 7-day Pro Trial
              </button>
              <a
                href="/pricing"
                className="rounded-2xl border border-amber-300 bg-white px-4 py-2.5 text-xs font-semibold text-amber-900"
              >
                View pricing
              </a>
            </div>
            <div className="mt-2 text-[11px] text-amber-900/80">{props.paywallTrustLine}</div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function renderSimpleCard(props: SimpleCardProps) {
  return (
    <Card
      title="Today's Command"
      subtitle="One command for this cycle."
      className="border-slate-200/90 shadow-[0_28px_80px_-58px_rgba(79,96,135,0.24)]"
      right={<Badge tone={props.simpleDecisionTone}>{props.simpleDecision}</Badge>}
    >
      <div className="space-y-5">
        <div className="rounded-[24px] border border-slate-200/90 bg-gradient-to-br from-slate-50/95 via-white to-slate-100/70 px-5 py-5">
          <div className="text-[15px] font-semibold uppercase tracking-[0.18em] text-slate-500">{props.simpleDecision}</div>
          <div className="mt-2 text-[34px] font-semibold tracking-tight text-slate-900">{props.simpleCommandLabel}</div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Chip tone={props.simpleProbabilityEdgePct >= 0 ? "good" : "warn"}>Probability edge today: {props.simpleProbabilityEdgeLabel}</Chip>
            <Chip tone="neutral">Confidence: {props.simpleConfidencePct}%</Chip>
          </div>
        </div>
        <div className="rounded-[22px] border border-slate-200/80 bg-white/90 px-4 py-4 text-sm leading-relaxed text-slate-700">
          <span className="font-semibold text-zinc-900">Reason:</span> {props.simpleShortReason}
        </div>
        <div className="text-xs text-slate-600">
          Execution streak:{" "}
          <span className="font-semibold text-slate-900">
            {props.simpleExecutionStreakDays} day{props.simpleExecutionStreakDays === 1 ? "" : "s"}
          </span>
        </div>
      </div>
    </Card>
  );
}

export default function DecisionHero(props: DecisionHeroProps) {
  if (props.section === "header") return renderHeader(props);
  return props.variant === "advanced" ? renderAdvancedCard(props) : renderSimpleCard(props);
}
