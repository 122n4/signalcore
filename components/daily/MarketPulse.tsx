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

function cleanUtf8Copy(raw: unknown) {
  const s = String(raw ?? "");
  if (!s) return "";
  return s
    .replace(/Ã¢â‚¬â„¢/g, "'")
    .replace(/Ã¢â‚¬Ëœ/g, "'")
    .replace(/Ã¢â‚¬Å“|Ã¢â‚¬Â/g, '"')
    .replace(/Ã¢â‚¬â€œ|Ã¢â‚¬â€/g, "-")
    .replace(/Ã¢â€ â€™/g, "->")
    .replace(/Ã¢â€ â€˜/g, "up")
    .replace(/Ã¢â€ â€œ/g, "down")
    .replace(/Ã¢Å“â€¦/g, "OK")
    .replace(/Ã¢â€šÂ¬/g, "EUR")
    .replace(/Ã‚/g, "")
    .trim();
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
    <div className="h-2.5 w-full rounded-full border border-slate-200 bg-slate-100/90 p-[1px]">
      <div className={clsx("h-full rounded-full bg-gradient-to-r transition-all duration-300", fillTone)} style={{ width: `${v}%` }} />
    </div>
  );
}

type DailyBriefingData = {
  enabled?: boolean;
  marketSummary?: string | null;
  marketEnvironment?: { description?: string | null } | null;
  portfolioStatus?: string | null;
  portfolioHealth: {
    status?: string | null;
    healthScore: number;
    description?: string | null;
  };
  keyOpportunityText: string;
  suggestedFocus: string;
  generatedAt?: string | null;
};

type ExpectedOutcomeModel = {
  lineA: string;
  lineB: string;
  lineC: string;
};

type CapitalMomentumModel = {
  label: string;
  message: string;
};

type DailyScoreBar = {
  id: string;
  label: string;
  value: number;
  hint: string;
};

type ContextSectionProps = {
  section: "context";
  dailyBriefing: DailyBriefingData | null;
  expectedOutcomeModel: ExpectedOutcomeModel;
  growthReadinessScore: number;
  capitalMomentumModel: CapitalMomentumModel;
};

type StatusSectionProps = {
  section: "status";
  syntrakeOperationalState: string;
  syntrakeOperationalLabel: string;
  syntrakeStatusSummary: string;
  syntrakeLastEvaluationAt: string | null;
  syntrakeCapitalPosture: string;
  dailyScoresNode: any;
  dailyPortfolioScore: any;
  autopilotScore: number;
  pressureScore: number | null;
  syntrakeNextEvaluationCountdown: string;
  decisionPreviewOnly: boolean;
  decisionExposure: string;
  syntrakeEngineVersion: string;
  syntrakePriorityClass: string | null;
  syntrakeAggression: string | null;
  dailyLoopStage: string | null;
};

type ProtectionSectionProps = {
  section: "protection";
  capitalProtectionSummaryNode: any;
  killSwitchNode: any;
  preTradeSafetyCheck: any;
  riskEnvelopeNode: any;
  riskPolicyNode: any;
  growthReadinessNode: any;
  weeklyValueNode: any;
  preExecutionSimulationNode: any;
  opportunityQueueContent?: React.ReactNode;
  priorityNotificationsNode: Array<{ id: string; title: string; detail: string }>;
  continuityLastAt: string | null;
  continuityCountdown: string | null;
  continuityNextAt: string | null;
  dailyTrendsNode: any;
  deltaLineText: string;
  continuityTrendChips: string[];
  progressWhatChanged: string[];
  operationalTone: "good" | "warn" | "bad";
  operationalScore: number;
  progressMeaningLine: string;
  holdProgressLine: string | null;
  antiChurnNode: any;
  weeklyPremiumReportNode: any;
};

type AdvancedDiagnosticsSectionProps = {
  section: "advancedDiagnostics";
  dailyLoopStage: string | null;
  decisionPreviewOnly: boolean;
  decisionExposure: string;
  dailyReplayAudit: any;
  dailyEngineV4: any;
  dailyScoreAudit: any;
  dailyScoresNode: any;
  autopilotScore: number;
  pressureScore: number | null;
  dailyEngineV4Scores: any;
  dailyAuditTrail: any;
  scoreAuditNotes: string[];
  executionScore: any;
  executionScoreTone: Tone;
  executionCoach: any;
  dailyExecutionEvidence: Record<string, any>;
  syntrakeTraceRows: any[];
};

type ScoreBarsSectionProps = {
  section: "scorebars";
  autopilotScore: number;
  dailyScoreBars: DailyScoreBar[];
};

type ProofSectionProps = {
  section: "proof";
  moneyConfirmed: {
    today?: number;
    week?: number;
    total?: number;
  } | null;
  proof: {
    whatChanged?: string[];
    meaning?: string | null;
  } | null;
  riskLeaks: Array<{
    title?: string;
    severity?: string;
  }>;
  pressureScore: number | null;
  streak: number;
  performance: {
    alpha30dPct?: number | null;
    totalReturnPct?: number | null;
    alphaTotalPct?: number | null;
    return30dPct?: number | null;
    benchmark30dPct?: number | null;
    return90dPct?: number | null;
    benchmark90dPct?: number | null;
    maxDrawdownPct?: number | null;
    volatility30dPct?: number | null;
    trackedDays?: number | null;
    benchmarkAnnualPct?: number | null;
  } | null;
};

