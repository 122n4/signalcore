"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";

import PremiumAsyncStateCard, {
  buildSnapshotFootnote,
} from "@/components/PremiumAsyncStateCard";
import TradingWorkspaceContinuityCard from "@/components/trading/TradingWorkspaceContinuityCard";
import {
  resolveTradingActionGuidance,
  type TradingWatchlistEntry,
} from "@/lib/trading/state";
import {
  compactPrice,
  executionStatusTone,
  formatExecutionStatus,
  formatTradingState,
  toneClasses,
  useTradingWorkspace,
} from "./tradingWorkspace";

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-700 bg-[#0f1a2d] px-2.5 py-1 text-[11px] text-slate-300">
      {children}
    </span>
  );
}

type ProofSubmitState =
  | { kind: "idle"; message?: string }
  | { kind: "saving"; message?: string }
  | { kind: "saved"; message: string }
  | { kind: "error"; message: string };

function parseOptionalNumber(value: string) {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatRiskPct(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)}%` : "-";
}

function resolveOrderAction(direction: TradingWatchlistEntry["liveDecision"]["direction"]) {
  if (direction === "short") return "SELL";
  if (direction === "long") return "BUY";
  return "MANUAL";
}

function resolveBrokerReadiness(entry: TradingWatchlistEntry, snapshotBlocked?: boolean) {
  const actionGuidance = resolveTradingActionGuidance(entry);
  const liveDecision = entry.liveDecision;
  const execution = entry.workspace.execution;
  const triggerLevel = liveDecision.triggerLevel ?? execution.entryZone.triggerLevel ?? null;
  const invalidationLevel =
    liveDecision.invalidationLevel ?? execution.invalidation.invalidationLevel ?? null;
  const riskPct = liveDecision.riskPct ?? execution.riskFraming.riskPct ?? null;
  const entryZoneLow = liveDecision.entryZoneLow ?? execution.entryZone.entryZoneLow ?? null;
  const entryZoneHigh = liveDecision.entryZoneHigh ?? execution.entryZone.entryZoneHigh ?? null;
  const blockers: string[] = [];

  if (snapshotBlocked) {
    blockers.push("Live snapshot is stale. Refresh before any broker action.");
  }
  if (!entry.contextSummary.marketOpen) {
    blockers.push("Market is not open for this instrument.");
  }
  if (actionGuidance.intent !== "execute_now") {
    blockers.push(`Current instruction is ${actionGuidance.label}, not Execute now.`);
  }
  if (liveDecision.executionStatus !== "allowed") {
    blockers.push(`Execution gate is ${formatExecutionStatus(liveDecision.executionStatus)}.`);
  }
  if (triggerLevel == null) {
    blockers.push("Trigger level is missing.");
  }
  if (invalidationLevel == null) {
    blockers.push("Invalidation level is missing.");
  }
  if (!(typeof riskPct === "number" && Number.isFinite(riskPct) && riskPct > 0)) {
    blockers.push("Risk per trade is missing.");
  }

  const canExecute = blockers.length === 0;
  const canPrepare =
    !snapshotBlocked &&
    entry.contextSummary.marketOpen &&
    (actionGuidance.intent === "execute_now" || actionGuidance.intent === "prepare_now");

  return {
    actionGuidance,
    triggerLevel,
    invalidationLevel,
    riskPct,
    entryZoneLow,
    entryZoneHigh,
    canExecute,
    canPrepare,
    blockers,
    headline: canExecute
      ? "Broker-ready. Execute only this plan."
      : snapshotBlocked
        ? "Refresh first. Broker action is locked."
        : canPrepare
          ? "Prepare the ticket, but do not submit yet."
          : "Do not place an order now.",
    body: canExecute
      ? "Open your broker manually, place only the planned order, then return here to save proof."
      : canPrepare
        ? "Use this screen to prepare the order details. Submission stays blocked until the trigger, risk, and execution gate align."
        : "This state is an explicit no-trade instruction. The product is doing its job when it keeps capital out of weak conditions.",
  };
}

function buildBrokerPlanText(entry: TradingWatchlistEntry) {
  const readiness = resolveBrokerReadiness(entry, false);
  const direction = entry.liveDecision.direction ?? "neutral";
  return [
    `Syntrake broker plan - ${entry.instrument}`,
    `Decision: ${readiness.actionGuidance.label}`,
    `State: ${formatTradingState(entry.currentState)}`,
    `Execution gate: ${formatExecutionStatus(entry.executionStatus)}`,
    `Direction: ${direction}`,
    `Trigger: ${compactPrice(readiness.triggerLevel)}`,
    `Entry zone: ${compactPrice(readiness.entryZoneLow)} - ${compactPrice(readiness.entryZoneHigh)}`,
    `Invalidation: ${compactPrice(readiness.invalidationLevel)}`,
    `Risk per trade: ${formatRiskPct(readiness.riskPct)}`,
    `Target: ${entry.liveDecision.targetZone || entry.workspace.execution.tradePath.targetZone || "-"}`,
    `Rule: execute only if the live snapshot is fresh and the broker price still matches the trigger/invalidation plan.`,
  ].join("\n");
}

function stepToneClasses(state: "done" | "active" | "locked") {
  if (state === "done") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-100";
  if (state === "active") return "border-sky-500/25 bg-sky-500/10 text-sky-100";
  return "border-slate-800 bg-[#101b30] text-slate-300";
}

function BrokerRunwayStep({
  index,
  title,
  body,
  state,
}: {
  index: string;
  title: string;
  body: string;
  state: "done" | "active" | "locked";
}) {
  return (
    <div className={`rounded-2xl border p-4 ${stepToneClasses(state)}`}>
      <div className="flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-current/25 text-xs font-semibold">
          {index}
        </span>
        <div className="text-sm font-semibold text-white">{title}</div>
      </div>
      <div className="mt-3 text-sm leading-6 text-slate-300">{body}</div>
    </div>
  );
}

function ManualBrokerRunway({
  entry,
  snapshotBlocked,
  snapshotFootnote,
  isRefreshing,
  onRefresh,
}: {
  entry: TradingWatchlistEntry;
  snapshotBlocked?: boolean;
  snapshotFootnote?: string | null;
  isRefreshing?: boolean;
  onRefresh: () => void;
}) {
  const readiness = React.useMemo(
    () => resolveBrokerReadiness(entry, snapshotBlocked),
    [entry, snapshotBlocked],
  );
  const [broker, setBroker] = React.useState("manual broker");
  const [reference, setReference] = React.useState("");
  const [filledPrice, setFilledPrice] = React.useState("");
  const [filledQty, setFilledQty] = React.useState("");
  const [feesEur, setFeesEur] = React.useState("");
  const [slippageBps, setSlippageBps] = React.useState("");
  const [note, setNote] = React.useState("");
  const [copyState, setCopyState] = React.useState<"idle" | "copied" | "error">("idle");
  const [submitState, setSubmitState] = React.useState<ProofSubmitState>({ kind: "idle" });

  React.useEffect(() => {
    setReference("");
    setFilledPrice("");
    setFilledQty("");
    setFeesEur("");
    setSlippageBps("");
    setNote("");
    setCopyState("idle");
    setSubmitState({ kind: "idle" });
  }, [entry.instrument]);

  const proofReady =
    readiness.canExecute &&
    broker.trim().length >= 2 &&
    reference.trim().length >= 4 &&
    submitState.kind !== "saving";
  const ticketAction = readiness.canExecute
    ? resolveOrderAction(entry.liveDecision.direction)
    : readiness.canPrepare
      ? `DRAFT ${resolveOrderAction(entry.liveDecision.direction)}`
      : "LOCKED";

  async function copyPlan() {
    try {
      await navigator.clipboard.writeText(buildBrokerPlanText(entry));
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      setCopyState("error");
      window.setTimeout(() => setCopyState("idle"), 2200);
    }
  }

  async function submitProof() {
    if (!proofReady) return;

    setSubmitState({ kind: "saving", message: "Saving broker proof..." });
    const filledPriceValue = parseOptionalNumber(filledPrice);
    const filledQtyValue = parseOptionalNumber(filledQty);
    const orderNotionalEur =
      filledPriceValue != null && filledQtyValue != null
        ? Math.round(Math.abs(filledPriceValue * filledQtyValue) * 100) / 100
        : null;
    const resolvedNote =
      note.trim() ||
      `${readiness.actionGuidance.label} on ${entry.instrument}; manual broker reference captured after execution.`;

    try {
      const response = await fetch("/api/execution/proofs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "trading",
          proof: {
            broker: broker.trim() || "manual broker",
            completed: 1,
            total: 1,
            note: resolvedNote,
            reference: reference.trim(),
            feesEur: parseOptionalNumber(feesEur),
            slippageBps: parseOptionalNumber(slippageBps),
            source: "trading_broker_runway",
            orders: [
              {
                symbol: entry.instrument,
                action: resolveOrderAction(entry.liveDecision.direction),
                targetValueEur: null,
                qtyTarget: null,
                referencePrice: readiness.triggerLevel,
                limitPrice: readiness.entryZoneHigh ?? readiness.triggerLevel,
                stopLossPrice: readiness.invalidationLevel,
                orderNotionalEur,
                filledPrice: filledPriceValue,
                filledQty: filledQtyValue,
                brokerOrderId: reference.trim(),
                executedAt: new Date().toISOString(),
                reason: readiness.actionGuidance.summary,
              },
            ],
          },
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Execution proof could not be saved.");
      }

      setSubmitState({
        kind: "saved",
        message: payload.acceptedForCloseDay
          ? "Proof saved and accepted for close-day discipline."
          : "Proof saved. Check the journal if close-day still requires more detail.",
      });
      void onRefresh();
    } catch (err: any) {
      setSubmitState({
        kind: "error",
        message: err?.message || "Execution proof could not be saved.",
      });
    }
  }

  const statusClasses = readiness.canExecute
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
    : snapshotBlocked
      ? "border-rose-500/30 bg-rose-500/10 text-rose-100"
      : readiness.canPrepare
        ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
        : "border-slate-700 bg-[#0f1a2d] text-slate-300";

  return (
    <section className="rounded-[26px] border border-slate-800/80 bg-[radial-gradient(circle_at_top_left,rgba(79,140,255,0.18),transparent_34%),linear-gradient(180deg,rgba(13,24,43,0.98)_0%,rgba(7,15,28,0.98)_100%)] p-6 text-slate-100 shadow-[0_22px_70px_rgba(0,0,0,0.34)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-4xl">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-300/80">
            Manual broker runway
          </div>
          <div className="mt-2 text-3xl font-semibold tracking-tight text-white">
            {readiness.headline}
          </div>
          <div className="mt-3 text-sm leading-6 text-slate-300">{readiness.body}</div>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${statusClasses}`}>
          {readiness.canExecute ? "Broker-ready" : readiness.canPrepare ? "Prepare only" : "No trade"}
        </span>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        <BrokerRunwayStep
          index="1"
          title="Read Syntrake"
          body={`${readiness.actionGuidance.label}: ${readiness.actionGuidance.headline}`}
          state="done"
        />
        <BrokerRunwayStep
          index="2"
          title="Open broker"
          body={
            readiness.canExecute
              ? "Open your broker manually and place only the planned order. Do not improvise size, stop, or direction."
              : "Keep broker submission locked. Preparing a draft ticket is acceptable only if you do not send the order."
          }
          state={readiness.canExecute ? "active" : "locked"}
        />
        <BrokerRunwayStep
          index="3"
          title="Return and confirm"
          body={
            readiness.canExecute
              ? "After the broker confirms the fill, save broker reference, price, quantity, fees, and slippage here."
              : "No execution proof is required until an order is actually allowed and placed."
          }
          state={readiness.canExecute ? "active" : "locked"}
        />
      </div>

      {readiness.blockers.length > 0 ? (
        <div className="mt-5 rounded-2xl border border-slate-800 bg-[#08111f] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Broker lock reasons
          </div>
          <div className="mt-3 grid gap-2 text-sm text-slate-300 md:grid-cols-2">
            {readiness.blockers.map((blocker) => (
              <div key={blocker} className="rounded-xl border border-slate-800 bg-[#101b30] px-3 py-2">
                {blocker}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[22px] border border-slate-800 bg-[#0d1628] p-5">
          <div className="text-sm font-semibold text-white">Broker ticket snapshot</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-800 bg-[#101b30] p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Action</div>
              <div className="mt-2 text-sm font-semibold text-white">{ticketAction}</div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-[#101b30] p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Trigger</div>
              <div className="mt-2 text-sm font-semibold text-white">{compactPrice(readiness.triggerLevel)}</div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-[#101b30] p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Entry zone</div>
              <div className="mt-2 text-sm font-semibold text-white">
                {compactPrice(readiness.entryZoneLow)} - {compactPrice(readiness.entryZoneHigh)}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-[#101b30] p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Invalidation</div>
              <div className="mt-2 text-sm font-semibold text-white">{compactPrice(readiness.invalidationLevel)}</div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-[#101b30] p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Risk per trade</div>
              <div className="mt-2 text-sm font-semibold text-white">{formatRiskPct(readiness.riskPct)}</div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-[#101b30] p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Target</div>
              <div className="mt-2 text-sm font-semibold text-white">
                {entry.liveDecision.targetZone || entry.workspace.execution.tradePath.targetZone || "-"}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void copyPlan()}
              className="rounded-xl border border-slate-700 bg-[#12203a] px-4 py-2 text-sm font-semibold text-white transition hover:border-slate-600"
            >
              {copyState === "copied" ? "Plan copied" : copyState === "error" ? "Copy failed" : "Copy broker plan"}
            </button>
            <button
              type="button"
              onClick={() => void onRefresh()}
              disabled={isRefreshing}
              className="rounded-xl border border-slate-700 bg-[#0f1a2d] px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-600 disabled:opacity-50"
            >
              {isRefreshing ? "Refreshing..." : "Refresh live snapshot"}
            </button>
          </div>

          {snapshotFootnote ? (
            <div className="mt-4 rounded-2xl border border-slate-800 bg-[#08111f] px-4 py-3 text-xs text-slate-400">
              {snapshotFootnote}
            </div>
          ) : null}
        </div>

        <div className="rounded-[22px] border border-slate-800 bg-[#0d1628] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">Save broker proof</div>
              <div className="mt-1 text-xs text-slate-400">
                Required after a real fill. This creates an audit trail for journal, risk, and close-day discipline.
              </div>
            </div>
            <span className="rounded-full border border-slate-700 bg-[#0f1a2d] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
              Manual proof
            </span>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Broker
              <input
                value={broker}
                onChange={(event) => setBroker(event.target.value)}
                disabled={!readiness.canExecute}
                placeholder="eToro / IBKR / Binance..."
                className="mt-2 w-full rounded-xl border border-slate-700 bg-[#101b30] px-3 py-2 text-sm normal-case tracking-normal text-white outline-none transition focus:border-sky-500 disabled:opacity-55"
              />
            </label>
            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Broker reference
              <input
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                disabled={!readiness.canExecute}
                placeholder="ticket / order id"
                className="mt-2 w-full rounded-xl border border-slate-700 bg-[#101b30] px-3 py-2 text-sm normal-case tracking-normal text-white outline-none transition focus:border-sky-500 disabled:opacity-55"
              />
            </label>
            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Filled price
              <input
                value={filledPrice}
                onChange={(event) => setFilledPrice(event.target.value)}
                disabled={!readiness.canExecute}
                inputMode="decimal"
                placeholder="optional"
                className="mt-2 w-full rounded-xl border border-slate-700 bg-[#101b30] px-3 py-2 text-sm normal-case tracking-normal text-white outline-none transition focus:border-sky-500 disabled:opacity-55"
              />
            </label>
            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Filled qty
              <input
                value={filledQty}
                onChange={(event) => setFilledQty(event.target.value)}
                disabled={!readiness.canExecute}
                inputMode="decimal"
                placeholder="optional"
                className="mt-2 w-full rounded-xl border border-slate-700 bg-[#101b30] px-3 py-2 text-sm normal-case tracking-normal text-white outline-none transition focus:border-sky-500 disabled:opacity-55"
              />
            </label>
            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Fees EUR
              <input
                value={feesEur}
                onChange={(event) => setFeesEur(event.target.value)}
                disabled={!readiness.canExecute}
                inputMode="decimal"
                placeholder="optional"
                className="mt-2 w-full rounded-xl border border-slate-700 bg-[#101b30] px-3 py-2 text-sm normal-case tracking-normal text-white outline-none transition focus:border-sky-500 disabled:opacity-55"
              />
            </label>
            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Slippage bps
              <input
                value={slippageBps}
                onChange={(event) => setSlippageBps(event.target.value)}
                disabled={!readiness.canExecute}
                inputMode="decimal"
                placeholder="optional"
                className="mt-2 w-full rounded-xl border border-slate-700 bg-[#101b30] px-3 py-2 text-sm normal-case tracking-normal text-white outline-none transition focus:border-sky-500 disabled:opacity-55"
              />
            </label>
          </div>

          <label className="mt-3 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Execution note
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              disabled={!readiness.canExecute}
              rows={3}
              placeholder="What happened in broker? Any partial fill, spread, or execution issue?"
              className="mt-2 w-full rounded-xl border border-slate-700 bg-[#101b30] px-3 py-2 text-sm normal-case tracking-normal text-white outline-none transition focus:border-sky-500 disabled:opacity-55"
            />
          </label>

          <button
            type="button"
            onClick={() => void submitProof()}
            disabled={!proofReady}
            className="mt-4 w-full rounded-xl border border-emerald-400/40 bg-emerald-400/15 px-4 py-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/20 disabled:border-slate-700 disabled:bg-[#101b30] disabled:text-slate-500"
          >
            {submitState.kind === "saving" ? "Saving proof..." : "Save proof and sync journal"}
          </button>

          {!readiness.canExecute ? (
            <div className="mt-3 rounded-xl border border-slate-800 bg-[#08111f] px-3 py-2 text-xs text-slate-400">
              Proof is locked until Syntrake says Execute now with a fresh snapshot, trigger, invalidation, and risk.
            </div>
          ) : reference.trim().length < 4 ? (
            <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              Add the broker order reference before saving proof.
            </div>
          ) : null}

          {submitState.kind === "saved" || submitState.kind === "error" ? (
            <div
              className={`mt-3 rounded-xl border px-3 py-2 text-xs ${
                submitState.kind === "saved"
                  ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-100"
                  : "border-rose-500/25 bg-rose-500/10 text-rose-100"
              }`}
            >
              {submitState.message}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default function ExecutionTab() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    status,
    error,
    refresh,
    entries,
    leadEntry,
    isRefreshing,
    lastUpdatedAt,
    snapshotDiscipline,
  } = useTradingWorkspace("trading");
  const [selectedInstrument, setSelectedInstrument] = React.useState<string | null>(null);
  const requestedInstrument = React.useMemo(
    () => searchParams?.get("instrument")?.trim().toUpperCase() || null,
    [searchParams],
  );
  const snapshotFootnote = React.useMemo(
    () => {
      const baseFootnote = buildSnapshotFootnote({
        isRefreshing,
        lastUpdatedAt,
        refreshLabel: "Refreshing execution snapshot",
      });

      if (snapshotDiscipline?.blocked) {
        return [snapshotDiscipline.footnote, snapshotDiscipline.reason]
          .filter(Boolean)
          .join(" | ");
      }

      return snapshotDiscipline?.footnote ?? baseFootnote;
    },
    [isRefreshing, lastUpdatedAt, snapshotDiscipline],
  );
  const asyncMeta = (
    <div className="grid gap-3 md:grid-cols-3">
      <div className="rounded-2xl border border-slate-800 bg-[#101b30] p-4 text-left">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Queue
        </div>
        <div className="mt-2 text-sm text-slate-300">
          Execution keeps the lead market and the rest of the queue visible so the operator can
          switch focus without losing the thread.
        </div>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-[#101b30] p-4 text-left">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Refresh rule
        </div>
        <div className="mt-2 text-sm text-slate-300">
          If the live frame is stale, the cockpit keeps the plan readable but blocks execution until
          the snapshot refreshes.
        </div>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-[#101b30] p-4 text-left">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Continuity
        </div>
        <div className="mt-2 text-sm text-slate-300">
          Alerts and the desk keep following the same market so risk framing does not drift between
          tabs.
        </div>
      </div>
    </div>
  );

  React.useEffect(() => {
    if (!selectedInstrument && requestedInstrument) {
      const requestedEntry = entries.find(
        (entry) => entry.instrument.toUpperCase() === requestedInstrument,
      );
      if (requestedEntry?.instrument) {
        setSelectedInstrument(requestedEntry.instrument);
        return;
      }
    }

    if (!selectedInstrument && leadEntry?.instrument) {
      setSelectedInstrument(leadEntry.instrument);
    }
  }, [entries, leadEntry, requestedInstrument, selectedInstrument]);

  const selectedEntry = React.useMemo(() => {
    if (!entries.length) return null;
    if (selectedInstrument) {
      return entries.find((entry) => entry.instrument === selectedInstrument) ?? leadEntry;
    }
    return leadEntry;
  }, [entries, leadEntry, selectedInstrument]);

  if (status === "idle" || status === "loading") {
    return (
      <PremiumAsyncStateCard
        eyebrow="Execution Cockpit"
        title="Preparing the execution stack"
        body="Syntrake is loading the live queue, entry framing, risk framing, and discipline feed for the current session."
        state="loading"
        footnote={snapshotFootnote}
        meta={asyncMeta}
      />
    );
  }

  if (status === "error") {
    return (
      <PremiumAsyncStateCard
        eyebrow="Execution Cockpit"
        title="Execution could not refresh right now"
        body={error || "The live execution plan failed to refresh on the latest request."}
        tone="error"
        actionLabel="Refresh execution"
        onAction={() => void refresh()}
        footnote={snapshotFootnote}
        meta={asyncMeta}
      />
    );
  }

  if (!selectedEntry) {
    return (
      <PremiumAsyncStateCard
        eyebrow="Execution Cockpit"
        title="No execution stack is open yet"
        body="The desk has not opened a clean execution sequence in this snapshot. As soon as a market graduates into execution, this cockpit fills automatically."
        actionLabel="Refresh execution"
        onAction={() => void refresh()}
        footnote={snapshotFootnote}
        meta={asyncMeta}
      />
    );
  }

  const execution = selectedEntry.workspace.execution;
  const liveDecision = selectedEntry.liveDecision;

  return (
    <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
      <aside className="rounded-[22px] border border-slate-800/80 bg-[#0d1628] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Execution Queue</div>
        <div className="mt-3 space-y-2">
          {entries.map((entry) => (
            <button
              key={entry.instrument}
              type="button"
              onClick={() => setSelectedInstrument(entry.instrument)}
              className={`w-full rounded-2xl border p-3 text-left transition ${
                entry.instrument === selectedEntry.instrument
                  ? "border-[#4f8cff] bg-[#12203a]"
                  : "border-slate-800 bg-[#101b30] hover:border-slate-700"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-white">{entry.instrument}</span>
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${toneClasses(
                    executionStatusTone(entry.executionStatus),
                  )}`}
                >
                  {formatExecutionStatus(entry.executionStatus)}
                </span>
              </div>
              <div className="mt-2 text-xs text-slate-400">{formatTradingState(entry.currentState)}</div>
            </button>
          ))}
        </div>
      </aside>

      <div className="space-y-4">
        <ManualBrokerRunway
          entry={selectedEntry}
          isRefreshing={isRefreshing}
          snapshotBlocked={snapshotDiscipline?.blocked}
          snapshotFootnote={snapshotFootnote}
          onRefresh={() => void refresh()}
        />

        <TradingWorkspaceContinuityCard
          surface="execution"
          entry={selectedEntry}
          isRefreshing={isRefreshing}
          snapshotBlocked={snapshotDiscipline?.blocked}
          snapshotFootnote={snapshotFootnote}
          primaryHref="/app?mode=trading&tab=trading"
          primaryLabel="Back to Desk"
          secondaryHref="/app?mode=trading&tab=alerts"
          secondaryLabel="Open Alerts"
        />

        <section className="rounded-[22px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(17,28,49,0.88)_0%,rgba(13,23,41,0.94)_100%)] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Execution Cockpit</div>
              <div className="mt-2 text-2xl font-semibold text-white">{selectedEntry.instrument}</div>
              <div className="mt-2 max-w-3xl text-sm text-slate-300">{liveDecision.currentHeadline}</div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Pill>{formatTradingState(liveDecision.currentState)}</Pill>
              <Pill>{selectedEntry.contextSummary.sessionLabel}</Pill>
              <span
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${toneClasses(
                  executionStatusTone(liveDecision.executionStatus),
                )}`}
              >
                {formatExecutionStatus(liveDecision.executionStatus)}
              </span>
            </div>
          </div>

          {liveDecision.currentBody ? <div className="mt-4 text-sm text-slate-300">{liveDecision.currentBody}</div> : null}

          <div className="mt-5 flex flex-wrap gap-2">
            {liveDecision.reasons.map((reason) => (
              <Pill key={`${selectedEntry.instrument}-${reason}`}>{reason}</Pill>
            ))}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[22px] border border-slate-800/80 bg-[#0d1628] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
            <div className="text-sm font-semibold text-white">Entry framing</div>
            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl border border-slate-800 bg-[#101b30] p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Trigger type</div>
                <div className="mt-2 text-sm text-slate-200">{execution.entryZone.triggerType}</div>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-[#101b30] p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Trigger level</div>
                <div className="mt-2 text-sm text-slate-200">{compactPrice(execution.entryZone.triggerLevel)}</div>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-[#101b30] p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Entry zone</div>
                <div className="mt-2 text-sm text-slate-200">
                  {compactPrice(execution.entryZone.entryZoneLow)} - {compactPrice(execution.entryZone.entryZoneHigh)}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[22px] border border-slate-800/80 bg-[#0d1628] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
            <div className="text-sm font-semibold text-white">Risk framing</div>
            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl border border-slate-800 bg-[#101b30] p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Invalidation</div>
                <div className="mt-2 text-sm text-slate-200">{compactPrice(execution.invalidation.invalidationLevel)}</div>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-[#101b30] p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Risk mode</div>
                <div className="mt-2 text-sm text-slate-200">{execution.riskFraming.riskMode}</div>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-[#101b30] p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Risk per trade</div>
                <div className="mt-2 text-sm text-slate-200">
                  {typeof execution.riskFraming.riskPct === "number" ? `${execution.riskFraming.riskPct.toFixed(2)}%` : "-"}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[22px] border border-slate-800/80 bg-[#0d1628] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
            <div className="text-sm font-semibold text-white">Trade path</div>
            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl border border-slate-800 bg-[#101b30] p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Primary path</div>
                <div className="mt-2 text-sm text-slate-200">{execution.tradePath.primaryPath || "Wait for confirmation."}</div>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-[#101b30] p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Secondary path</div>
                <div className="mt-2 text-sm text-slate-200">{execution.tradePath.secondaryPath || "No secondary path provided."}</div>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-[#101b30] p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Target zone</div>
                <div className="mt-2 text-sm text-slate-200">{execution.tradePath.targetZone || "-"}</div>
              </div>
            </div>
          </div>

          <div className="rounded-[22px] border border-slate-800/80 bg-[#0d1628] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
            <div className="text-sm font-semibold text-white">Discipline log</div>
            <div className="mt-4 space-y-3">
              {liveDecision.feed.slice(0, 6).map((event) => (
                <div key={event.id} className="rounded-2xl border border-slate-800 bg-[#101b30] p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{formatTradingState(event.state)}</div>
                  <div className="mt-2 text-sm font-medium text-white">{event.headline}</div>
                  {event.body ? <div className="mt-2 text-sm text-slate-300">{event.body}</div> : null}
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => router.push("/app?mode=trading&tab=opportunities")}
            className="rounded-xl border border-slate-700 bg-[#12203a] px-4 py-2 text-sm font-semibold text-white transition hover:border-slate-600"
          >
            Back to Opportunities
          </button>
          <button
            type="button"
            onClick={() => router.push("/app?mode=trading&tab=journal")}
            className="rounded-xl border border-slate-700 bg-[#0f1a2d] px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-600"
          >
            Open Journal
          </button>
        </div>
      </div>
    </div>
  );
}
