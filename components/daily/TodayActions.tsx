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

function formatIntWithSpaces(v: number) {
  const n = Math.round(Math.abs(Number.isFinite(v) ? v : 0));
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function fmtEUR(v: number) {
  const sign = Number(v) < 0 ? "-" : "";
  return `${sign}${formatIntWithSpaces(v)} EUR`;
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

type BrokerProfile = {
  label: string;
  url?: string | null;
};

type PendingExecution = {
  rows: number;
};

type CycleState = {
  state: string;
  detail: string;
};

type CycleStateView = CycleState & {
  label: string;
  tone: Tone | string;
};

type BrokerRealityCheck = {
  ok: boolean;
  label: string;
  detail: string;
};

type OperatorLogRow = {
  step: string;
  status: string;
  detail: string;
};

type SimpleGuide = {
  tone: Tone;
  step: number;
  total: number;
  title: string;
  detail: string;
  actionLabel: string;
};

type BrokerScriptProps = {
  section: "brokerScript";
  directBrokerConnected: boolean;
  doneToday: boolean;
  manualExecutionPending: PendingExecution | null;
  manualBrokerProfile: BrokerProfile;
  runningOperator: boolean;
  onExecuteClick: () => void;
  onCopyBrokerExecutionScript: () => void;
};

type ManualBrokerIntroProps = {
  section: "manualBrokerIntro";
  directBrokerConnected: boolean;
  manualBrokerProfile: BrokerProfile;
  runningOperator: boolean;
  onExecuteClick: () => void;
};

type SimpleExecutionStepProps = {
  section: "simpleExecutionStep";
  simpleExecutionStepRequired: boolean;
  capitalActionCenterModel: any;
  manualBrokerProfile: BrokerProfile;
  simpleExecutionInstruction: string;
  cycleState: CycleState;
  runningOperator: boolean;
  onPrimaryAction: () => void;
};

type OperationalActionProps = {
  section: "operationalAction";
  capitalActionCenterModel: any;
  cycleState: CycleStateView;
  manualExecutionPending: PendingExecution | null;
  manualExecutionConfirmed: boolean;
  actionGate: any;
  nextBestMaskedByPaywall: boolean;
  runningOperator: boolean;
  manualBrokerProfile: BrokerProfile;
  onPrimaryAction: () => void;
};

type BeforeLeaveProps = {
  section: "beforeLeave";
  brokerRealityChecks: BrokerRealityCheck[];
};

type SimpleFlowProps = {
  section: "simpleFlow";
  doneToday: boolean;
  needsSetupAction: boolean;
  runningOperator: boolean;
  executeStepReady: boolean;
  cycleState: CycleState;
  canClose: boolean;
  markingDone: boolean;
  closeDayLabel: string;
  closeDayHint: string;
  manualExecutionRequired: boolean;
  manualExecutionProofReady: boolean;
  openLeakCount: number;
  onSetupClick: () => void;
  onExecuteClick: () => void;
  onCloseClick: () => void;
  onFixTopRisk: () => void;
};

type ActionDockProps = {
  section: "actionDock";
  firstDailyMinimalFlow: boolean;
  doneToday: boolean;
  cycleState: CycleStateView;
  needsSetupAction: boolean;
  runningOperator: boolean;
  executeStepReady: boolean;
  canFixNow: boolean;
  openLeakCount: number;
  starterWarmupEffective: boolean;
  canClose: boolean;
  markingDone: boolean;
  closeStepEmphasis: boolean;
  closeDayLabel: string;
  closeDayHint: string;
  manualExecutionRequired: boolean;
  manualExecutionProofReady: boolean;
  onSetupClick: () => void;
  onExecuteClick: () => void;
  onFixClick: () => void;
  onCloseClick: () => void;
};

type ManualStatusProps = {
  section: "manualStatus";
  fixAuditMeta: any;
  fixAuditRows: any[];
  onOpenFixAudit: () => void;
  manualExecutionPending: PendingExecution | null;
  manualExecutionGateMinQuality: number;
  manualExecutionGateRequireReference: boolean;
  manualExecutionReminder: any;
  manualFixRows: any[];
  onOpenManualChecklist: () => void;
  onRunExecuteForMe: () => void;
  onRefreshDaily: () => void;
  manualExecutionProof: any;
  manualExecutionConfirmed: boolean;
};

type SuitabilityProps = {
  section: "suitability";
  suitability: any;
  autopilotMode: string;
};

type ProfileIntakeProps = {
  section: "profileIntake";
  profileIntake: {
    complete: boolean;
    starting: number;
    monthly: number;
    target: number;
    missing: string[];
  };
  autopilotMode: string;
};

type StartHereProps = {
  section: "startHere";
  firstDailyMinimalFlow: boolean;
  doneToday: boolean;
  title: string;
  subtitle: string;
  simpleGuide: SimpleGuide;
  runningOperator: boolean;
  manualExecutionPending: PendingExecution | null;
  directBrokerConnected: boolean;
  advancedModeEnabled: boolean;
  showAdvancedToday: boolean;
  operatorLog: OperatorLogRow[];
  onRunSimpleGuideAction: () => void;
  onExecuteClick: () => void;
  onToggleAdvancedToday: () => void;
};

type QualityGateProps = {
  section: "qualityGate";
  showExtendedActionCards: boolean;
  actionGate: any;
  whyNow: any;
  onRefresh: () => void;
  actionGateAlert: any;
  gateAlertTone: Tone;
};

type ExecutionProtocolProps = {
  section: "executionProtocol";
  showExtendedActionCards: boolean;
  profileProtocol: any;
  canRunExecute: boolean;
  executionBlockedReason: string | null;
  runningOperator: boolean;
  directBrokerConnected: boolean;
  autopilotMode: string;
  onExecuteClick: () => void;
  onRefresh: () => void;
};

type AutonomyPlannerProps = {
  section: "autonomyPlanner";
  showDetails: boolean;
  isPaid: boolean;
  isProUX: boolean;
  directBrokerConnected: boolean;
  brokerPrefs: any;
  handsFreeFixNow: boolean;
  autopilotMode: string;
  hasHoldings: boolean;
  starterPack: any[];
  starterPackMeta: any;
  starterBudgetValue: number;
  starterPresetBudgets: number[];
  applyingStarter: boolean;
  starterUsesLiveQuotes: boolean;
  onToggleHandsFree: () => void;
  onSyncNow: () => void;
  onStarterBudgetChange: (value: number) => void;
  onRefreshAllocation: () => void;
  onApplyStarterPack: () => void;
};

type DirectiveProps = {
  section: "directive";
  showExtendedActionCards: boolean;
  directiveBlockedByStartHere: boolean;
  simpleGuide: SimpleGuide;
  directive: any;
  stalePricingLeak: boolean;
  riskFixPlan: any;
  directiveCandidates: string[];
  hasHoldings: boolean;
  starterPack: any[];
  starterPackMeta: any;
  onRunSimpleGuideAction: () => void;
  onRefreshPricing: () => void;
  onFixRiskNow: () => void;
};

export type TodayActionsProps =
  | BrokerScriptProps
  | ManualBrokerIntroProps
  | SimpleExecutionStepProps
  | OperationalActionProps
  | BeforeLeaveProps
  | SimpleFlowProps
  | ActionDockProps
  | ManualStatusProps
  | SuitabilityProps
  | ProfileIntakeProps
  | StartHereProps
  | QualityGateProps
  | ExecutionProtocolProps
  | AutonomyPlannerProps
  | DirectiveProps;

function renderBrokerScript(props: BrokerScriptProps) {
  if (props.directBrokerConnected || props.doneToday) return null;
  return (
    <Card
      title="Exact script to execute in your broker"
      subtitle="Use this sequence outside Syntrake so execution is explicit and safe."
      right={<Badge tone={props.manualExecutionPending ? "warn" : "neutral"}>{props.manualExecutionPending ? "In progress" : "Not started"}</Badge>}
    >
      <div className="space-y-3">
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
          You are executing manually in {props.manualBrokerProfile.label}. Follow only Syntrake checklist rows. Do not improvise extra trades.
        </div>
        <ol className="space-y-2 text-sm text-zinc-800">
          <li className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
            1. Click <span className="font-semibold">Generate manual checklist now</span>.
          </li>
          <li className="rounded-xl border border-zinc-200 bg-white px-3 py-2">2. Open {props.manualBrokerProfile.label} and place exactly those orders.</li>
          <li className="rounded-xl border border-zinc-200 bg-white px-3 py-2">3. Return here, mark rows done, add execution reference.</li>
          <li className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
            4. Click <span className="font-semibold">Save and continue</span>, then <span className="font-semibold">Close day</span>.
          </li>
        </ol>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={props.onExecuteClick}
            disabled={props.runningOperator}
            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {props.runningOperator ? "Preparing..." : props.manualExecutionPending ? "Resume checklist now" : "Generate manual checklist now"}
          </button>
          {props.manualBrokerProfile.url ? (
            <a
              href={props.manualBrokerProfile.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900"
            >
              Open {props.manualBrokerProfile.label}
            </a>
          ) : null}
          <button
            type="button"
            onClick={props.onCopyBrokerExecutionScript}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900"
          >
            Copy exact broker steps
          </button>
        </div>
      </div>
    </Card>
  );
}

function renderManualBrokerIntro(props: ManualBrokerIntroProps) {
  if (!props.directBrokerConnected) {
    return (
      <Card
        title="Manual broker mode (exact sequence)"
        subtitle="No direct broker bridge: execute in this order."
        right={<Badge tone="warn">Manual mode</Badge>}
      >
        <div className="space-y-3">
          <ol className="space-y-2">
            <li className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
              1. Click <span className="font-semibold">Generate manual checklist now</span>.
            </li>
            <li className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">2. Open your broker and place listed orders.</li>
            <li className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">3. Mark each order as done.</li>
            <li className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
              4. Click <span className="font-semibold">Save and continue</span>.
            </li>
            <li className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">5. Close the day.</li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={props.onExecuteClick}
              disabled={props.runningOperator}
              className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {props.runningOperator ? "Preparing..." : "Generate manual checklist now"}
            </button>
            {props.manualBrokerProfile.url ? (
              <a
                href={props.manualBrokerProfile.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900"
              >
                Open your broker
              </a>
            ) : null}
            <a href="/app?tab=autonomy&brokerSetup=1" className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900">
              Connect broker (optional)
            </a>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title="Execution path connected"
      subtitle="Direct bridge active: actions can be executed with less manual work."
      right={<Badge tone="good">Bridge ready</Badge>}
    >
      <div className="space-y-2">
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
          Your connected broker path is active. Syntrake can move faster from checklist to close-day discipline.
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/app?tab=autonomy&brokerSetup=1" className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900">
            Open broker setup
          </a>
        </div>
      </div>
    </Card>
  );
}

function renderSimpleExecutionStep(props: SimpleExecutionStepProps) {
  if (!props.simpleExecutionStepRequired) return null;
  return (
    <Card
      title="Execution step"
      subtitle={props.capitalActionCenterModel.allowExecution ? "Execute this in your broker now." : "Complete this unlock step first."}
      right={
        <Badge tone={props.capitalActionCenterModel.allowExecution ? "good" : "warn"}>
          {props.capitalActionCenterModel.allowExecution ? "Action required" : "Blocked"}
        </Badge>
      }
    >
      <div className="space-y-3">
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">Execution</div>
          <div className="mt-1 text-sm font-semibold text-zinc-900">
            {props.capitalActionCenterModel.allowExecution ? `Open ${props.manualBrokerProfile.label}` : "Resolve required step"}
          </div>
          <div className="mt-1 text-sm text-zinc-700">{props.simpleExecutionInstruction}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={props.onPrimaryAction}
            disabled={props.runningOperator}
            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {props.runningOperator
              ? "Preparing..."
              : props.cycleState.state === "pending"
                ? "Resume checklist"
                : props.capitalActionCenterModel.allowExecution
                  ? "Execute now"
                  : "Open required step"}
          </button>
          {props.manualBrokerProfile.url ? (
            <a
              href={props.manualBrokerProfile.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900"
            >
              Open {props.manualBrokerProfile.label}
            </a>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function renderOperationalAction(props: OperationalActionProps) {
  const actionTone =
    props.capitalActionCenterModel.actionLabel === "DEPLOY"
      ? "good"
      : props.capitalActionCenterModel.actionLabel === "PROTECT" || props.capitalActionCenterModel.actionLabel === "REDUCE"
        ? "warn"
        : props.capitalActionCenterModel.actionLabel === "DISCIPLINE"
          ? "good"
          : "neutral";

  return (
    <Card
      title="Today's Capital Order"
      subtitle="Current cycle status + one operational step for your broker."
      right={<Badge tone={actionTone}>{props.capitalActionCenterModel.actionLabel}</Badge>}
    >
      <div className="space-y-4">
        <div className="rounded-[24px] border border-slate-200 bg-white/92 px-4 py-4 shadow-[0_16px_36px_-28px_rgba(79,96,135,0.18)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Action type</div>
          <div className="mt-2 text-[28px] font-semibold tracking-tight text-slate-900">{props.capitalActionCenterModel.actionLabel}</div>
          <div className="mt-2 text-base leading-relaxed text-slate-700">
            {props.capitalActionCenterModel.isHoldLike ? (
              <span>
                <span className="font-semibold text-slate-900">Today&apos;s capital task:</span> {props.capitalActionCenterModel.brokerInstruction}
              </span>
            ) : (
              props.capitalActionCenterModel.brokerInstruction
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
            <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Cycle state</div>
            <div className="mt-2 text-sm font-semibold text-slate-900">{props.cycleState.label}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
            <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Checklist</div>
            <div className="mt-2 text-sm font-semibold text-slate-900">
              {props.manualExecutionPending
                ? `${props.manualExecutionPending.rows} pending row${props.manualExecutionPending.rows === 1 ? "" : "s"}`
                : props.manualExecutionConfirmed
                  ? "Confirmed today"
                  : "Not pending"}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
            <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Action gate</div>
            <div className="mt-2 text-sm font-semibold text-slate-900">{String(props.actionGate?.status || "ready").toUpperCase()}</div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4 text-sm leading-relaxed text-slate-700">
          <span className="font-semibold text-slate-900">Why this improves outcomes:</span> {props.capitalActionCenterModel.why}
        </div>

        <div className={clsx("space-y-3", props.nextBestMaskedByPaywall && "pointer-events-none select-none blur-[3px] opacity-70")}>
          {props.cycleState.state === "closed" ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
              Day is already closed. Safety step is complete for this cycle.
            </div>
          ) : props.cycleState.state === "pending" ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
              Manual checklist is pending. Resume execution checklist and save proof before close day.
            </div>
          ) : props.cycleState.state === "ready" ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
              {props.capitalActionCenterModel.deployLine}
            </div>
          ) : (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
              Capital protection active: complete this now in broker flow: {props.capitalActionCenterModel.safetyTask}
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Execution window</div>
              <div className="mt-2 text-sm text-slate-800">{props.capitalActionCenterModel.executionWindow}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Risk impact</div>
              <div className="mt-2 text-sm text-slate-800">{props.capitalActionCenterModel.riskImpact}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Confidence</div>
              <div className="mt-2 text-sm text-slate-800">{props.capitalActionCenterModel.confidence}/100</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={props.onPrimaryAction}
              disabled={props.runningOperator}
              className="rounded-2xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {props.runningOperator
                ? "Preparing..."
                : props.cycleState.state === "closed"
                  ? "Day closed (replay checklist)"
                  : props.cycleState.state === "pending"
                    ? "Resume manual checklist"
                    : props.cycleState.state === "ready"
                      ? "Execute in your broker"
                      : "Complete safety step now"}
            </button>
            {props.manualBrokerProfile.url ? (
              <a
                href={props.manualBrokerProfile.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900"
              >
                Open {props.manualBrokerProfile.label}
              </a>
            ) : null}
          </div>
        </div>
        {props.nextBestMaskedByPaywall ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
            Preview mode: action type and rationale remain visible. Exact sizing and execution detail unlock with Pro.
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function renderBeforeLeave(props: BeforeLeaveProps) {
  return (
    <Card
      title="Before you leave Syntrake"
      subtitle="Broker reality check before execution."
      right={<Badge tone={props.brokerRealityChecks.every((x) => x.ok) ? "good" : "warn"}>{props.brokerRealityChecks.filter((x) => x.ok).length}/{props.brokerRealityChecks.length}</Badge>}
    >
      <div className="space-y-3">
        {props.brokerRealityChecks.map((check, idx) => (
          <div key={`broker-check-${idx}`} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
            <div className="flex items-start gap-3">
              <span className={clsx("mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border text-xs font-semibold", check.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700")}>
                {check.ok ? "✓" : "!"}
              </span>
              <div>
                <div><span className="font-semibold text-slate-900">{check.label}</span></div>
                <div className="mt-1 text-sm text-slate-600">{check.detail}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function renderSimpleFlow(props: SimpleFlowProps) {
  return (
    <>
      <Card title="What to do right now" subtitle="Syntrake gives one actionable decision for today.">
        <div className="space-y-2 text-sm text-zinc-700">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">1. Read Today&apos;s Decision.</div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">2. Execute exactly in your broker using Syntrake checklist.</div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">3. Save proof and close day.</div>
        </div>
      </Card>
      {!props.doneToday ? (
        <Card title="Do this now" subtitle="One cycle only: Setup -> Execute -> Close day.">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <button
              type="button"
              onClick={props.onSetupClick}
              className={clsx(
                "rounded-xl px-3 py-3 text-left text-sm font-semibold",
                props.needsSetupAction ? "bg-amber-100 text-amber-900" : "border border-zinc-200 bg-white text-zinc-800"
              )}
            >
              1) Setup
              <div className="mt-1 text-xs font-medium">{props.needsSetupAction ? "Required now" : "Ready"}</div>
            </button>
            <button
              type="button"
              onClick={props.onExecuteClick}
              disabled={props.runningOperator}
              className={clsx(
                "rounded-xl px-3 py-3 text-left text-sm font-semibold",
                props.executeStepReady ? "bg-zinc-900 text-white" : "border border-zinc-200 bg-white text-zinc-700",
                props.runningOperator && "opacity-70"
              )}
            >
              2) {props.runningOperator ? "Executing..." : props.cycleState.state === "pending" ? "Resume execute" : "Execute"}
              <div className="mt-1 text-xs font-medium">
                {props.cycleState.state === "pending" ? "Resume checklist" : props.cycleState.state === "ready" ? "Run now" : props.cycleState.detail}
              </div>
            </button>
            <button
              type="button"
              onClick={props.onCloseClick}
              disabled={!props.canClose || props.markingDone}
              className={clsx(
                "rounded-xl px-3 py-3 text-left text-sm font-semibold",
                props.canClose ? "bg-emerald-100 text-emerald-900" : "border border-zinc-200 bg-white text-zinc-500",
                props.markingDone && "opacity-70"
              )}
            >
              3) {props.markingDone ? "Closing..." : props.closeDayLabel}
              <div className="mt-1 text-xs font-medium">
                {props.canClose
                  ? props.closeDayHint
                  : props.cycleState.state === "pending"
                    ? "Manual checklist pending"
                    : props.manualExecutionRequired && !props.manualExecutionProofReady
                      ? "Proof required before close"
                      : "Not ready yet"}
              </div>
            </button>
          </div>
          {props.openLeakCount > 0 ? (
            <div className="mt-2">
              <button
                type="button"
                onClick={props.onFixTopRisk}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-900"
              >
                Fix top risk leak ({props.openLeakCount})
              </button>
            </div>
          ) : null}
        </Card>
      ) : null}
    </>
  );
}

function renderActionDock(props: ActionDockProps) {
  if (props.firstDailyMinimalFlow || props.doneToday) return null;
  return (
    <Card title="Action Dock" subtitle="Tap and execute." right={<Badge tone={props.cycleState.tone as Tone}>{props.cycleState.label}</Badge>}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <button
          type="button"
          onClick={props.onSetupClick}
          className={clsx(
            "rounded-2xl px-4 py-4 text-left text-sm font-semibold shadow-[0_16px_34px_-28px_rgba(79,96,135,0.2)]",
            props.needsSetupAction ? "bg-amber-100 text-amber-900" : "border border-slate-200 bg-white text-slate-800"
          )}
        >
          Setup
          <div className="mt-1 text-xs font-medium">{props.needsSetupAction ? "Required now" : "Ready"}</div>
        </button>

        <button
          type="button"
          onClick={props.onExecuteClick}
          disabled={props.runningOperator}
          className={clsx(
            "rounded-2xl px-4 py-4 text-left text-sm font-semibold shadow-[0_16px_34px_-28px_rgba(79,96,135,0.2)]",
            props.executeStepReady ? "bg-zinc-900 text-white" : "border border-slate-200 bg-white text-slate-700",
            props.runningOperator && "opacity-70"
          )}
        >
          {props.runningOperator ? "Executing..." : props.cycleState.state === "pending" ? "Resume execute" : "Execute"}
          <div className="mt-1 text-xs font-medium">
            {props.cycleState.state === "pending" ? "Resume checklist" : props.cycleState.state === "ready" ? "Run now" : props.cycleState.detail}
          </div>
        </button>

        <button
          type="button"
          onClick={props.onFixClick}
          disabled={!props.canFixNow}
          className={clsx(
            "rounded-2xl px-4 py-4 text-left text-sm font-semibold shadow-[0_16px_34px_-28px_rgba(79,96,135,0.2)]",
            props.canFixNow ? "bg-rose-100 text-rose-900" : "border border-slate-200 bg-white text-slate-500"
          )}
        >
          Fix leaks
          <div className="mt-1 text-xs font-medium">
            {props.canFixNow ? `${props.openLeakCount} open` : props.starterWarmupEffective && props.openLeakCount > 0 ? "Warmup active" : "No leaks"}
          </div>
        </button>

        <button
          type="button"
          onClick={props.onCloseClick}
          disabled={!props.canClose || props.markingDone}
          className={clsx(
            "rounded-2xl px-4 py-4 text-left text-sm font-semibold shadow-[0_16px_34px_-28px_rgba(79,96,135,0.2)]",
            props.canClose ? "bg-emerald-100 text-emerald-900" : "border border-slate-200 bg-white text-slate-500",
            props.markingDone && "opacity-70",
            props.closeStepEmphasis && props.canClose && "ring-2 ring-emerald-400/80"
          )}
        >
          {props.markingDone ? "Closing..." : props.closeDayLabel}
          <div className="mt-1 text-xs font-medium">
            {props.canClose
              ? props.closeStepEmphasis
                ? "Next step now"
                : props.closeDayHint
              : props.cycleState.state === "pending"
                ? "Manual checklist pending"
                : props.manualExecutionRequired && !props.manualExecutionProofReady
                  ? "Proof required before close"
                  : "Not ready yet"}
          </div>
        </button>
      </div>
    </Card>
  );
}

function renderManualStatus(props: ManualStatusProps) {
  return (
    <>
      {props.fixAuditMeta && props.fixAuditRows.length > 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-zinc-900">FixNow report ready</div>
            <Badge tone={props.fixAuditMeta.resolved ? "good" : "warn"}>
              {props.fixAuditMeta.resolved ? "Resolved" : "Partial"} | {props.fixAuditMeta.appliedRows} updates
            </Badge>
          </div>
          <div className="mt-1 text-xs text-zinc-700">
            Leak: {props.fixAuditMeta.requestedLeakKey || "unknown"}
            {" -> "}
            {props.fixAuditMeta.finalLeakKey || "cleared"} | rounds: {props.fixAuditMeta.rounds}
          </div>
          <div className="mt-2">
            <button
              type="button"
              onClick={props.onOpenFixAudit}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-900"
            >
              Open fix report table
            </button>
          </div>
        </div>
      ) : null}

      {props.manualExecutionPending ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="text-sm font-semibold text-amber-900">Manual execution pending</div>
          <div className="mt-1 text-xs text-amber-900/90">
            Execute {props.manualExecutionPending.rows} broker action{props.manualExecutionPending.rows === 1 ? "" : "s"} and confirm checklist to unlock close day.
          </div>
          <div className="mt-1 text-[11px] text-amber-900/80">
            Quality gate: {props.manualExecutionGateMinQuality}/100
            {props.manualExecutionGateRequireReference ? " + execution reference." : "."}
          </div>
          {props.manualExecutionReminder ? (
            <div className="mt-1 text-[11px] text-amber-900/85">
              {props.manualExecutionReminder.status === "urgent"
                ? `Escalated reminder active (${Math.max(1, Math.floor(props.manualExecutionReminder.openMinutes / 60))}h open).`
                : props.manualExecutionReminder.status === "due"
                  ? "Reminder active: checklist still open after 2h."
                  : `Reminder scheduled in ${props.manualExecutionReminder.nextInMinutes} min if checklist stays open.`}{" "}
              Next check: {fmtTime(props.manualExecutionReminder.nextCheckAt)}.
            </div>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2">
            {props.manualFixRows.length > 0 ? (
              <button type="button" onClick={props.onOpenManualChecklist} className="rounded-xl bg-zinc-900 px-3 py-2 text-xs font-semibold text-white">
                Open manual checklist
              </button>
            ) : (
              <button type="button" onClick={props.onRunExecuteForMe} className="rounded-xl bg-zinc-900 px-3 py-2 text-xs font-semibold text-white">
                Regenerate checklist
              </button>
            )}
            <button
              type="button"
              onClick={props.onRefreshDaily}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-900"
            >
              Refresh daily
            </button>
          </div>
        </div>
      ) : props.manualExecutionProof ? (
        <div
          className={clsx(
            "rounded-2xl border px-4 py-3",
            props.manualExecutionConfirmed ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <div className={clsx("text-sm font-semibold", props.manualExecutionConfirmed ? "text-emerald-900" : "text-amber-900")}>
              {props.manualExecutionConfirmed ? "Manual execution confirmed" : "Manual execution proof captured (needs upgrade)"}
            </div>
            <Badge tone={props.manualExecutionProof.qualityScore >= 75 ? "good" : props.manualExecutionProof.qualityScore >= 60 ? "warn" : "neutral"}>
              Quality {props.manualExecutionProof.qualityScore}/100
            </Badge>
          </div>
          <div className={clsx("mt-1 text-xs", props.manualExecutionConfirmed ? "text-emerald-900/90" : "text-amber-900/90")}>
            {props.manualExecutionProof.broker} | {props.manualExecutionProof.completed}/{props.manualExecutionProof.total} orders confirmed at{" "}
            {fmtTime(props.manualExecutionProof.confirmedAt)}.
          </div>
          {!props.manualExecutionConfirmed ? (
            <div className="mt-1 text-[11px] text-amber-900/80">
              Required for close day: quality {props.manualExecutionGateMinQuality}/100
              {props.manualExecutionGateRequireReference ? " + execution reference." : "."}
            </div>
          ) : null}
          {props.manualExecutionProof.reference || props.manualExecutionProof.feesEur != null || props.manualExecutionProof.slippageBps != null ? (
            <div className={clsx("mt-2 flex flex-wrap gap-2 text-[11px]", props.manualExecutionConfirmed ? "text-emerald-900/90" : "text-amber-900/90")}>
              {props.manualExecutionProof.reference ? (
                <span className={clsx("rounded-full border bg-white/70 px-2 py-0.5", props.manualExecutionConfirmed ? "border-emerald-300" : "border-amber-300")}>
                  Ref: {props.manualExecutionProof.reference}
                </span>
              ) : null}
              {props.manualExecutionProof.feesEur != null ? (
                <span className={clsx("rounded-full border bg-white/70 px-2 py-0.5", props.manualExecutionConfirmed ? "border-emerald-300" : "border-amber-300")}>
                  Fees: {fmtEUR(props.manualExecutionProof.feesEur)}
                </span>
              ) : null}
              {props.manualExecutionProof.slippageBps != null ? (
                <span className={clsx("rounded-full border bg-white/70 px-2 py-0.5", props.manualExecutionConfirmed ? "border-emerald-300" : "border-amber-300")}>
                  Slippage: {props.manualExecutionProof.slippageBps} bps
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function renderSuitability(props: SuitabilityProps) {
  if (!props.suitability) return null;
  return (
    <Card
      title="Suitability gate"
      subtitle="Risk-profile alignment and target realism checks before scaling exposure."
      right={
        <Badge tone={props.suitability.status === "blocked" ? "bad" : props.suitability.status === "warn" ? "warn" : "good"}>
          {props.suitability.status.toUpperCase()} | {props.suitability.score}/100
        </Badge>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
            <div className="text-zinc-500">Risk profile</div>
            <div className="mt-1 text-sm font-semibold text-zinc-900">{props.suitability.profile.riskProfile || "Missing"}</div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
            <div className="text-zinc-500">Horizon</div>
            <div className="mt-1 text-sm font-semibold text-zinc-900">{props.suitability.profile.horizon || "Missing"}</div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
            <div className="text-zinc-500">Goal type</div>
            <div className="mt-1 text-sm font-semibold text-zinc-900">{props.suitability.profile.goalType || "Missing"}</div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
            <div className="text-zinc-500">Target</div>
            <div className="mt-1 text-sm font-semibold text-zinc-900">
              {props.suitability.profile.goalTargetValue != null ? fmtEUR(props.suitability.profile.goalTargetValue) : "Missing"}
            </div>
          </div>
        </div>
        {props.suitability.reasons.length > 0 ? (
          <div className="space-y-2">
            {props.suitability.reasons.slice(0, 3).map((r: string, idx: number) => (
              <div key={`suitability-reason-${idx}`} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700">
                {r}
              </div>
            ))}
          </div>
        ) : null}
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-800">
          <span className="font-semibold text-zinc-900">Next step:</span> {props.suitability.nextStep}
        </div>
        {props.suitability.status !== "pass" ? (
          <a href={`/app?tab=planning&welcomeSetup=1&mode=${props.autopilotMode}`} className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900">
            Update suitability profile
          </a>
        ) : null}
      </div>
    </Card>
  );
}

function renderProfileIntake(props: ProfileIntakeProps) {
  return (
    <Card
      title="Investor profile intake"
      subtitle="Add a few inputs so Syntrake can calibrate the plan around you."
      right={<Badge tone={props.profileIntake.complete ? "good" : "warn"}>{props.profileIntake.complete ? "Complete" : "Missing data"}</Badge>}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-zinc-500">Starting capital</div>
            <div className="mt-1 text-sm font-semibold text-zinc-900">
              {props.profileIntake.starting > 0 ? fmtEUR(props.profileIntake.starting) : "Missing"}
            </div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-zinc-500">Monthly contribution</div>
            <div className="mt-1 text-sm font-semibold text-zinc-900">
              {props.profileIntake.monthly >= 0 ? fmtEUR(props.profileIntake.monthly) : "Missing"}
            </div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-zinc-500">Target capital</div>
            <div className="mt-1 text-sm font-semibold text-zinc-900">
              {props.profileIntake.target > 0 ? fmtEUR(props.profileIntake.target) : "Missing"}
            </div>
          </div>
        </div>

        {!props.profileIntake.complete ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Add next: {props.profileIntake.missing.join(", ")}.
          </div>
        ) : (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">Profile complete. Syntrake can now tailor guidance more tightly.</div>
        )}

        <div className="flex flex-wrap gap-2">
          <a href={`/app?tab=planning&welcomeSetup=1&mode=${props.autopilotMode}`} className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white">
            {props.profileIntake.complete ? "Update profile inputs" : "Finish setup"}
          </a>
          <a href={`/app?tab=portfolio&mode=${props.autopilotMode}`} className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900">
            Open portfolio
          </a>
        </div>
      </div>
    </Card>
  );
}

function renderStartHere(props: StartHereProps) {
  if (props.firstDailyMinimalFlow || props.doneToday) return null;
  return (
    <Card title={props.title} subtitle={props.subtitle} right={<Badge tone={props.simpleGuide.tone}>Step {props.simpleGuide.step}/{props.simpleGuide.total}</Badge>}>
      <div className="space-y-3">
        <div className="text-lg font-semibold text-zinc-900">{props.simpleGuide.title}</div>
        <div className="text-sm text-zinc-700">{props.simpleGuide.detail}</div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={props.onRunSimpleGuideAction}
            className={clsx(
              "rounded-xl px-4 py-2 text-sm font-semibold text-white",
              props.simpleGuide.tone === "bad"
                ? "bg-rose-600 hover:bg-rose-700"
                : props.simpleGuide.tone === "good"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-zinc-900 hover:bg-black"
            )}
          >
            {props.simpleGuide.actionLabel}
          </button>
          <button
            type="button"
            onClick={props.onExecuteClick}
            disabled={props.runningOperator}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-60"
          >
            {props.runningOperator
              ? "Executing..."
              : props.manualExecutionPending
                ? "Resume manual checklist"
                : props.directBrokerConnected
                  ? "Execute automatically"
                  : "Prepare manual broker checklist"}
          </button>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
          <span className="font-semibold text-zinc-900">Execution mode:</span>{" "}
          {props.directBrokerConnected ? "Direct broker sync available." : "Manual checklist mode (any broker without direct bridge)."}
        </div>
        {props.advancedModeEnabled ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={props.onToggleAdvancedToday}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900"
            >
              {props.showAdvancedToday ? "Hide advanced cards" : "Show advanced cards"}
            </button>
            <div className="text-[11px] text-zinc-500">Keep Today focused. Open advanced diagnostics only when needed.</div>
          </div>
        ) : null}
        {props.operatorLog.length > 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-600">Execution log</div>
            <div className="mt-2 space-y-1.5">
              {props.operatorLog.slice(-6).map((row, idx) => (
                <div key={`${row.step}-${idx}`} className="text-xs text-zinc-700">
                  <span className="font-semibold text-zinc-900">{row.step}</span>
                  <span className="mx-1">|</span>
                  <span className={row.status === "ok" ? "text-emerald-700" : row.status === "warn" ? "text-amber-700" : "text-rose-700"}>
                    {row.status.toUpperCase()}
                  </span>
                  <span className="mx-1">|</span>
                  <span>{row.detail}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function renderQualityGate(props: QualityGateProps) {
  if (!props.showExtendedActionCards) return null;
  return (
    <>
      {props.actionGate ? (
        <Card
          title="Action quality gate"
          subtitle="Execution only when signal quality is safe enough."
          right={
            <Badge tone={props.actionGate.status === "ready" ? "good" : props.actionGate.status === "blocked" ? "bad" : "warn"}>
              {String(props.actionGate.status).toUpperCase()} | {props.actionGate.confidencePct}%
            </Badge>
          }
        >
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-zinc-500">Execution</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900">{props.actionGate.allowExecution ? "Allowed" : "Blocked"}</div>
                <div className="text-xs text-zinc-600">Status: {String(props.actionGate.status).toUpperCase()}</div>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-zinc-500">Pressure</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900">{props.actionGate.pressureScore}/100</div>
                <div className="text-xs text-zinc-600">High pressure reduces decision quality.</div>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-zinc-500">Coverage</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900">{props.actionGate.coveragePct}%</div>
                <div className="text-xs text-zinc-600">Pricing coverage for current holdings.</div>
              </div>
            </div>

            {props.actionGate.reasons.length > 0 ? (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Reasons</div>
                <div className="mt-1 space-y-1 text-sm text-zinc-800">
                  {props.actionGate.reasons.slice(0, 3).map((r: string, idx: number) => (
                    <div key={`gate-reason-${idx}`}>- {r}</div>
                  ))}
                </div>
              </div>
            ) : null}

            {props.whyNow ? (
              <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Why now</div>
                <div className="mt-1 text-sm text-zinc-800">{props.whyNow.rationale}</div>
                {props.whyNow.evidence.length > 0 ? (
                  <div className="mt-2 space-y-1 text-xs text-zinc-700">
                    {props.whyNow.evidence.slice(0, 4).map((e: string, idx: number) => (
                      <div key={`why-now-${idx}`}>- {e}</div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {!props.actionGate.allowExecution ? (
                <a href={props.actionGate.ctaHref} className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white">
                  {props.actionGate.ctaLabel}
                </a>
              ) : null}
              <button
                type="button"
                onClick={props.onRefresh}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900"
              >
                Refresh gate
              </button>
            </div>
          </div>
        </Card>
      ) : null}
      {props.actionGateAlert ? (
        <Card
          title="Gate alert monitor"
          subtitle="Streak-based warning when quality stays blocked."
          right={<Badge tone={props.gateAlertTone}>{props.actionGateAlert.triggered ? "Triggered" : "Stable"}</Badge>}
        >
          <div className="space-y-3">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">{props.actionGateAlert.message}</div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-zinc-500">Blocked streak</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900">{props.actionGateAlert.blockedStreakDays} day(s)</div>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-zinc-500">Blocked (7d)</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900">{props.actionGateAlert.blockedDays7}</div>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-zinc-500">Caution (7d)</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900">{props.actionGateAlert.cautionDays7}</div>
              </div>
            </div>
            <div className="text-xs text-zinc-700">{props.actionGateAlert.nextStep}</div>
            {props.actionGateAlert.triggered && props.actionGate ? (
              <div className="flex flex-wrap gap-2">
                <a href={props.actionGate.ctaHref} className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white">
                  {props.actionGate.ctaLabel}
                </a>
                <button
                  type="button"
                  onClick={props.onRefresh}
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900"
                >
                  Refresh status
                </button>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}
    </>
  );
}

function renderExecutionProtocol(props: ExecutionProtocolProps) {
  if (!props.showExtendedActionCards) return null;
  return (
    <Card
      title="Execution protocol for your profile"
      subtitle="Use these rules today."
      right={
        <Badge tone={props.profileProtocol.executionAllowed ? "good" : "warn"}>
          {props.profileProtocol.profileLabel} | max {props.profileProtocol.maxActions} order{props.profileProtocol.maxActions === 1 ? "" : "s"}
        </Badge>
      }
    >
      <div className="space-y-3">
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">{props.profileProtocol.cadence}</div>

        <ol className="space-y-2">
          {props.profileProtocol.checklist.map((row: string, idx: number) => (
            <li key={`protocol-${idx}`} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800">
              <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900 text-[11px] font-semibold text-white">
                {idx + 1}
              </span>
              {row}
            </li>
          ))}
        </ol>

        {!props.canRunExecute && props.executionBlockedReason ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">Execution blocked: {props.executionBlockedReason}</div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={props.onExecuteClick}
            disabled={props.runningOperator}
            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {props.runningOperator ? "Preparing..." : props.directBrokerConnected ? "Run protocol now" : "Generate manual checklist now"}
          </button>
          <button
            type="button"
            onClick={props.onRefresh}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900"
          >
            Refresh protocol
          </button>
          <a href={`/app?tab=planning&mode=${props.autopilotMode}`} className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900">
            Review risk limits
          </a>
        </div>
      </div>
    </Card>
  );
}

function renderAutonomyPlanner(props: AutonomyPlannerProps) {
  if (!props.showDetails) return null;
  return (
    <>
      {props.isPaid && props.isProUX ? (
        <Card
          title="Pro autonomy"
          subtitle="Reduce manual work with broker auto-sync and hands-free fixing."
          right={<Badge tone={props.directBrokerConnected ? "good" : "warn"}>{props.directBrokerConnected ? "Direct bridge connected" : "Manual/indirect broker mode"}</Badge>}
        >
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Chip tone={props.brokerPrefs?.autoSync ? "good" : "warn"}>
                Auto-sync: {props.brokerPrefs?.autoSync ? `ON (${Math.max(5, Number(props.brokerPrefs?.syncEveryMinutes || 15))}m)` : "OFF"}
              </Chip>
              <Chip tone={props.handsFreeFixNow ? "good" : "warn"}>Hands-free FixNow: {props.handsFreeFixNow ? "ON" : "OFF"}</Chip>
              <Chip tone={props.brokerPrefs?.readOnly === false ? "warn" : "good"}>
                Mode: {props.brokerPrefs?.readOnly === false ? "Execution-enabled" : "Read-only"}
              </Chip>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={props.onToggleHandsFree} className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white">
                {props.handsFreeFixNow ? "Disable hands-free fixes" : "Enable hands-free fixes"}
              </button>
              <a href={`/app?tab=autonomy&mode=${props.autopilotMode}&brokerSetup=1`} className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900">
                Open broker setup
              </a>
              <a href={`/app?tab=autonomy&mode=${props.autopilotMode}`} className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900">
                Open autonomy center
              </a>
              <button type="button" onClick={props.onSyncNow} className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900">
                Sync now
              </button>
            </div>
          </div>
        </Card>
      ) : null}

      {!props.hasHoldings && props.starterPack.length > 0 ? (
        <Card
          title="Starter capital planner"
          subtitle="Set your initial capital and recalculate holdings with mode-aware live quotes."
          right={
            <Badge tone={props.starterPackMeta?.source === "market_quotes" ? "good" : "warn"}>
              {props.starterPackMeta?.source === "market_quotes" ? "Live quotes" : "Static fallback"}
            </Badge>
          }
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <div className="text-xs text-zinc-500">Selected budget</div>
                <div className="text-2xl font-semibold text-zinc-900">{fmtEUR(props.starterBudgetValue)}</div>
              </div>
              <div className="text-xs text-zinc-500">
                Mode: <span className="font-semibold text-zinc-900">{props.autopilotMode}</span>
              </div>
            </div>

            <input
              type="range"
              min={500}
              max={50000}
              step={250}
              value={props.starterBudgetValue}
              onChange={(e) => props.onStarterBudgetChange(Number(e.target.value))}
              className="w-full accent-zinc-900"
            />

            <div className="flex flex-wrap gap-2">
              {props.starterPresetBudgets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => props.onStarterBudgetChange(preset)}
                  className={clsx(
                    "rounded-xl border px-3 py-1.5 text-xs font-semibold",
                    props.starterBudgetValue === preset ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-900"
                  )}
                >
                  {fmtEUR(preset)}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={props.onRefreshAllocation}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900"
              >
                Refresh allocation
              </button>
              <button
                type="button"
                onClick={props.onApplyStarterPack}
                disabled={props.applyingStarter}
                className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {props.applyingStarter ? "Applying..." : "Apply this starter pack"}
              </button>
            </div>

            <div className="text-xs text-zinc-500">
              Allocation source: {props.starterPackMeta?.source || "unknown"}.
              {Number.isFinite(Number(props.starterPackMeta?.budgetEur)) ? ` Current generated budget: ${fmtEUR(Number(props.starterPackMeta?.budgetEur))}.` : ""}
            </div>
            {!props.starterUsesLiveQuotes ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="text-xs font-semibold text-amber-900">Starter currently in provisional mode (still executable).</div>
                <div className="mt-2 overflow-x-auto">
                  <table className="min-w-full text-xs text-zinc-800">
                    <thead>
                      <tr className="text-left text-zinc-600">
                        <th className="pr-3 pb-1 font-semibold">Check</th>
                        <th className="pr-3 pb-1 font-semibold">Status</th>
                        <th className="pb-1 font-semibold">What it means</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-amber-200/70">
                        <td className="pr-3 py-1">Live quotes coverage</td>
                        <td className="pr-3 py-1 font-semibold text-amber-900">Limited</td>
                        <td className="py-1">Syntrake used the safe fallback allocation so you can start now.</td>
                      </tr>
                      <tr className="border-t border-amber-200/70">
                        <td className="pr-3 py-1">Execution availability</td>
                        <td className="pr-3 py-1 font-semibold text-emerald-700">Enabled</td>
                        <td className="py-1">Apply Starter Pack still works and creates your first portfolio.</td>
                      </tr>
                      <tr className="border-t border-amber-200/70">
                        <td className="pr-3 py-1">Next step</td>
                        <td className="pr-3 py-1 font-semibold text-zinc-900">Re-check in Daily</td>
                        <td className="py-1">After applying, refresh Daily to upgrade decisions with stronger market coverage.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}
    </>
  );
}

function renderDirective(props: DirectiveProps) {
  if (!props.showExtendedActionCards) return null;
  return (
    <Card
      title="Action directive"
      subtitle={props.directiveBlockedByStartHere ? "This unlocks after the Start here step is completed." : "What to do now: buy, sell, or hold (rule-based)."}
    >
      <div className="space-y-3">
        {props.directiveBlockedByStartHere ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="warn">Blocked by Start here</Badge>
              <div className="text-sm font-semibold text-amber-900">Complete Step {props.simpleGuide.step} first</div>
            </div>
            <div className="mt-2 text-sm text-amber-900/90">{props.simpleGuide.title}</div>
            <div className="mt-3">
              <button
                type="button"
                onClick={props.onRunSimpleGuideAction}
                className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white"
              >
                {props.simpleGuide.actionLabel}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={props.directive.action === "BUY" ? "good" : props.directive.action === "SELL" ? "bad" : "warn"}>{props.directive.action}</Badge>
              <div className="text-sm font-semibold text-zinc-900">{props.directive.headline}</div>
              <Chip tone={props.directive.confidence >= 80 ? "good" : props.directive.confidence >= 65 ? "warn" : "bad"}>
                Confidence: {props.directive.confidence}
              </Chip>
              <Chip tone={props.directive.executionTempo === "defensive" ? "warn" : props.directive.executionTempo === "normal" ? "good" : "good"}>
                Tempo: {props.directive.executionTempo}
              </Chip>
            </div>
            <div className="text-sm text-zinc-700">{props.directive.rationale}</div>

            {props.stalePricingLeak ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                <div className="text-sm font-semibold text-amber-900">Pricing feed delayed</div>
                <div className="mt-1 text-xs text-amber-900/90">
                  This is a data freshness warning, not a blocking risk leak. You can refresh and continue.
                </div>
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={props.onRefreshPricing}
                    className="inline-flex items-center justify-center rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900"
                  >
                    Refresh pricing
                  </button>
                </div>
              </div>
            ) : null}

            {props.riskFixPlan ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={props.onFixRiskNow}
                  className={clsx(
                    "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold text-white",
                    props.directive.action === "SELL" ? "bg-rose-600 hover:bg-rose-700" : "bg-amber-600 hover:bg-amber-700"
                  )}
                >
                  Fix risk now
                </button>
                {props.riskFixPlan?.primaryCtaHref ? (
                  <a
                    href={props.riskFixPlan.primaryCtaHref}
                    className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900"
                  >
                    {props.riskFixPlan.primaryCtaLabel}
                  </a>
                ) : null}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
                <div className="text-xs text-zinc-500">Max new risk</div>
                <div className="mt-1 text-lg font-semibold text-zinc-900">{props.directive.maxNewRiskPct}%</div>
              </div>
              <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
                <div className="text-xs text-zinc-500">Max single position</div>
                <div className="mt-1 text-lg font-semibold text-zinc-900">{props.directive.maxSinglePositionPct}%</div>
              </div>
              <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
                <div className="text-xs text-zinc-500">Execution rule</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900">{props.directive.stopLossHint}</div>
              </div>
            </div>

            {props.directive.action === "BUY" && props.directiveCandidates.length > 0 ? (
              <div className="rounded-2xl border border-zinc-100 bg-white p-4">
                <div className="text-xs font-semibold text-zinc-500">Candidate symbols</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {props.directiveCandidates.map((s) => (
                    <Chip key={s} tone="good">
                      {s}
                    </Chip>
                  ))}
                </div>
              </div>
            ) : null}

            {!props.hasHoldings && props.starterPack.length > 0 ? (
              <div className="rounded-2xl border border-zinc-100 bg-white p-4">
                <div className="text-xs font-semibold text-zinc-500">
                  Starter allocation (mode-aware)
                  {props.starterPackMeta?.source === "market_quotes" ? " - live quotes" : ""}
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                  {props.starterPack.slice(0, 8).map((x: any, i: number) => (
                    <div key={`${x?.symbol || i}`} className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2">
                      <div className="text-sm font-semibold text-zinc-900">{String(x?.symbol || "").toUpperCase()}</div>
                      <div className="text-xs text-zinc-600">{x?.name || "-"}</div>
                      <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
                        {typeof x?.value_eur === "number" || typeof x?.valueEur === "number" ? (
                          <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 font-semibold text-zinc-700">
                            {fmtEUR(Number(x?.value_eur ?? x?.valueEur ?? 0))}
                          </span>
                        ) : null}
                        {typeof x?.qty === "number" ? (
                          <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 font-semibold text-zinc-700">
                            Qty {Number(x.qty).toFixed(4)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </Card>
  );
}

export default function TodayActions(props: TodayActionsProps) {
  switch (props.section) {
    case "brokerScript":
      return renderBrokerScript(props);
    case "manualBrokerIntro":
      return renderManualBrokerIntro(props);
    case "simpleExecutionStep":
      return renderSimpleExecutionStep(props);
    case "operationalAction":
      return renderOperationalAction(props);
    case "beforeLeave":
      return renderBeforeLeave(props);
    case "simpleFlow":
      return renderSimpleFlow(props);
    case "actionDock":
      return renderActionDock(props);
    case "manualStatus":
      return renderManualStatus(props);
    case "suitability":
      return renderSuitability(props);
    case "profileIntake":
      return renderProfileIntake(props);
    case "startHere":
      return renderStartHere(props);
    case "qualityGate":
      return renderQualityGate(props);
    case "executionProtocol":
      return renderExecutionProtocol(props);
    case "autonomyPlanner":
      return renderAutonomyPlanner(props);
    case "directive":
      return renderDirective(props);
    default:
      return null;
  }
}