type WealthScenario = {
  label: string;
  finalValue: number;
  annualReturnPct: number;
};

type WealthSectionProps = {
  section: "wealth";
  showWealth: boolean;
  wealthScenarios: WealthScenario[];
  wealthStarting: number;
  wealthMonthly: number;
  wealthTarget: number;
  autopilotMode: string;
  showDecisionPressure: boolean;
  pressureScore: number | null;
  pressureDrivers: Array<{
    label?: string;
    key?: string;
    weight?: number;
  }>;
};

export type MarketPulseProps =
  | ContextSectionProps
  | StatusSectionProps
  | ProtectionSectionProps
  | AdvancedDiagnosticsSectionProps
  | ScoreBarsSectionProps
  | ProofSectionProps
  | WealthSectionProps;

function renderContext(props: ContextSectionProps) {
  const briefingSummary = props.dailyBriefing?.marketSummary || props.dailyBriefing?.marketEnvironment?.description || props.expectedOutcomeModel.lineA;
  const portfolioHealth = props.dailyBriefing?.portfolioStatus || props.dailyBriefing?.portfolioHealth.description || props.expectedOutcomeModel.lineB;
  const focusLine = props.dailyBriefing?.suggestedFocus || props.expectedOutcomeModel.lineC;
  const healthTone =
    props.dailyBriefing?.portfolioHealth.status === "risk_high"
      ? "bad"
      : props.dailyBriefing?.portfolioHealth.status === "watch"
        ? "warn"
        : "good";

  return (
    <Card title="Market Pulse" subtitle="Context for the current cycle." right={<Badge tone={healthTone}>Readiness {Math.round(Number(props.growthReadinessScore || 0))}/100</Badge>}>
      <div className="space-y-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Trend</div>
          <div className="mt-2 text-[28px] font-semibold tracking-tight text-slate-900">{props.capitalMomentumModel.label}</div>
          <div className="mt-1 text-sm leading-relaxed text-slate-600">{briefingSummary}</div>
        </div>
        <div className="space-y-2 border-t border-slate-200/80 pt-4">
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">✓</span>
            <span className="font-medium text-slate-900">Portfolio health.</span>
            <span>{portfolioHealth}</span>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-3 text-sm leading-relaxed text-slate-700">{focusLine}</div>
          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">{props.capitalMomentumModel.message}</div>
        </div>
        {props.dailyBriefing?.generatedAt ? <div className="text-[11px] text-slate-500">Updated {fmtTime(props.dailyBriefing.generatedAt)}</div> : null}
      </div>
    </Card>
  );
}

function renderStatus(props: StatusSectionProps) {
  const autoScore = Number.isFinite(Number((props.dailyScoresNode as any)?.autopilotScore))
    ? Math.round(Number((props.dailyScoresNode as any).autopilotScore))
    : Number.isFinite(Number((props.dailyPortfolioScore as any)?.autopilotScore))
      ? Math.round(Number((props.dailyPortfolioScore as any).autopilotScore))
      : Math.round(Number(props.autopilotScore || 0));
  const riskPressure = Number.isFinite(Number((props.dailyScoresNode as any)?.riskPressure ?? props.pressureScore))
    ? Math.round(Number((props.dailyScoresNode as any)?.riskPressure ?? props.pressureScore))
    : 0;

  return (
    <Card
      title="Syntrake Status"
      subtitle="Live system authority from the server evaluation cycle."
      right={<Badge tone={props.syntrakeOperationalState === "Acting" ? "good" : props.syntrakeOperationalState === "Waiting" ? "warn" : "neutral"}>{props.syntrakeOperationalLabel}</Badge>}
    >
      <div className="space-y-4">
        <div className="rounded-[22px] border border-slate-200 bg-slate-50/75 px-4 py-4">
          <div className="text-base font-semibold text-slate-900">{props.syntrakeStatusSummary}</div>
          <div className="mt-2 text-xs text-slate-500">
            {props.syntrakeLastEvaluationAt ? `Last evaluation: ${fmtTime(props.syntrakeLastEvaluationAt)}.` : "Last evaluation time unavailable."}
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <div className="mb-2 flex items-center justify-between text-sm text-slate-600">
              <span>Autopilot score</span>
              <span className="font-semibold text-slate-900">{autoScore}/100</span>
            </div>
            <ProgressBar value={autoScore} />
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between text-sm text-slate-600">
              <span>Risk pressure</span>
              <span className="font-semibold text-slate-900">{riskPressure}/100</span>
            </div>
            <ProgressBar value={riskPressure} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Capital posture</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">{props.syntrakeCapitalPosture}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Next evaluation</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">
                {props.syntrakeNextEvaluationCountdown === "-" ? "-" : `in ${props.syntrakeNextEvaluationCountdown}`}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Chip tone={props.decisionPreviewOnly ? "warn" : "good"}>Decision exposure: {props.decisionExposure}</Chip>
          <Chip tone="neutral">Powered by Syntrake {props.syntrakeEngineVersion}</Chip>
          {props.syntrakePriorityClass ? <Chip tone="neutral">Priority: {props.syntrakePriorityClass}</Chip> : null}
          {props.syntrakeAggression ? <Chip tone="neutral">Aggression: {props.syntrakeAggression}</Chip> : null}
          {props.dailyLoopStage ? <Chip tone="neutral">Loop: {props.dailyLoopStage}</Chip> : null}
        </div>
      </div>
    </Card>
  );
}

