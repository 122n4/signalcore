"use client";

import React from "react";

type Tone = "neutral" | "good" | "warn" | "bad";

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function fmtTime(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "-";
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(
    d.getUTCMinutes()
  )} UTC`;
}

function fmtDayKey(dayKey?: string | null) {
  if (!dayKey) return "-";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!m) return dayKey;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function formatIntWithSpaces(v: number) {
  const n = Math.round(Math.abs(Number.isFinite(v) ? v : 0));
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function fmtEUR(v: number) {
  const sign = Number(v) < 0 ? "-" : "";
  return `${sign}${formatIntWithSpaces(v)} EUR`;
}

function fmtPct(v: number | null | undefined, digits = 2) {
  if (v == null || !Number.isFinite(v)) return "--";
  const n = Number(v);
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

function roundOrderPrice(v: number) {
  if (!Number.isFinite(v) || v <= 0) return 0;
  if (v >= 1000) return Math.round(v * 100) / 100;
  if (v >= 10) return Math.round(v * 1000) / 1000;
  if (v >= 1) return Math.round(v * 10000) / 10000;
  return Math.round(v * 1_000_000) / 1_000_000;
}

function fmtOrderPrice(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v) || v <= 0) return "-";
  return String(roundOrderPrice(Number(v)));
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200/90 bg-white/90 px-3 py-1 text-[11px] font-medium text-slate-700 shadow-[0_10px_20px_-18px_rgba(79,96,135,0.24)]">
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
        "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold shadow-[0_10px_22px_-18px_rgba(79,96,135,0.28)]",
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
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium shadow-[0_10px_18px_-16px_rgba(79,96,135,0.24)]",
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
        "relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.95))] shadow-[0_24px_70px_-52px_rgba(79,96,135,0.22)]",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-[linear-gradient(180deg,rgba(226,232,240,0.22),transparent)]" />
      <div
        className={clsx(
          "relative flex items-start justify-between gap-4 px-5 pt-5",
          headerClassName
        )}
      >
        <div className="space-y-1">
          <div className="text-[13px] font-semibold tracking-tight text-slate-900">{title}</div>
          {subtitle ? <div className="text-[12px] text-slate-500">{subtitle}</div> : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
      <div className="relative px-5 pb-5 pt-4">{children}</div>
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const fillTone =
    v >= 70 ? "from-emerald-400 to-emerald-500" : v >= 45 ? "from-amber-300 to-orange-400" : "from-sky-400 to-slate-400";
  return (
    <div className="h-2 w-full rounded-full border border-slate-200 bg-slate-100 p-[1px]">
      <div className={clsx("h-full rounded-full bg-gradient-to-r transition-all duration-300", fillTone)} style={{ width: `${v}%` }} />
    </div>
  );
}

type TimerProps = {
  section: "timer";
  isBeginnerUX: boolean;
  nextActionReady: boolean;
  nextActionCountdownLabel: string;
  doneToday: boolean;
  nextActionTargetMs: number;
  nextActionEngineMessage: string;
};

type PostCloseProps = {
  section: "postClose";
  doneToday: boolean;
  nextActionReady: boolean;
  nextActionTargetMs: number;
  dailyExecutionEvidence: any;
  weeklyValueNode: any;
  dailyStreakNode: any;
  streak: number;
  onRefreshLoopStatus: () => void;
  hasLastReceipt: boolean;
  onOpenLastReceipt: () => void;
};

type ContinuityProps = {
  section: "continuity";
  deltaLineText: string | null;
  whatNextLine: string;
  whatNextMessage: string | null;
  continuityTrendChips: string[];
  monitoringStreakCount: number;
};

type IntroNextProps = {
  section: "introNext";
  onContinue: () => void;
};

type EvidenceFollowUpProps = {
  section: "evidenceFollowUp";
  executionProofSummary: any;
  executionProofLoading: boolean;
  executionProofs: any[];
  executionProofExpanded: Record<string, boolean>;
  setExecutionProofExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onExportExecutionProofs: (format: "csv" | "json", days: number) => void;
  planTrack: any;
};

type FollowUpSlaProps = {
  section: "followUpSla";
  followUpPlan: any;
  followUpStatusView: string | null | undefined;
};

type ProfileProofProps = {
  section: "profileProof";
  showExtendedActionCards: boolean;
  profileBenchmark: any;
  profileBenchmarkTone: Tone | string;
  operationalTone: Tone | string;
  operationalScore: number;
  weeklyReceipts: number;
  weeklyMissionTarget: number;
  weeklyMissionRemaining: number;
  openLeakCount: number;
  weeklyConfirmedEur: number;
  executionModelLabel: string;
  directBrokerConnected: boolean;
  doneToday: boolean;
  markingDone: boolean;
  onRefreshProof: () => void;
  onFixLeaksNow: () => void;
  onCloseDay: () => void;
};

type AdvancedTelemetryProps = {
  section: "advancedTelemetry";
  showExtendedActionCards: boolean;
  executionScore: any;
  executionScoreTone: Tone | string;
  executionCoach: any;
  weeklyReview: any;
  conversionFunnel: any;
  conversionFunnelLoading: boolean;
  ownerLoopKpis: any;
  ownerLoopKpisLoading: boolean;
  globalConversionFunnel: any;
  globalConversionLoading: boolean;
  onExportExecutionCsv: () => void;
  onExportExecutionJson: () => void;
};

type SetupCheck = {
  id: string;
  label: string;
  ok: boolean;
};

type OperationsTelemetryProps = {
  section: "operationsTelemetry";
  showExtendedActionCards: boolean;
  weeklyMissionPct: number;
  doneToday: boolean;
  streak: number;
  weeklyReceipts: number;
  weeklyMissionRemaining: number;
  showDetails: boolean;
  engineActivityLoading: boolean;
  engineActivity: any[];
  engineReliabilityLoading: boolean;
  engineReliability: any;
  setupScore: number;
  setupChecks: SetupCheck[];
  nextSetupStep: { href: string; label: string } | null;
  weeklyMissionTarget: number;
  moneyConfirmed: any;
  canClose: boolean;
  markingDone: boolean;
  onCloseDay: () => void;
  onRefreshMissionStatus: () => void;
};

type TrackRecordProps = {
  section: "trackRecord";
  showExtendedActionCards: boolean;
  trackRecordLoading: boolean;
  trackRecord: any;
  onRefreshTrackRecord: () => void;
  onCopyProgressShare: () => void;
  copyingShare: boolean;
  receiptsTimeline: any[];
};

export type DailyLoopProps =
  | TimerProps
  | PostCloseProps
  | ContinuityProps
  | IntroNextProps
  | EvidenceFollowUpProps
  | FollowUpSlaProps
  | ProfileProofProps
  | AdvancedTelemetryProps
  | OperationsTelemetryProps
  | TrackRecordProps;

function renderTimer(props: TimerProps) {
  if (props.isBeginnerUX) {
    return (
      <Card
        title="Next cycle timer"
        subtitle={props.nextActionReady ? "Next evaluation is open now." : `Next evaluation in ${props.nextActionCountdownLabel}.`}
        right={<Badge tone={props.nextActionReady ? "good" : "warn"}>{props.nextActionReady ? "Ready now" : "Learning cycle"}</Badge>}
      >
        <div className="space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4 text-sm text-slate-800">
            <span className="font-semibold text-zinc-900">Next evaluation:</span>{" "}
            {props.nextActionReady ? "now" : props.nextActionCountdownLabel}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-700">
            Scheduled check: {fmtTime(new Date(props.nextActionTargetMs).toISOString())}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title={props.doneToday ? "Next cycle timer" : "Next Best Action Timer"}
      subtitle={
        props.nextActionReady
          ? props.doneToday
            ? "Next action window is open."
            : "Action window is open."
          : props.doneToday
            ? `Next action unlocks in ${props.nextActionCountdownLabel}.`
            : `Next best action in ${props.nextActionCountdownLabel}.`
      }
      right={<Badge tone={props.nextActionReady ? "good" : "warn"}>{props.nextActionReady ? "Ready now" : "Learning cycle"}</Badge>}
    >
      <div className="space-y-4">
        <div className="rounded-[24px] border border-slate-200 bg-white/92 px-4 py-4 text-sm leading-relaxed text-slate-700">
          {props.doneToday
            ? "Why this appears now: your day is closed, so Syntrake is recalibrating the next cycle before unlocking a new action."
            : "Why this appears now: Syntrake needs one clean learning cycle before issuing stronger day-to-day directives."}
        </div>
        <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Next check</div>
          <div className="mt-2 text-[28px] font-semibold tracking-tight text-slate-900">{props.nextActionReady ? "Ready now" : props.nextActionCountdownLabel}</div>
          <div className="mt-1 text-sm text-slate-600">{fmtTime(new Date(props.nextActionTargetMs).toISOString())}</div>
        </div>
        <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
          {props.nextActionEngineMessage}
        </div>
      </div>
    </Card>
  );
}

function renderPostClose(props: PostCloseProps) {
  if (!props.doneToday) return null;

  return (
    <Card
      title="Close-day loop"
      subtitle="What happens after you click Close day and continue."
      right={<Badge tone={props.nextActionReady ? "good" : "warn"}>{props.nextActionReady ? "Next action ready" : "Learning cycle running"}</Badge>}
    >
      <div className="space-y-4">
        <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-semibold text-emerald-900">
          Capital discipline executed. Syntrake updated tomorrow&apos;s strategy.
        </div>
        <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-slate-700">
            Execution proofs (14d): {Math.max(0, Math.round(Number((props.dailyExecutionEvidence as any)?.proofs14 || 0)))}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-slate-700">
            Weekly value: {Math.round(Number(props.weeklyValueNode?.riskAvoidedPoints || 0))} risk points avoided
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-slate-700">
            Evaluation streak:{" "}
            {Math.max(
              0,
              Math.round(
                Number((props.dailyStreakNode as any)?.evaluationsInARow || (props.dailyStreakNode as any)?.streakDays || props.streak || 0)
              )
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900">
            <div className="font-semibold">1) Day locked</div>
            <div className="mt-1">Receipt + snapshot saved for this cycle.</div>
          </div>
          <div
            className={clsx(
              "rounded-xl border px-3 py-2",
              props.nextActionReady ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"
            )}
          >
            <div className="font-semibold">2) Engine recalibration</div>
            <div className="mt-1">{props.nextActionReady ? "Completed for this cycle." : "Running using your latest execution data."}</div>
          </div>
          <div
            className={clsx(
              "rounded-xl border px-3 py-2",
              props.nextActionReady ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-zinc-200 bg-zinc-50 text-zinc-700"
            )}
          >
            <div className="font-semibold">3) Next action unlock</div>
            <div className="mt-1">{props.nextActionReady ? "Ready now in Daily." : `Expected at ${fmtTime(new Date(props.nextActionTargetMs).toISOString())}.`}</div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-700">
          Continuation rule: after close, Syntrake switches from execution to analysis, then opens the next action window.
        </div>
        {props.weeklyValueNode ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
            Daily reward: {props.weeklyValueNode.summary} (risk avoided {Math.round(props.weeklyValueNode.riskAvoidedPoints)} pts this week).
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={props.onRefreshLoopStatus}
            className="rounded-2xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white"
          >
            Refresh loop status
          </button>
          {props.hasLastReceipt ? (
            <button
              type="button"
              onClick={props.onOpenLastReceipt}
              className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900"
            >
              Open last close receipt
            </button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function renderContinuity(props: ContinuityProps) {
  const deltaLineCard = props.deltaLineText ? (
    <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 px-4 py-4 text-sm font-semibold text-slate-800">{props.deltaLineText}</div>
  ) : null;

  const whatNextCard = (
    <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
      <div className="text-sm text-slate-700">{props.whatNextLine}</div>
      {props.whatNextMessage && props.whatNextLine !== `What happens next: ${props.whatNextMessage}` ? (
        <div className="mt-1 text-[11px] text-slate-500">{props.whatNextMessage}</div>
      ) : null}
    </div>
  );

  const trendChipsStrip = props.continuityTrendChips.length > 0 ? (
    <div className="flex flex-wrap gap-2">
      {props.continuityTrendChips.map((chip, idx) => (
        <Chip key={`continuity-chip-${idx}`} tone="neutral">
          {chip}
        </Chip>
      ))}
    </div>
  ) : null;

  const monitoringTrustLine = props.monitoringStreakCount ? (
    <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
      <div className="text-sm text-slate-600">
        Syntrake has monitored your capital for <span className="font-semibold text-slate-900">{props.monitoringStreakCount}</span> consecutive
        evaluations.
      </div>
    </div>
  ) : null;

  return (
    <>
      {deltaLineCard}
      {whatNextCard}
      {trendChipsStrip}
      {monitoringTrustLine}
    </>
  );
}

function renderIntroNext(props: IntroNextProps) {
  return (
    <Card title="What happens next" subtitle="Use the same 3-step cycle every day.">
      <div className="space-y-3 text-sm text-zinc-700">
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">1. Read Today&apos;s Decision.</div>
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">2. Execute with checklist/proof.</div>
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">3. Close day to unlock better decisions tomorrow.</div>
        <div className="pt-2">
          <button
            type="button"
            onClick={props.onContinue}
            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black"
          >
            Continue to first daily cycle
          </button>
        </div>
      </div>
    </Card>
  );
}

function renderEvidenceFollowUp(props: EvidenceFollowUpProps) {
  return (
    <>
      <Card
        title="Execution evidence (14 days)"
        subtitle="Audit trail of confirmed executions."
        right={
          <Badge tone={(props.executionProofSummary?.avgQuality || 0) >= 75 ? "good" : (props.executionProofSummary?.avgQuality || 0) >= 60 ? "warn" : "neutral"}>
            {(props.executionProofSummary?.avgQuality || 0)}/100 quality
          </Badge>
        }
      >
        {props.executionProofLoading ? (
          <div className="text-xs text-zinc-500">Loading evidence...</div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                <div className="text-zinc-500">Proofs</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900">{props.executionProofSummary?.proofs || 0}</div>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                <div className="text-zinc-500">Orders validated</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900">
                  {props.executionProofSummary?.completedOrders || 0}/{props.executionProofSummary?.totalOrders || 0}
                </div>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                <div className="text-zinc-500">Completion</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900">{props.executionProofSummary?.completionPct || 0}%</div>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                <div className="text-zinc-500">Strong proofs</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900">{props.executionProofSummary?.strongProofs || 0}</div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-3">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                <div className="text-zinc-500">With reference</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900">{props.executionProofSummary?.withReference || 0}</div>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                <div className="text-zinc-500">Fees (sum)</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900">{fmtEUR(props.executionProofSummary?.totalFeesEur || 0)}</div>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                <div className="text-zinc-500">Avg slippage</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900">
                  {props.executionProofSummary?.avgSlippageBps == null ? "-" : `${props.executionProofSummary.avgSlippageBps} bps`}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => props.onExportExecutionProofs("csv", 30)}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-900"
              >
                Export CSV (30d)
              </button>
              <button
                type="button"
                onClick={() => props.onExportExecutionProofs("json", 30)}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-900"
              >
                Export JSON (30d)
              </button>
            </div>
            {props.executionProofSummary?.lastProofAt ? (
              <div className="text-[11px] text-zinc-500">Last proof: {fmtTime(props.executionProofSummary.lastProofAt)}</div>
            ) : (
              <div className="text-[11px] text-zinc-500">No execution proof logged yet.</div>
            )}
            {props.executionProofs.length > 0 ? (
              <div className="space-y-2">
                {props.executionProofs.slice(0, 3).map((p) => {
                  const proofKey = p.id || `${p.at}-${p.broker}`;
                  const expanded = Boolean(props.executionProofExpanded[proofKey]);
                  const orderRows = expanded ? p.orders : p.orders.slice(0, 5);
                  const missingEvidence = p.orders.filter(
                    (o: any) => o.action !== "HOLD" && (o.filledPrice == null || o.filledQty == null || (!o.brokerOrderId && !p.reference))
                  ).length;
                  return (
                    <div key={proofKey} className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold text-zinc-900">
                          {p.broker} | {p.completed}/{p.total} orders
                        </div>
                        <Badge tone={p.qualityScore >= 75 ? "good" : p.qualityScore >= 60 ? "warn" : "neutral"}>{p.qualityScore}/100</Badge>
                      </div>
                      <div className="mt-1 text-zinc-600">{fmtTime(p.at)}</div>
                      <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-zinc-700">
                        {p.reference ? <span className="rounded-full border border-zinc-300 bg-white px-2 py-0.5">Ref: {p.reference}</span> : null}
                        {p.feesEur != null ? <span className="rounded-full border border-zinc-300 bg-white px-2 py-0.5">Fees: {fmtEUR(p.feesEur)}</span> : null}
                        {p.slippageBps != null ? <span className="rounded-full border border-zinc-300 bg-white px-2 py-0.5">Slip: {p.slippageBps} bps</span> : null}
                        <span className="rounded-full border border-zinc-300 bg-white px-2 py-0.5">Rows: {p.orders.length}</span>
                      </div>
                      {missingEvidence > 0 ? (
                        <div className="mt-1 text-[11px] text-zinc-600">
                          {missingEvidence} row{missingEvidence === 1 ? "" : "s"} without optional fill/ticket details.
                        </div>
                      ) : null}
                      {orderRows.length > 0 ? (
                        <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-200 bg-white">
                          <table className="min-w-full text-[11px] text-zinc-700">
                            <thead>
                              <tr className="border-b border-zinc-100 bg-zinc-50 text-zinc-500">
                                <th className="px-2 py-1.5 text-left font-semibold">Symbol</th>
                                <th className="px-2 py-1.5 text-left font-semibold">Action</th>
                                <th className="px-2 py-1.5 text-left font-semibold">Fill</th>
                                <th className="px-2 py-1.5 text-left font-semibold">Qty</th>
                                <th className="px-2 py-1.5 text-left font-semibold">Ticket</th>
                                <th className="px-2 py-1.5 text-left font-semibold">Executed</th>
                              </tr>
                            </thead>
                            <tbody>
                              {orderRows.map((o: any, idx: number) => (
                                <tr key={`${proofKey}-${o.symbol}-${idx}`} className="border-b border-zinc-100 last:border-b-0">
                                  <td className="px-2 py-1.5 font-semibold text-zinc-900">{o.symbol}</td>
                                  <td className="px-2 py-1.5">{o.action || "-"}</td>
                                  <td className="px-2 py-1.5">{fmtOrderPrice(o.filledPrice)}</td>
                                  <td className="px-2 py-1.5">{o.filledQty == null ? "-" : Number(o.filledQty).toFixed(4)}</td>
                                  <td className="px-2 py-1.5">{o.brokerOrderId || "-"}</td>
                                  <td className="px-2 py-1.5">{fmtTime(o.executedAt)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                      {p.orders.length > orderRows.length ? (
                        <div className="mt-1 flex items-center gap-2">
                          <div className="text-[11px] text-zinc-500">+{p.orders.length - orderRows.length} hidden rows.</div>
                          <button
                            type="button"
                            onClick={() =>
                              props.setExecutionProofExpanded((prev) => ({
                                ...prev,
                                [proofKey]: true,
                              }))
                            }
                            className="rounded-lg border border-zinc-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-zinc-800"
                          >
                            Show all rows
                          </button>
                        </div>
                      ) : null}
                      {expanded && p.orders.length > 5 ? (
                        <div className="mt-1">
                          <button
                            type="button"
                            onClick={() =>
                              props.setExecutionProofExpanded((prev) => ({
                                ...prev,
                                [proofKey]: false,
                              }))
                            }
                            className="rounded-lg border border-zinc-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-zinc-800"
                          >
                            Collapse rows
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        )}
      </Card>

      {props.planTrack?.phase ? (
        <Card
          title="Plan follow-up"
          subtitle="Stateful progression, not repeated generic prompts."
          right={<Badge tone="neutral">{props.planTrack.phase.label}</Badge>}
        >
          <div className="space-y-3">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
              <span className="font-semibold text-zinc-900">Goal:</span> {props.planTrack.phase.goal}
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
              <span className="font-semibold text-zinc-900">Exit criteria:</span> {props.planTrack.phase.exitWhen}
            </div>
            {props.planTrack.microStep ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                <span className="font-semibold">Today focus:</span> {props.planTrack.microStep}
              </div>
            ) : null}
            {props.planTrack.phaseRepeatDays >= 2 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <span className="font-semibold">Continuity:</span> same phase seen in the last {props.planTrack.phaseRepeatDays} receipt(s).
              </div>
            ) : null}
            <div className="text-xs text-zinc-600">
              {props.planTrack.escalationNeeded
                ? "Escalation checkpoint injected to prevent stagnation in this phase."
                : props.planTrack.rotatedToday
                  ? "Action rotated today to avoid blind repetition while keeping plan coherence."
                  : props.planTrack.repeatedTopActionDays >= 2
                    ? `Same top action repeated for ${props.planTrack.repeatedTopActionDays} day(s) because phase is not complete yet.`
                    : "Phase progressing normally."}
            </div>
          </div>
        </Card>
      ) : null}
    </>
  );
}

function renderFollowUpSla(props: FollowUpSlaProps) {
  if (!props.followUpPlan) return null;

  return (
    <Card
      title="Follow-up SLA"
      subtitle="Automatic plan follow-up to avoid drop-off and repeated empty sessions."
      right={
        <Badge
          tone={
            props.followUpStatusView === "overdue" || props.followUpStatusView === "blocked"
              ? "bad"
              : props.followUpStatusView === "due_today"
                ? "warn"
                : "good"
          }
        >
          {(props.followUpStatusView || props.followUpPlan.status).replace("_", " ").toUpperCase()}
        </Badge>
      }
    >
      <div className="space-y-3">
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
          <div className="font-semibold text-zinc-900">{props.followUpPlan.headline}</div>
          <div className="mt-1 text-xs text-zinc-700">{props.followUpPlan.message}</div>
        </div>
        <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-3">
          <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
            <div className="text-zinc-500">Deadline</div>
            <div className="mt-1 text-sm font-semibold text-zinc-900">{fmtTime(props.followUpPlan.deadlineAt)}</div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
            <div className="text-zinc-500">Next check</div>
            <div className="mt-1 text-sm font-semibold text-zinc-900">{fmtTime(props.followUpPlan.nextCheckAt)}</div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
            <div className="text-zinc-500">Urgency</div>
            <div className="mt-1 text-sm font-semibold text-zinc-900">{props.followUpPlan.urgencyMinutes} min</div>
          </div>
        </div>
        {props.followUpPlan.checklist.length > 0 ? (
          <ol className="space-y-2">
            {props.followUpPlan.checklist.map((step: string, idx: number) => (
              <li key={`followup-step-${idx}`} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700">
                {idx + 1}. {step}
              </li>
            ))}
          </ol>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {props.followUpPlan.channels.map((c: string) => (
            <span key={`fu-channel-${c}`} className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-[11px] text-zinc-700">
              {c}
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}

function renderProfileProof(props: ProfileProofProps) {
  return (
    <>
      {props.showExtendedActionCards && props.profileBenchmark ? (
        <Card
          title="Weekly profile benchmark"
          subtitle="Internal benchmark for your execution profile."
          right={<Badge tone={props.profileBenchmarkTone as Tone}>{props.profileBenchmark.score}/100 | {props.profileBenchmark.percentileLabel}</Badge>}
        >
          <div className="space-y-3">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">{props.profileBenchmark.summary}</div>
            <div className="space-y-2 rounded-xl border border-zinc-200 bg-white px-3 py-3">
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-zinc-600">
                  <span>Execution quality</span>
                  <span>{props.profileBenchmark.components.execution}%</span>
                </div>
                <ProgressBar value={props.profileBenchmark.components.execution} />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-zinc-600">
                  <span>Risk quality</span>
                  <span>{props.profileBenchmark.components.risk}%</span>
                </div>
                <ProgressBar value={props.profileBenchmark.components.risk} />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-zinc-600">
                  <span>Consistency</span>
                  <span>{props.profileBenchmark.components.consistency}%</span>
                </div>
                <ProgressBar value={props.profileBenchmark.components.consistency} />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-zinc-600">
                  <span>Alpha contribution</span>
                  <span>{props.profileBenchmark.components.alpha}%</span>
                </div>
                <ProgressBar value={props.profileBenchmark.components.alpha} />
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      {props.showExtendedActionCards ? (
        <Card
          title="Proof of value (operational)"
          subtitle="Track weekly proof."
          right={<Badge tone={props.operationalTone as Tone}>{props.operationalScore}/100</Badge>}
        >
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-zinc-500">Execution discipline</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900">
                  {props.weeklyReceipts}/{props.weeklyMissionTarget} receipts this week
                </div>
                <div className="text-xs text-zinc-600">
                  {props.weeklyMissionRemaining > 0
                    ? `${props.weeklyMissionRemaining} more needed to complete weekly routine.`
                    : "Weekly routine complete."}
                </div>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-zinc-500">Risk leak pressure</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900">
                  {props.openLeakCount === 0 ? "No medium/high leaks" : `${props.openLeakCount} open leak${props.openLeakCount === 1 ? "" : "s"}`}
                </div>
                <div className="text-xs text-zinc-600">
                  {props.openLeakCount === 0 ? "Execution can continue with normal discipline." : "Fix leaks before adding new risk."}
                </div>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-zinc-500">Confirmed week result</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900">
                  {props.weeklyConfirmedEur >= 0 ? "+" : "-"}EUR {Math.abs(Math.round(props.weeklyConfirmedEur))}
                </div>
                <div className="text-xs text-zinc-600">Directional signal only. Keep process quality high.</div>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-zinc-500">Execution model</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900">{props.executionModelLabel}</div>
                <div className="text-xs text-zinc-600">
                  {props.directBrokerConnected
                    ? "Syntrake can sync and execute through direct broker bridge."
                    : "Syntrake generates exact manual checklist for any broker without direct bridge."}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700">
              <span className="font-semibold text-zinc-900">Goal:</span> score up, leaks down, receipts up.
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={props.onRefreshProof}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900"
              >
                Refresh proof
              </button>
              {props.openLeakCount > 0 ? (
                <button
                  type="button"
                  onClick={props.onFixLeaksNow}
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900"
                >
                  Fix leaks now
                </button>
              ) : null}
              {!props.doneToday ? (
                <button
                  type="button"
                  onClick={props.onCloseDay}
                  disabled={props.markingDone}
                  className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {props.markingDone ? "Closing..." : "Lock today receipt"}
                </button>
              ) : null}
            </div>
          </div>
        </Card>
      ) : null}
    </>
  );
}

function renderAdvancedTelemetry(props: AdvancedTelemetryProps) {
  return (
    <>
      {props.showExtendedActionCards && props.executionScore ? (
        <Card
          title="Execution score (weekly)"
          subtitle="Based on real daily receipts and execution proof."
          right={<Badge tone={props.executionScoreTone as Tone}>{props.executionScore.score}/100</Badge>}
        >
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-zinc-500">Discipline</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900">
                  {props.executionScore.doneDays}/{props.executionScore.weekTargetDays} closed days
                </div>
                <div className="text-xs text-zinc-600">{props.executionScore.disciplinePct}% of weekly target</div>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-zinc-500">Validated execution</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900">
                  {props.executionScore.validatedDays}/{props.executionScore.doneDays || 0} validated days
                </div>
                <div className="text-xs text-zinc-600">{props.executionScore.validationPct}% validation rate</div>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-zinc-500">Checklist completion</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900">
                  {props.executionScore.manualCompleted}/{props.executionScore.manualTotal} manual orders
                </div>
                <div className="text-xs text-zinc-600">{props.executionScore.checklistPct}% completion rate</div>
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-zinc-200 bg-white px-3 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Score components</div>
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-zinc-600">
                  <span>Discipline</span>
                  <span>{props.executionScore.disciplinePct}%</span>
                </div>
                <ProgressBar value={props.executionScore.disciplinePct} />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-zinc-600">
                  <span>Validation</span>
                  <span>{props.executionScore.validationPct}%</span>
                </div>
                <ProgressBar value={props.executionScore.validationPct} />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-zinc-600">
                  <span>Checklist completion</span>
                  <span>{props.executionScore.checklistPct}%</span>
                </div>
                <ProgressBar value={props.executionScore.checklistPct} />
              </div>
            </div>

            {props.executionScore.missingProofDays.length > 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Missing execution proof on: {props.executionScore.missingProofDays.map((x: string) => fmtDayKey(x)).join(", ")}.
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      {props.showExtendedActionCards && props.executionCoach ? (
        <Card
          title={`Execution pattern radar (${props.executionCoach.windowDays}d)`}
          subtitle="Detect repeated execution mistakes and apply one concrete correction rule."
          right={
            <Badge
              tone={
                props.executionCoach.topPatterns[0]?.severity === "high"
                  ? "bad"
                  : props.executionCoach.topPatterns[0]?.severity === "medium"
                    ? "warn"
                    : "good"
              }
            >
              {props.executionCoach.stableDays} stable day{props.executionCoach.stableDays === 1 ? "" : "s"}
            </Badge>
          }
        >
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-3">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                <div className="text-zinc-500">Stable days</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900">{props.executionCoach.stableDays}</div>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                <div className="text-zinc-500">Unstable signal</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900">{props.executionCoach.unstableDays}</div>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                <div className="text-zinc-500">Quality gate</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900">
                  {props.executionCoach.qualityGate.minQuality}/100{props.executionCoach.qualityGate.requireReference ? " + ref" : ""}
                </div>
              </div>
            </div>

            {props.executionCoach.topPatterns.length > 0 ? (
              <div className="space-y-2">
                {props.executionCoach.topPatterns.slice(0, 3).map((p: any, idx: number) => (
                  <div key={`${p.key}-${idx}`} className="rounded-xl border border-zinc-200 bg-white px-3 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-zinc-900">
                        {idx + 1}. {p.title}
                      </div>
                      <Badge tone={p.severity === "high" ? "bad" : p.severity === "medium" ? "warn" : "neutral"}>
                        {p.count}x | {p.impact}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-zinc-700">{p.nextStep}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                No dominant negative pattern detected in this window.
              </div>
            )}

            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-800">
              <span className="font-semibold text-zinc-900">Today rule:</span> {props.executionCoach.todayRule}
            </div>
          </div>
        </Card>
      ) : null}

      {props.showExtendedActionCards ? (
        <Card
          title="Weekly review (next 7 days)"
          subtitle="Actionable priorities based on leaks, receipts and execution evidence."
          right={<Badge tone={props.weeklyReview.tone as Tone}>{props.weeklyReview.score}/100</Badge>}
        >
          <div className="space-y-3">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">{props.weeklyReview.headline}</div>

            <div className="space-y-2">
              {props.weeklyReview.actions.map((action: any, idx: number) => (
                <div key={action.id} className="rounded-xl border border-zinc-200 bg-white px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">
                        {idx + 1}. {action.title}
                      </div>
                      <div className="mt-1 text-xs text-zinc-700">{action.detail}</div>
                    </div>
                    <Badge tone={action.tone}>{action.tone.toUpperCase()}</Badge>
                  </div>
                  <div className="mt-2">
                    <a
                      href={action.href}
                      className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-900"
                    >
                      {action.ctaLabel}
                    </a>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={props.onExportExecutionCsv}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900"
              >
                Export execution CSV
              </button>
              <button
                type="button"
                onClick={props.onExportExecutionJson}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900"
              >
                Export execution JSON
              </button>
            </div>
          </div>
        </Card>
      ) : null}

      {props.showExtendedActionCards ? (
        <Card
          title="Conversion funnel (30d)"
          subtitle="Internal growth telemetry for this account."
          right={
            <Badge
              tone={
                props.conversionFunnel?.access?.planStatus === "paid"
                  ? "good"
                  : props.conversionFunnel?.access?.planStatus === "trial"
                    ? "warn"
                    : "neutral"
              }
            >
              {props.conversionFunnel?.access?.planStatus ? props.conversionFunnel.access.planStatus.toUpperCase() : "LOADING"}
            </Badge>
          }
        >
          {props.conversionFunnelLoading && !props.conversionFunnel ? (
            <div className="text-xs text-zinc-500">Loading funnel...</div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <div className="text-zinc-500">Paywall opens</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-900">{props.conversionFunnel?.counts?.paywallOpen || 0}</div>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <div className="text-zinc-500">Trial starts</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-900">{props.conversionFunnel?.counts?.trialStarted || 0}</div>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <div className="text-zinc-500">Checkout sessions</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-900">{props.conversionFunnel?.counts?.checkoutSessionCreated || 0}</div>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <div className="text-zinc-500">Paid activations</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-900">{props.conversionFunnel?.counts?.paidActivated || 0}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-3">
                <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                  <div className="text-zinc-500">Trial click rate</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-900">{props.conversionFunnel?.rates?.trialClickRate || 0}%</div>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                  <div className="text-zinc-500">Trial start rate</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-900">{props.conversionFunnel?.rates?.trialStartRate || 0}%</div>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                  <div className="text-zinc-500">Paid from checkout</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-900">{props.conversionFunnel?.rates?.paidFromCheckoutRate || 0}%</div>
                </div>
              </div>

              {props.conversionFunnel?.urgency ? (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-800">{props.conversionFunnel.urgency}</div>
              ) : null}

              {Array.isArray(props.conversionFunnel?.events) && props.conversionFunnel.events.length > 0 ? (
                <div className="space-y-2">
                  {props.conversionFunnel.events.slice(0, 4).map((e: any) => (
                    <div key={e.id || `${e.at}-${e.event}`} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-zinc-900">{e.event}</span>
                        <span className="text-zinc-500">{fmtTime(e.at)}</span>
                      </div>
                      <div className="mt-1 text-zinc-600">
                        {e.source || "unknown"} | {e.mode || "n/a"}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-zinc-500">No conversion events yet for this window.</div>
              )}
            </div>
          )}
        </Card>
      ) : null}

      {props.showExtendedActionCards && (props.ownerLoopKpisLoading || props.ownerLoopKpis) ? (
        <Card
          title="Owner loop KPIs (30d)"
          subtitle="Core loop telemetry: D1, D7, trial conversion and weekly completion."
          right={<Badge tone="neutral">OWNER</Badge>}
        >
          {props.ownerLoopKpisLoading && !props.ownerLoopKpis ? (
            <div className="text-xs text-zinc-500">Loading KPI panel...</div>
          ) : props.ownerLoopKpis ? (
            <div className="space-y-2">
              <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-2">
                {[props.ownerLoopKpis.kpis.activationD1, props.ownerLoopKpis.kpis.retentionD7, props.ownerLoopKpis.kpis.trialToPaid, props.ownerLoopKpis.kpis.weeklyLoopCompletion].map(
                  (kpi: any) => (
                    <div key={`owner-kpi-${kpi.label}`} className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-zinc-900">{kpi.label}</span>
                        <span className="text-zinc-900">{kpi.rate.toFixed(1)}%</span>
                      </div>
                      <div className="mt-1 text-zinc-600">
                        {kpi.numerator}/{kpi.denominator}
                      </div>
                      {kpi.definition ? <div className="mt-1 text-zinc-500">{kpi.definition}</div> : null}
                    </div>
                  )
                )}
              </div>
              <div className="text-[11px] text-zinc-500">
                Sample: {props.ownerLoopKpis.meta.uniqueUsers} users | events {props.ownerLoopKpis.meta.eventRows} | snapshots {props.ownerLoopKpis.meta.snapshotRows}
              </div>
              <div className="text-[11px] text-zinc-500">Updated {fmtTime(props.ownerLoopKpis.meta.updatedAt)}</div>
            </div>
          ) : (
            <div className="text-xs text-zinc-500">No KPI sample available for this window.</div>
          )}
        </Card>
      ) : null}

      {props.showExtendedActionCards && (props.globalConversionLoading || props.globalConversionFunnel) ? (
        <Card
          title="Owner growth cockpit (30d)"
          subtitle="Global conversion telemetry across all users (owner only)."
          right={<Badge tone="neutral">OWNER</Badge>}
        >
          {props.globalConversionLoading && !props.globalConversionFunnel ? (
            <div className="text-xs text-zinc-500">Loading global telemetry...</div>
          ) : props.globalConversionFunnel ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <div className="text-zinc-500">Unique users</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-900">{props.globalConversionFunnel.uniqueUsers}</div>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <div className="text-zinc-500">Paywall opens</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-900">{props.globalConversionFunnel.counts.paywallOpen}</div>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <div className="text-zinc-500">Trials started</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-900">{props.globalConversionFunnel.counts.trialStarted}</div>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <div className="text-zinc-500">Paid activations</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-900">{props.globalConversionFunnel.counts.paidActivated}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-3">
                <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                  <div className="text-zinc-500">Paid from checkout</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-900">{props.globalConversionFunnel.rates.paidFromCheckoutRate}%</div>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                  <div className="text-zinc-500">Paid from trial</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-900">{props.globalConversionFunnel.rates.paidFromTrialRate}%</div>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                  <div className="text-zinc-500">Overall paid rate</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-900">{props.globalConversionFunnel.rates.overallPaidRate}%</div>
                </div>
              </div>

              {props.globalConversionFunnel.modes.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-zinc-900">Top modes by demand</div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {props.globalConversionFunnel.modes.slice(0, 4).map((m: any) => (
                      <div key={`mode-${m.mode}`} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-zinc-900">{m.mode}</span>
                          <span className="text-zinc-500">{m.users} users</span>
                        </div>
                        <div className="mt-1 text-zinc-600">
                          opens {m.counts.paywallOpen} | trial {m.counts.trialStarted} | paid {m.counts.paidActivated}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {props.globalConversionFunnel.topSources.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-zinc-900">Top sources</div>
                  <div className="flex flex-wrap gap-2">
                    {props.globalConversionFunnel.topSources.slice(0, 6).map((s: any) => (
                      <span key={`src-${s.source}`} className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs text-zinc-800">
                        {s.source} ({s.count})
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {props.globalConversionFunnel.trend.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-zinc-900">Last 7 days trend</div>
                  <div className="space-y-1">
                    {props.globalConversionFunnel.trend.slice(-7).map((d: any) => (
                      <div key={`trend-${d.day}`} className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs">
                        <span className="font-medium text-zinc-700">{fmtDayKey(d.day)}</span>
                        <span className="text-zinc-600">
                          open {d.paywall_open} | trial {d.trial_started} | paid {d.paid_activated}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="text-[11px] text-zinc-500">Updated {fmtTime(props.globalConversionFunnel.updatedAt)}</div>
            </div>
          ) : (
            <div className="text-xs text-zinc-500">No global telemetry available.</div>
          )}
        </Card>
      ) : null}
    </>
  );
}

function renderOperationsTelemetry(props: OperationsTelemetryProps) {
  return (
    <>
      {props.showExtendedActionCards ? (
        <Card
          title="Momentum loop"
          subtitle="1 action. 1 validation. 1 receipt."
          right={<Badge tone={props.weeklyMissionPct >= 100 ? "good" : props.weeklyMissionPct >= 60 ? "warn" : "bad"}>{props.weeklyMissionPct}%</Badge>}
        >
          <div className="space-y-3">
            <ProgressBar value={props.weeklyMissionPct} />
            <div className="flex flex-wrap gap-2">
              <Chip tone={props.doneToday ? "good" : "warn"}>Today: {props.doneToday ? "Closed" : "Open"}</Chip>
              <Chip tone={props.streak >= 7 ? "good" : props.streak >= 3 ? "warn" : "neutral"}>Streak: {props.streak}d</Chip>
              <Chip tone={props.weeklyReceipts >= 3 ? "good" : "warn"}>Receipts this week: {props.weeklyReceipts}</Chip>
            </div>
            <div className="text-sm text-zinc-700">
              {props.weeklyMissionRemaining > 0
                ? `${props.weeklyMissionRemaining} more receipt${props.weeklyMissionRemaining === 1 ? "" : "s"} this week.`
                : "Weekly mission complete."}
            </div>
          </div>
        </Card>
      ) : null}

      {props.showDetails ? (
        <Card
          title="Engine activity"
          subtitle="Real actions executed by Syntrake."
          right={<Badge tone={props.engineActivityLoading ? "warn" : "good"}>{props.engineActivityLoading ? "Syncing..." : "Live feed"}</Badge>}
        >
          <div className="space-y-2">
            {props.engineActivity.length === 0 ? (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                No engine activity yet for this mode. Run Execute and refresh.
              </div>
            ) : null}
            {props.engineActivity.map((row, idx) => (
              <div key={row.id || `${row.event}-${row.at || idx}`} className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={
                      row.status === "ok"
                        ? "inline-flex rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800"
                        : row.status === "warn"
                          ? "inline-flex rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800"
                          : "inline-flex rounded-full bg-rose-100 px-2 py-0.5 font-semibold text-rose-800"
                    }
                  >
                    {row.status.toUpperCase()}
                  </span>
                  <span className="font-semibold text-zinc-900">{row.title}</span>
                  <span className="text-zinc-500">{fmtTime(row.at)}</span>
                  {row.executionId ? <span className="text-zinc-500">exec {row.executionId.slice(-8)}</span> : null}
                  {row.durationMs != null ? <span className="text-zinc-500">{row.durationMs} ms</span> : null}
                </div>
                {row.summary ? <div className="mt-1 text-xs text-zinc-700">{row.summary}</div> : null}
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {props.showDetails ? (
        <Card
          title="Engine reliability"
          subtitle="Operational reliability in the last 7 days."
          right={
            <Badge
              tone={
                props.engineReliabilityLoading
                  ? "warn"
                  : (props.engineReliability?.rates?.executionSuccessRate ?? 0) >= 97
                    ? "good"
                    : (props.engineReliability?.rates?.executionSuccessRate ?? 0) >= 90
                      ? "warn"
                      : "bad"
              }
            >
              {props.engineReliabilityLoading
                ? "Calculating..."
                : props.engineReliability?.rates?.executionSuccessRate != null
                  ? `${props.engineReliability.rates.executionSuccessRate.toFixed(1)}% exec success`
                  : "No data"}
            </Badge>
          }
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-zinc-500">Orders</div>
              <div className="mt-1 text-sm font-semibold text-zinc-900">
                {props.engineReliability?.counts?.orderFilled || 0} filled / {props.engineReliability?.counts?.orderFailed || 0} failed
              </div>
              <div className="text-xs text-zinc-600">
                Success:{" "}
                {props.engineReliability?.rates?.orderSuccessRate != null ? `${props.engineReliability.rates.orderSuccessRate.toFixed(1)}%` : "-"}
              </div>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-zinc-500">Latency</div>
              <div className="mt-1 text-sm font-semibold text-zinc-900">
                Avg {props.engineReliability?.latency?.avgMs != null ? `${Math.round(props.engineReliability.latency.avgMs)} ms` : "-"}
              </div>
              <div className="text-xs text-zinc-600">
                P95 {props.engineReliability?.latency?.p95Ms != null ? `${Math.round(props.engineReliability.latency.p95Ms)} ms` : "-"}
              </div>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-zinc-500">Engine health</div>
              <div className="mt-1 text-sm font-semibold text-zinc-900">{props.engineReliability?.counts?.error || 0} error events</div>
              <div className="text-xs text-zinc-600">Last event: {fmtTime(props.engineReliability?.latestAt || null)}</div>
            </div>
          </div>
        </Card>
      ) : null}

      {props.showDetails ? (
        <Card
          title="Setup score"
          subtitle="Higher setup score = better daily signal quality."
          right={<Badge tone={props.setupScore >= 85 ? "good" : props.setupScore >= 60 ? "warn" : "bad"}>{props.setupScore} / 100</Badge>}
        >
          <div className="space-y-3">
            <ProgressBar value={props.setupScore} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {props.setupChecks.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2">
                  <div className="text-sm text-zinc-800">{c.label}</div>
                  <Badge tone={c.ok ? "good" : "warn"}>{c.ok ? "OK" : "Missing"}</Badge>
                </div>
              ))}
            </div>
            {props.nextSetupStep ? (
              <a
                href={props.nextSetupStep.href}
                className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white"
              >
                Complete next: {props.nextSetupStep.label}
              </a>
            ) : (
              <div className="text-sm text-emerald-700">Setup complete. Keep compounding.</div>
            )}
          </div>
        </Card>
      ) : null}

      {props.showDetails ? (
        <Card
          title="Weekly momentum mission"
          subtitle="Complete 5 daily receipts each week to keep the habit loop alive."
          right={
            <Badge tone={props.weeklyMissionPct >= 100 ? "good" : props.weeklyMissionPct >= 60 ? "warn" : "bad"}>
              {props.weeklyReceipts}/{props.weeklyMissionTarget}
            </Badge>
          }
        >
          <div className="space-y-3">
            <ProgressBar value={props.weeklyMissionPct} />
            <div className="text-sm text-zinc-700">
              {props.weeklyMissionRemaining > 0
                ? `You need ${props.weeklyMissionRemaining} more receipt${props.weeklyMissionRemaining === 1 ? "" : "s"} this week.`
                : "Weekly mission complete. Keep protecting your streak."}
            </div>
            <div className="flex flex-wrap gap-2">
              <Chip tone={props.streak >= 7 ? "good" : props.streak >= 3 ? "warn" : "neutral"}>Streak: {props.streak}d</Chip>
              <Chip tone={props.moneyConfirmed?.week >= 0 ? "good" : "warn"}>
                Week confirmed: {props.moneyConfirmed?.week >= 0 ? "+" : "-"}EUR {Math.abs(Number(props.moneyConfirmed?.week || 0))}
              </Chip>
            </div>
            <div className="flex flex-wrap gap-2">
              {props.canClose ? (
                <button
                  type="button"
                  onClick={props.onCloseDay}
                  disabled={props.markingDone}
                  className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {props.markingDone ? "Closing..." : "Close today now"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={props.onRefreshMissionStatus}
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900"
                >
                  Refresh mission status
                </button>
              )}
            </div>
          </div>
        </Card>
      ) : null}
    </>
  );
}

function renderTrackRecord(props: TrackRecordProps) {
  return (
    <>
      {props.showExtendedActionCards ? (
        <Card
          title="Audited track record"
          subtitle="Gross vs net performance with execution-cost and discipline impact."
          right={
            <Badge
              tone={
                Number(props.trackRecord?.summary?.trackRecordScore || 0) >= 80
                  ? "good"
                  : Number(props.trackRecord?.summary?.trackRecordScore || 0) >= 60
                    ? "warn"
                    : "bad"
              }
            >
              {props.trackRecord?.summary ? `${Math.round(Number(props.trackRecord.summary.trackRecordScore || 0))}/100` : "LOADING"}
            </Badge>
          }
        >
          {props.trackRecordLoading && !props.trackRecord ? (
            <div className="text-sm text-zinc-500">Loading track record...</div>
          ) : !props.trackRecord?.summary ? (
            <div className="text-sm text-zinc-500">Not enough data yet. Close more daily receipts to build audited history.</div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-3">
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <div className="text-zinc-500">Gross return</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-900">{fmtPct(props.trackRecord.summary.totalReturnPct)}</div>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <div className="text-zinc-500">Net return</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-900">{fmtPct(props.trackRecord.summary.netReturnPct)}</div>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <div className="text-zinc-500">Net alpha</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-900">{fmtPct(props.trackRecord.summary.netAlphaPct)}</div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-4">
                <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                  <div className="text-zinc-500">Fees total</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-900">{fmtEUR(props.trackRecord.summary.feesEur)}</div>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                  <div className="text-zinc-500">Fees 30d</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-900">{fmtEUR(props.trackRecord.summary.fees30dEur)}</div>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                  <div className="text-zinc-500">Avg slip 30d</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-900">
                    {props.trackRecord.summary.avgSlippageBps30d == null ? "-" : `${props.trackRecord.summary.avgSlippageBps30d} bps`}
                  </div>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                  <div className="text-zinc-500">Proof quality 30d</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-900">
                    {props.trackRecord.summary.avgProofQuality30d == null ? "-" : `${Math.round(props.trackRecord.summary.avgProofQuality30d)}/100`}
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-800">
                Discipline: {props.trackRecord.summary.weeksWith5Receipts}/{props.trackRecord.summary.observedWeeks} weeks with {"\u2265"}5 receipts.
                Annualized: {fmtPct(props.trackRecord.summary.annualizedPct)} | Max DD: {fmtPct(props.trackRecord.summary.maxDrawdownPct)}.
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={props.onRefreshTrackRecord}
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-900"
                >
                  Refresh track record
                </button>
              </div>
            </div>
          )}
        </Card>
      ) : null}

      {props.showExtendedActionCards ? (
        <Card
          title="Receipts timeline"
          subtitle="Last 7 days. This is your compounding story."
          right={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={props.onCopyProgressShare}
                disabled={props.copyingShare}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900 disabled:opacity-60"
              >
                {props.copyingShare ? "Copying..." : "Copy progress"}
              </button>
              <Badge tone={props.receiptsTimeline.length >= 3 ? "good" : "warn"}>{props.receiptsTimeline.length} / 7</Badge>
            </div>
          }
        >
          {props.receiptsTimeline.length === 0 ? (
            <div className="text-sm text-zinc-600">No receipts yet. Close the day once to start the timeline.</div>
          ) : (
            <div className="space-y-2">
              {props.receiptsTimeline.slice(0, 7).map((r: any, i: number) => {
                const delta = Number(r?.deltaEur || 0);
                const tone = delta > 0 ? "good" : delta < 0 ? "bad" : "neutral";
                const score = typeof r?.score === "number" ? Math.round(r.score) : null;

                return (
                  <div
                    key={`${r?.dayKey || i}`}
                    className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 rounded-2xl border border-zinc-100 bg-white px-4 py-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        <Badge tone={tone}>
                          {delta >= 0 ? "+" : "-"}EUR {Math.abs(delta)}
                        </Badge>
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-zinc-900">
                          {fmtDayKey(r?.dayKey)} <span className="text-xs font-medium text-zinc-500 ml-2">{fmtTime(r?.at)}</span>
                        </div>
                        <div className="text-xs text-zinc-600 mt-0.5">
                          {r?.topLeak ? `Top leak: ${r.topLeak}` : "Top leak: -"}
                          {r?.nbaTitle ? ` | NBA: ${r.nbaTitle}` : ""}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {score != null ? <Pill>Score: <span className="ml-1 font-semibold">{score}</span></Pill> : <Pill>Score: -</Pill>}
                      <Pill>Total: EUR {Number(r?.totalEur || 0)}</Pill>
                      {typeof r?.holdingsCount === "number" ? <Pill>Holdings: {r.holdingsCount}</Pill> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      ) : null}
    </>
  );
}

export default function DailyLoop(props: DailyLoopProps) {
  switch (props.section) {
    case "timer":
      return renderTimer(props);
    case "postClose":
      return renderPostClose(props);
    case "continuity":
      return renderContinuity(props);
    case "introNext":
      return renderIntroNext(props);
    case "evidenceFollowUp":
      return renderEvidenceFollowUp(props);
    case "followUpSla":
      return renderFollowUpSla(props);
    case "profileProof":
      return renderProfileProof(props);
    case "advancedTelemetry":
      return renderAdvancedTelemetry(props);
    case "operationsTelemetry":
      return renderOperationsTelemetry(props);
    case "trackRecord":
      return renderTrackRecord(props);
    default:
      return null;
  }
}