function renderProtection(props: ProtectionSectionProps) {
  const continuityStripCard = (
    <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
      <div className="text-xs font-semibold text-zinc-500">Continuity timeline</div>
      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
        <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">Yesterday</div>
          <div className="mt-1 text-xs text-zinc-800">Evaluation completed{props.continuityLastAt ? ` (${fmtTime(props.continuityLastAt)})` : "."}</div>
        </div>
        <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">Today</div>
          <div className="mt-1 text-xs text-zinc-800">Preparation phase active.</div>
        </div>
        <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">Tomorrow</div>
          <div className="mt-1 text-xs text-zinc-800">
            {props.continuityCountdown && props.continuityCountdown !== "-" ? `Next evaluation in ${props.continuityCountdown}.` : "Next evaluation scheduled."}
          </div>
        </div>
      </div>
      <div className="mt-2 text-[11px] text-zinc-500">Syntrake runs continuous capital management. Next update at the next cycle.</div>
      {props.continuityNextAt ? (
        <div className="mt-2 text-[11px] text-zinc-500">Scheduled next evaluation: {fmtTime(props.continuityNextAt)}</div>
      ) : null}
    </div>
  );

  const valueProofCard = (() => {
    const autopilotTrend = (props.dailyTrendsNode as any)?.autopilotScore;
    const riskTrend = (props.dailyTrendsNode as any)?.riskPressure;
    const executionTrend = (props.dailyTrendsNode as any)?.executionScore;
    const apDelta = Number((autopilotTrend as any)?.delta1);
    const riskDelta = Number((riskTrend as any)?.delta1);
    const executionDelta = Number((executionTrend as any)?.delta1);

    const computedLine =
      Number.isFinite(riskDelta) && riskDelta < 0
        ? "Risk pressure decreased since last evaluation."
        : Number.isFinite(apDelta) && apDelta > 0
          ? "Autopilot score improved since last evaluation."
          : Number.isFinite(executionDelta) && executionDelta > 0
            ? "Execution discipline improving."
            : props.deltaLineText || props.continuityTrendChips[0] || "Process stability maintained in the latest evaluation cycle.";

    const changedLines = props.progressWhatChanged.slice(0, 2);
    const bulletLines = [...changedLines, computedLine].map((x) => cleanUtf8Copy(x)).filter(Boolean).slice(0, 3);
    const tone: "good" | "warn" | "bad" = props.operationalTone;

    return (
      <Card
        title="What Syntrake improved (today)"
        subtitle="Measured progress and protection signals from the latest cycle."
        right={<Badge tone={tone}>{props.operationalScore}/100</Badge>}
      >
        <div className="space-y-2">
          <div className="space-y-1">
            {bulletLines.map((line, idx) => (
              <div key={`value-proof-line-${idx}`} className="text-xs text-zinc-700">
                - {line}
              </div>
            ))}
          </div>
          <div className="text-xs text-zinc-700">{props.progressMeaningLine}</div>
          {props.holdProgressLine ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">{props.holdProgressLine}</div>
          ) : null}
        </div>
      </Card>
    );
  })();

  const capitalProtectionSummaryCard = (
    <Card
      title="Capital Protection Summary"
      subtitle="Hard limits, risk envelope and pre-trade safety state."
      right={
        <Badge
          tone={
            props.killSwitchNode?.active || props.preTradeSafetyCheck?.status === "blocked"
              ? "bad"
              : props.riskEnvelopeNode?.status === "constrained"
                ? "warn"
                : "good"
          }
        >
          {props.killSwitchNode?.active ? "Protected" : props.riskEnvelopeNode?.status === "constrained" ? "Constrained" : "Ready"}
        </Badge>
      }
    >
      <div className="space-y-3">
        {props.capitalProtectionSummaryNode?.summary ? (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">{props.capitalProtectionSummaryNode.summary}</div>
        ) : null}
        {props.riskPolicyNode ? (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
            Policy limits: top1 {Math.round(props.riskPolicyNode.policy.maxSinglePositionPct)}% | top3 {Math.round(props.riskPolicyNode.policy.maxTop3ConcentrationPct)}% | max drawdown {Math.round(props.riskPolicyNode.policy.maxDrawdownPct)}% | max exposure {Math.round(props.riskPolicyNode.policy.maxExposurePct)}% | min pricing {Math.round(props.riskPolicyNode.policy.minPricingCoveragePct)}%.
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-zinc-500">Posture</div>
            <div className="mt-1 text-sm font-semibold text-zinc-900">{props.capitalProtectionSummaryNode?.posture || "-"}</div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-zinc-500">Plan alignment</div>
            <div className="mt-1 text-sm font-semibold text-zinc-900">{props.capitalProtectionSummaryNode?.planAlignment || "-"}</div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-zinc-500">Risk pressure</div>
            <div className="mt-1 text-sm font-semibold text-zinc-900">
              {Number.isFinite(props.capitalProtectionSummaryNode?.riskPressure) ? `${Math.round(Number(props.capitalProtectionSummaryNode?.riskPressure))}/100` : "-"}
            </div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-zinc-500">Kill-switch</div>
            <div className="mt-1 text-sm font-semibold text-zinc-900">{props.killSwitchNode?.state || "Monitoring"}</div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-zinc-500">Deploy cap</div>
            <div className="mt-1 text-sm font-semibold text-zinc-900">
              {Number.isFinite(props.riskEnvelopeNode?.maxDeployPct) ? `${Math.round(Number(props.riskEnvelopeNode?.maxDeployPct))}%` : "-"}
            </div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-zinc-500">Max position</div>
            <div className="mt-1 text-sm font-semibold text-zinc-900">
              {Number.isFinite(props.riskEnvelopeNode?.maxPositionPct) ? `${Math.round(Number(props.riskEnvelopeNode?.maxPositionPct))}%` : "-"}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700">
            <div className="font-semibold text-zinc-900">Pre-trade safety check</div>
            <div className="mt-1">
              {props.preTradeSafetyCheck?.required
                ? props.preTradeSafetyCheck.status === "passed"
                  ? "Passed. Execution can proceed inside envelope."
                  : `Blocked. ${props.preTradeSafetyCheck.reason || "Resolve safety prerequisites before execution."}`
                : "Not required for this cycle."}
            </div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700">
            <div className="font-semibold text-zinc-900">Growth readiness</div>
            <div className="mt-1">
              {props.growthReadinessNode ? `${Math.round(props.growthReadinessNode.score)}/100 (${props.growthReadinessNode.tier})` : "-"}
              {props.growthReadinessNode?.nextFocus ? ` - ${props.growthReadinessNode.nextFocus}` : ""}
            </div>
          </div>
        </div>
        {props.weeklyValueNode ? (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
            Weekly value: risk avoided {Math.round(props.weeklyValueNode.riskAvoidedPoints)} pts | errors avoided {Math.round(props.weeklyValueNode.errorsAvoidedEstimate)} | discipline delta {Math.round(props.weeklyValueNode.disciplineUpPct)}%.
          </div>
        ) : null}
        {props.preExecutionSimulationNode ? (
          <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700">
            <div className="font-semibold text-zinc-900">Pre-execution simulation</div>
            <div className="mt-1 grid grid-cols-1 gap-2 md:grid-cols-3">
              {[props.preExecutionSimulationNode.defensive, props.preExecutionSimulationNode.base, props.preExecutionSimulationNode.accelerated].map((s) => (
                <div key={s.label} className="rounded-lg border border-zinc-100 bg-zinc-50 px-2 py-2">
                  <div className="font-medium text-zinc-900">{s.label}</div>
                  <div>Risk delta: {s.riskDelta > 0 ? `+${s.riskDelta}` : s.riskDelta}</div>
                  <div>Alignment delta: {s.alignmentDelta > 0 ? `+${s.alignmentDelta}` : s.alignmentDelta}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {props.opportunityQueueContent || null}
        {props.priorityNotificationsNode.length > 0 ? (
          <div className="space-y-1">
            {props.priorityNotificationsNode.map((n) => (
              <div key={`notif-${n.id}`} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700">
                <span className="font-semibold text-zinc-900">{n.title}</span>: {n.detail}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </Card>
  );

  const retentionGuardCard =
    props.antiChurnNode ? (
      <Card
        title="Retention guard"
        subtitle="Intervention layer to prevent discipline drop and loop churn."
        right={
          <Badge
            tone={
              props.antiChurnNode.riskLevel === "high"
                ? "bad"
                : props.antiChurnNode.riskLevel === "medium"
                  ? "warn"
                  : "good"
            }
          >
            {props.antiChurnNode.riskLevel.toUpperCase()} ({Math.round(props.antiChurnNode.score)}/100)
          </Badge>
        }
      >
        <div className="space-y-2">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">{props.antiChurnNode.message}</div>
          {props.antiChurnNode.interventions.length > 0 ? (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {props.antiChurnNode.interventions.map((item: any) => (
                <div key={`anti-churn-${item.id}`} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700">
                  <div className="font-semibold text-zinc-900">{item.title}</div>
                  <div className="mt-1">{item.detail}</div>
                </div>
              ))}
            </div>
          ) : null}
          <div className="text-[11px] text-zinc-500">
            Next retention check in {Math.max(1, Math.round(props.antiChurnNode.nextCheckHours))}h
            {props.antiChurnNode.triggers.length > 0 ? ` | triggers: ${props.antiChurnNode.triggers.join(", ")}` : ""}.
          </div>
        </div>
      </Card>
    ) : null;

  const weeklyPremiumReportCard =
    props.weeklyPremiumReportNode ? (
      <Card
        title="Weekly premium report"
        subtitle="Auto-generated process report from the latest cycle evidence."
        right={<Badge tone="neutral">{props.weeklyPremiumReportNode.periodLabel || "Weekly"}</Badge>}
      >
        <div className="space-y-2">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">{props.weeklyPremiumReportNode.summary}</div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700">
              <div className="font-semibold text-zinc-900">Growth readiness</div>
              <div className="mt-1">{Math.round(props.weeklyPremiumReportNode.metrics.growthReadiness)}/100</div>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700">
              <div className="font-semibold text-zinc-900">Execution score</div>
              <div className="mt-1">{Math.round(props.weeklyPremiumReportNode.metrics.executionScore)}/100</div>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700">
              <div className="font-semibold text-zinc-900">Streak</div>
              <div className="mt-1">{Math.round(props.weeklyPremiumReportNode.metrics.streakDays)} day(s)</div>
            </div>
          </div>
          {props.weeklyPremiumReportNode.highlights.length > 0 ? (
            <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700">
              <div className="font-semibold text-zinc-900">Highlights</div>
              <div className="mt-1 space-y-1">
                {props.weeklyPremiumReportNode.highlights.map((line: string, idx: number) => (
                  <div key={`weekly-highlight-${idx}`}>- {line}</div>
                ))}
              </div>
            </div>
          ) : null}
          {props.weeklyPremiumReportNode.focusNextWeek.length > 0 ? (
            <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700">
              <div className="font-semibold text-zinc-900">Focus next week</div>
              <div className="mt-1 space-y-1">
                {props.weeklyPremiumReportNode.focusNextWeek.map((line: string, idx: number) => (
                  <div key={`weekly-focus-${idx}`}>- {line}</div>
                ))}
              </div>
            </div>
          ) : null}
          {props.weeklyPremiumReportNode.trustLine ? <div className="text-[11px] text-zinc-500">{props.weeklyPremiumReportNode.trustLine}</div> : null}
        </div>
      </Card>
    ) : null;

  return (
    <>
      {capitalProtectionSummaryCard}
      {valueProofCard}
      {retentionGuardCard}
      {weeklyPremiumReportCard}
      {continuityStripCard}
    </>
  );
}

function renderAdvancedDiagnostics(props: AdvancedDiagnosticsSectionProps) {
  return (
    <Card
      title="Syntrake intelligence (advanced)"
      subtitle="Decision trace, scores and replay/audit metadata from the server."
      right={<Badge tone="neutral">Advanced</Badge>}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {props.dailyLoopStage ? <Chip tone="neutral">Loop: {props.dailyLoopStage}</Chip> : null}
          <Chip tone={props.decisionPreviewOnly ? "warn" : "good"}>Exposure: {props.decisionExposure}</Chip>
          {String((props.dailyReplayAudit as any)?.inputHash || (props.dailyEngineV4 as any)?.inputHash || "").trim() ? (
            <Chip tone="neutral">Hash: {String((props.dailyReplayAudit as any)?.inputHash || (props.dailyEngineV4 as any)?.inputHash).slice(0, 12)}...</Chip>
          ) : null}
          {typeof (props.dailyScoreAudit as any)?.deterministic === "boolean" ? (
            <Chip tone={(props.dailyScoreAudit as any).deterministic ? "good" : "warn"}>
              Deterministic: {(props.dailyScoreAudit as any).deterministic ? "Yes" : "No"}
            </Chip>
          ) : null}
          {typeof (props.dailyReplayAudit as any)?.replayReady === "boolean" ? (
            <Chip tone={(props.dailyReplayAudit as any).replayReady ? "good" : "warn"}>
              Replay: {(props.dailyReplayAudit as any).replayReady ? "Ready" : "Not ready"}
            </Chip>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-zinc-200 bg-white px-3 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Scores</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-2 py-2">
                <div className="text-[11px] text-zinc-500">Autopilot</div>
                <div className="font-semibold text-zinc-900">{Number((props.dailyScoresNode as any)?.autopilotScore ?? props.autopilotScore ?? 0)}</div>
              </div>
              <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-2 py-2">
                <div className="text-[11px] text-zinc-500">Decision confidence</div>
                <div className="font-semibold text-zinc-900">
                  {Number.isFinite(Number((props.dailyScoresNode as any)?.decisionConfidence))
                    ? Number((props.dailyScoresNode as any)?.decisionConfidence)
                    : "-"}
                </div>
              </div>
              <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-2 py-2">
                <div className="text-[11px] text-zinc-500">Risk pressure</div>
                <div className="font-semibold text-zinc-900">
                  {Number.isFinite(Number((props.dailyScoresNode as any)?.riskPressure ?? props.pressureScore))
                    ? Number((props.dailyScoresNode as any)?.riskPressure ?? props.pressureScore)
                    : "-"}
                </div>
              </div>
              <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-2 py-2">
                <div className="text-[11px] text-zinc-500">Plan coherence</div>
                <div className="font-semibold text-zinc-900">
                  {Number.isFinite(Number((props.dailyScoresNode as any)?.planCoherence)) ? Number((props.dailyScoresNode as any)?.planCoherence) : "-"}
                </div>
              </div>
            </div>
            <div className="mt-3 text-xs text-zinc-600">
              V4: confidence{" "}
              {Number.isFinite(Number((props.dailyEngineV4Scores as any)?.confidenceScore))
                ? Number((props.dailyEngineV4Scores as any)?.confidenceScore)
                : "-"}{" "}
              | data{" "}
              {Number.isFinite(Number((props.dailyEngineV4Scores as any)?.dataQualityScore))
                ? Number((props.dailyEngineV4Scores as any)?.dataQualityScore)
                : "-"}{" "}
              | reliability{" "}
              {Number.isFinite(Number((props.dailyEngineV4Scores as any)?.reliabilityScore))
                ? Number((props.dailyEngineV4Scores as any)?.reliabilityScore)
                : "-"}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white px-3 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Replay / audit</div>
            <div className="mt-2 space-y-1 text-sm text-zinc-800">
              <div>Replay ready: {Boolean((props.dailyReplayAudit as any)?.replayReady) ? "Yes" : "No"}</div>
              <div>Reproducible: {Boolean((props.dailyReplayAudit as any)?.decisionReproducible) ? "Yes" : "No"}</div>
              <div>Trace count: {Number((props.dailyScoreAudit as any)?.traceCount || 0)}</div>
              <div>Guardrails: {Number((props.dailyScoreAudit as any)?.guardrailCount || 0)}</div>
              <div>Audit notes: {Number((props.dailyScoreAudit as any)?.noteCount || 0)}</div>
              {String((props.dailyAuditTrail as any)?.generatedBy || "").trim() ? <div>Audit source: {String((props.dailyAuditTrail as any).generatedBy)}</div> : null}
            </div>
            {props.scoreAuditNotes.length > 0 ? (
              <div className="mt-2 rounded-lg border border-zinc-100 bg-zinc-50 px-2 py-2 text-xs text-zinc-700 space-y-1">
                {props.scoreAuditNotes.slice(0, 4).map((note, idx) => (
                  <div key={`score-audit-note-${idx}`}>- {note}</div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        {(props.executionScore || props.executionCoach || Object.keys(props.dailyExecutionEvidence).length > 0) ? (
          <div className="rounded-xl border border-zinc-200 bg-white px-3 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Execution discipline</div>
              {props.executionScore ? <Badge tone={props.executionScoreTone}>{props.executionScore.score}/100</Badge> : null}
              {props.executionCoach?.topPatterns?.length ? <Badge tone="neutral">{props.executionCoach.topPatterns.length} patterns</Badge> : null}
            </div>
            <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-2 py-2 text-xs text-zinc-700 space-y-1">
                <div className="font-semibold text-zinc-900">Execution score</div>
                {props.executionScore ? (
                  <>
                    <div>Discipline: {props.executionScore.disciplinePct}%</div>
                    <div>Validation: {props.executionScore.validationPct}%</div>
                    <div>Checklist: {props.executionScore.checklistPct}%</div>
                  </>
                ) : (
                  <div>Execution score not available for this cycle.</div>
                )}
              </div>
              <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-2 py-2 text-xs text-zinc-700 space-y-1">
                <div className="font-semibold text-zinc-900">Top patterns</div>
                {props.executionCoach?.topPatterns?.length ? (
                  props.executionCoach.topPatterns.slice(0, 2).map((p: any, idx: number) => (
                    <div key={`adv-exec-pattern-${idx}`} className="rounded-md border border-zinc-100 bg-white px-2 py-1.5">
                      <div className="font-medium text-zinc-900">{p.title || p.key || "Pattern"}</div>
                      <div className="text-[11px] text-zinc-600">
                        {p.severity.toUpperCase()} · {p.count}x
                      </div>
                      {p.nextStep ? <div className="mt-0.5 text-[11px] text-zinc-700">Next step: {p.nextStep}</div> : null}
                    </div>
                  ))
                ) : (
                  <div>No recurring execution patterns detected yet.</div>
                )}
              </div>
              <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-2 py-2 text-xs text-zinc-700 space-y-1">
                <div className="font-semibold text-zinc-900">Execution evidence</div>
                {Number.isFinite(Number((props.dailyExecutionEvidence as any)?.proofs14)) ? (
                  <>
                    <div>Proofs (14d): {Number((props.dailyExecutionEvidence as any).proofs14 || 0)}</div>
                    <div>Avg quality (14d): {Number((props.dailyExecutionEvidence as any).avgQuality14 || 0)}/100</div>
                    <div>Strong proof days (7d): {Number((props.dailyExecutionEvidence as any).strongProofDays7 || 0)}</div>
                    <div>
                      Latest proof: {String((props.dailyExecutionEvidence as any)?.latestAt || "").trim() ? fmtTime((props.dailyExecutionEvidence as any).latestAt) : "-"}
                    </div>
                    {(props.dailyExecutionEvidence as any)?.avgSlippageBps14 != null ? (
                      <div>Avg slippage (14d): {Number((props.dailyExecutionEvidence as any).avgSlippageBps14)} bps</div>
                    ) : null}
                    {(props.dailyExecutionEvidence as any)?.totalFeesEur14 != null ? (
                      <div>Fees (14d): {fmtEUR(Number((props.dailyExecutionEvidence as any).totalFeesEur14 || 0))}</div>
                    ) : null}
                  </>
                ) : (
                  <div>Execution evidence not available yet.</div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Decision trace</div>
          <div className="mt-2 space-y-1 text-xs text-zinc-800">
            {props.syntrakeTraceRows.length > 0 ? (
              props.syntrakeTraceRows.map((row: any, idx: number) => (
                <div key={`syntrake-trace-${idx}`} className="rounded-lg border border-zinc-100 bg-white px-2 py-1.5">
                  <span className="font-semibold text-zinc-900">{String(row?.step || "step")}</span>
                  <span className="mx-1 text-zinc-500">|</span>
                  <span>{String(row?.outcome || "-")}</span>
                  {row?.detail ? <span className="text-zinc-500"> {" - "}{String(row.detail)}</span> : null}
                </div>
              ))
            ) : (
              <div className="text-zinc-600">Trace not available for this cycle.</div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function renderScoreBars(props: ScoreBarsSectionProps) {
  return (
    <Card
      title="Score bars"
      subtitle="How Syntrake calibrates each next action."
      right={<Badge tone={props.autopilotScore >= 75 ? "good" : props.autopilotScore >= 60 ? "warn" : "bad"}>{props.autopilotScore}/100</Badge>}
    >
      <div className="space-y-3">
        <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700">
          Why this appears now: these scores control action sizing, risk guardrails, and execution tempo.
        </div>
        {props.dailyScoreBars.map((bar) => (
          <div key={bar.id} className="rounded-xl border border-zinc-200 bg-white px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-zinc-900">{bar.label}</div>
              <div className="text-sm font-semibold text-zinc-900">{bar.value}/100</div>
            </div>
            <div className="mt-2">
              <ProgressBar value={bar.value} />
            </div>
            <div className="mt-2 text-xs text-zinc-700">{bar.hint}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function renderProof(props: ProofSectionProps) {
  return (
    <>
      <Card
        title="Proof first"
        subtitle="Receipts-based: what changed, and why it matters."
        right={
          <div className="text-right">
            <div className="text-xs text-zinc-500">Confirmed</div>
            <div className="text-sm font-semibold text-zinc-900">
              {props.moneyConfirmed?.today >= 0 ? "+" : "-"}EUR {Math.abs(Number(props.moneyConfirmed?.today || 0))}
              <span className="text-xs font-medium text-zinc-500 ml-2">today</span>
            </div>
          </div>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
            <div className="text-xs font-semibold text-zinc-700 mb-2">What changed</div>
            <ul className="space-y-2">
              {(Array.isArray(props.proof?.whatChanged) ? props.proof.whatChanged : []).slice(0, 3).map((x: string, i: number) => (
                <li key={i} className="text-sm text-zinc-900">
                  - {x}
                </li>
              ))}
              {!props.proof?.whatChanged ? <li className="text-sm text-zinc-600">- No receipt available yet.</li> : null}
            </ul>
          </div>

          <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
            <div className="text-xs font-semibold text-zinc-700 mb-2">Meaning</div>
            <div className="text-sm text-zinc-900">{props.proof?.meaning ?? "Autopilot will generate meaning as soon as holdings/pricing are available."}</div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Chip tone={props.riskLeaks?.[0]?.severity === "high" ? "bad" : props.riskLeaks?.[0]?.severity === "med" ? "warn" : "good"}>
                {props.riskLeaks?.[0]?.title ? `Top leak: ${props.riskLeaks[0].title}` : "Top leak: none"}
              </Chip>
              {typeof props.pressureScore === "number" ? (
                <Chip tone={props.pressureScore >= 70 ? "bad" : props.pressureScore >= 40 ? "warn" : "good"}>Pressure: {Math.round(props.pressureScore)}</Chip>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-2xl border border-zinc-100 bg-white p-4">
            <div className="text-xs text-zinc-500">Confirmed week</div>
            <div className="text-lg font-semibold text-zinc-900">
              {props.moneyConfirmed?.week >= 0 ? "+" : "-"}EUR {Math.abs(Number(props.moneyConfirmed?.week || 0))}
            </div>
          </div>
          <div className="rounded-2xl border border-zinc-100 bg-white p-4">
            <div className="text-xs text-zinc-500">Confirmed total</div>
            <div className="text-lg font-semibold text-zinc-900">
              {props.moneyConfirmed?.total >= 0 ? "+" : "-"}EUR {Math.abs(Number(props.moneyConfirmed?.total || 0))}
            </div>
          </div>
          <div className="rounded-2xl border border-zinc-100 bg-white p-4">
            <div className="text-xs text-zinc-500">Streak</div>
            <div className="text-lg font-semibold text-zinc-900">{props.streak} days</div>
          </div>
        </div>
      </Card>

      <Card
        title="Net outcome vs benchmark"
        subtitle="Based on your real daily snapshots."
        right={
          <Badge
            tone={
              Number(props.performance?.alpha30dPct || 0) > 0
                ? "good"
                : Number(props.performance?.alpha30dPct || 0) < 0
                  ? "bad"
                  : "neutral"
            }
          >
            Alpha 30d: {fmtPct(Number(props.performance?.alpha30dPct || 0))}
          </Badge>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-2xl border border-zinc-100 bg-white p-4">
            <div className="text-xs text-zinc-500">Total return</div>
            <div className="text-lg font-semibold text-zinc-900">{fmtPct(Number(props.performance?.totalReturnPct || 0))}</div>
            <div className="mt-1 text-xs text-zinc-500">vs benchmark {fmtPct(Number(props.performance?.alphaTotalPct || 0))}</div>
          </div>
          <div className="rounded-2xl border border-zinc-100 bg-white p-4">
            <div className="text-xs text-zinc-500">30d return</div>
            <div className="text-lg font-semibold text-zinc-900">{fmtPct(Number(props.performance?.return30dPct || 0))}</div>
            <div className="mt-1 text-xs text-zinc-500">benchmark {fmtPct(Number(props.performance?.benchmark30dPct || 0))}</div>
          </div>
          <div className="rounded-2xl border border-zinc-100 bg-white p-4">
            <div className="text-xs text-zinc-500">90d return</div>
            <div className="text-lg font-semibold text-zinc-900">{fmtPct(Number(props.performance?.return90dPct || 0))}</div>
            <div className="mt-1 text-xs text-zinc-500">benchmark {fmtPct(Number(props.performance?.benchmark90dPct || 0))}</div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
            <div className="text-xs text-zinc-500">Max drawdown</div>
            <div className="text-lg font-semibold text-zinc-900">{fmtPct(Number(props.performance?.maxDrawdownPct || 0))}</div>
          </div>
          <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
            <div className="text-xs text-zinc-500">Volatility 30d</div>
            <div className="text-lg font-semibold text-zinc-900">{fmtPct(Number(props.performance?.volatility30dPct || 0))}</div>
          </div>
          <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
            <div className="text-xs text-zinc-500">Tracked days</div>
            <div className="text-lg font-semibold text-zinc-900">{Math.max(0, Number(props.performance?.trackedDays || 0))}</div>
          </div>
        </div>

        <div className="mt-3 text-xs text-zinc-500">Benchmark baseline uses mode annual rate ({fmtPct(Number(props.performance?.benchmarkAnnualPct || 0))}).</div>
      </Card>
    </>
  );
}

function renderWealth(props: WealthSectionProps) {
  return (
    <>
      {props.showWealth ? (
        <Card title="Wealth checkpoint" subtitle="3-year projection based on your saved plan inputs.">
          <div className="space-y-3">
            <div className="text-sm text-zinc-700">
              Starting {fmtEUR(props.wealthStarting)} + {fmtEUR(props.wealthMonthly)}/month toward {fmtEUR(props.wealthTarget)}.
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {props.wealthScenarios.map((s) => (
                <div key={s.label} className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
                  <div className="text-xs font-semibold text-zinc-500">{s.label}</div>
                  <div className="mt-1 text-lg font-semibold text-zinc-900">{fmtEUR(s.finalValue)}</div>
                  <div className="mt-1 text-xs text-zinc-600">{s.annualReturnPct.toFixed(1)}% annualized</div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href={`/app?tab=planning&mode=${props.autopilotMode}`}
                className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900"
              >
                Tune wealth plan
              </a>
            </div>
          </div>
        </Card>
      ) : null}

      {props.showDecisionPressure ? (
        <Card title="Decision pressure" subtitle="Why today matters (institutional drivers)">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-full">
                <ProgressBar value={typeof props.pressureScore === "number" ? props.pressureScore : 0} />
                <div className="mt-1 text-xs text-zinc-500">
                  {typeof props.pressureScore === "number"
                    ? props.pressureScore >= 70
                      ? "High - fix leaks first"
                      : props.pressureScore >= 40
                        ? "Medium - review the top candidate"
                        : "Low - stability is a decision"
                    : "Pressure not available yet."}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-zinc-500">Score</div>
                <div className="text-xl font-semibold text-zinc-900">{typeof props.pressureScore === "number" ? Math.round(props.pressureScore) : "-"}</div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {props.pressureDrivers.slice(0, 5).map((d, i) => (
                <Chip key={i} tone={d?.weight != null && d.weight >= 30 ? "bad" : d?.weight != null && d.weight >= 18 ? "warn" : "neutral"}>
                  {d?.label || d?.key}
                </Chip>
              ))}
              {props.pressureDrivers.length === 0 ? <div className="text-sm text-zinc-600">No drivers detected.</div> : null}
            </div>
          </div>
        </Card>
      ) : null}
    </>
  );
}

export default function MarketPulse(props: MarketPulseProps) {
  switch (props.section) {
    case "context":
      return renderContext(props);
    case "status":
      return renderStatus(props);
    case "protection":
      return renderProtection(props);
    case "advancedDiagnostics":
      return renderAdvancedDiagnostics(props);
    case "scorebars":
      return renderScoreBars(props);
    case "proof":
      return renderProof(props);
    case "wealth":
      return renderWealth(props);
    default:
      return null;
  }
}
