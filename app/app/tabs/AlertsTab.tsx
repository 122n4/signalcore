"use client";

import React from "react";
import { resolveTradingAlertGuidance, type TradingWatchlistEntry } from "@/lib/trading/state";
import { useFollowedTradingInstruments } from "@/lib/trading/useFollowedTradingInstruments";

import PremiumAsyncStateCard, {
  buildSnapshotFootnote,
} from "@/components/PremiumAsyncStateCard";
import TradingNotificationSettingsCard from "@/components/trading/TradingNotificationSettingsCard";
import TradingWorkspaceContinuityCard from "@/components/trading/TradingWorkspaceContinuityCard";
import {
  executionStatusTone,
  formatExecutionStatus,
  formatTradingState,
  limitTradingOpportunityLayers,
  toneClasses,
  useTradingWorkspace,
} from "./tradingWorkspace";

type AlertsTabProps = {
  locale?: "en" | "pt";
};

function copy(locale: "en" | "pt") {
  if (locale === "pt") {
    return {
      title: "Alertas",
      subtitle: "O cockpit de trading transforma mudancas de estado em alertas de disciplina claros.",
      timing: "Proximas reavaliacoes",
      empty: "Sem alertas ativos neste snapshot.",
      emptyTiming: "Sem mercados a exigir reavaliacao imediata neste snapshot.",
      refresh: "Atualizar",
      active: "Alertas ativos",
      automation: "Logica de automacao",
      automationBody:
        "O objetivo nao e disparar tudo. E destacar o que exige atencao, travar o que esta perigoso e manter o resto silencioso.",
      restricted: "Restrito",
      caution: "Cautela",
      allowed: "Permitido",
      loadingTitle: "A preparar a fila de alertas",
      loadingBody:
        "O Syntrake esta a atualizar os alertas de disciplina, janelas de reavaliacao e proximos gatilhos do desk.",
      errorTitle: "Os alertas nao conseguiram atualizar agora",
      errorBody: "A ultima atualizacao de alertas falhou antes da fila poder atualizar.",
      cadenceBody:
        "O desk agora diz quando voltar e o que deve disparar o proximo alerta.",
      restrictedBody:
        "Estas sao as situacoes em que o desk nao deve executar. O sistema esta a proteger o operador de mau timing ou estrutura invalida.",
      cautionBody:
        "Cautela significa que o mercado esta perto, mas ainda nao esta limpo o suficiente. Observa, nao forces.",
      allowedBody:
        "Setups permitidos continuam a precisar de disciplina do operador. Permissao nao e obrigacao.",
      refreshLabel: "A refrescar fila de alertas",
    };
  }

  return {
    title: "Alerts",
    subtitle: "The trading cockpit turns market state changes into clear discipline alerts.",
    timing: "Next re-check queue",
    empty: "No active alerts in this snapshot.",
    emptyTiming: "No markets need an immediate re-check in this snapshot.",
    refresh: "Refresh",
    active: "Active alerts",
    automation: "Automation logic",
    automationBody:
      "The goal is not to fire everything. The goal is to surface what needs attention, block what is dangerous, and keep the rest silent.",
    restricted: "Restricted",
    caution: "Caution",
    allowed: "Allowed",
    loadingTitle: "Preparing the alert queue",
    loadingBody:
      "Syntrake is refreshing the discipline alerts, re-check windows, and next trigger conditions for the live desk.",
    errorTitle: "Alerts could not refresh right now",
    errorBody: "The latest alert refresh failed before the queue could update.",
    cadenceBody:
      "The desk now tells the operator when to come back and what should trigger the next alert.",
    restrictedBody:
      "These are the setups where the desk should not execute. The system is protecting the operator from poor timing or invalid structure.",
    cautionBody:
      "Caution means the market is close, but not clean enough yet. Watch it, do not force it.",
    allowedBody:
      "Allowed setups should still pass operator discipline. Permission is not compulsion.",
    refreshLabel: "Refreshing alert queue",
  };
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-700 bg-[#0f1a2d] px-2.5 py-1 text-[11px] text-slate-300">
      {children}
    </span>
  );
}

function resolveFollowUpLabel(entry: TradingWatchlistEntry) {
  if (
    entry.currentState === "EXIT" ||
    entry.currentState === "TOO_LATE" ||
    entry.currentState === "BLOCKED" ||
    entry.executionStatus === "restricted"
  ) {
    return "Sell / close review";
  }

  if (entry.executionStatus === "allowed" && entry.currentState === "TRADE_VALID") {
    return entry.liveDecision.direction === "short" ? "Sell / short plan" : "Buy / execute plan";
  }

  if (entry.executionStatus === "caution") {
    return "Wait / monitor";
  }

  return "Hold / re-check";
}

export default function AlertsTab({ locale = "en" }: AlertsTabProps) {
  const t = copy(locale);
  const {
    status,
    error,
    refresh,
    entries,
    opportunityLayers,
    notifications,
    isRefreshing,
    lastUpdatedAt,
    snapshotDiscipline,
  } = useTradingWorkspace("trading");
  const {
    instruments: followedInstruments,
    close: closeFollowedInstrument,
    isFollowed: isFollowedInstrument,
  } = useFollowedTradingInstruments();
  const snapshotFootnote = React.useMemo(() => {
    const baseFootnote = buildSnapshotFootnote({
      isRefreshing,
      lastUpdatedAt,
      refreshLabel: t.refreshLabel,
    });

    if (snapshotDiscipline?.blocked) {
      return [snapshotDiscipline.footnote, snapshotDiscipline.reason]
        .filter(Boolean)
        .join(" | ");
    }

    return snapshotDiscipline?.footnote ?? baseFootnote;
  }, [isRefreshing, lastUpdatedAt, snapshotDiscipline, t.refreshLabel]);

  const asyncMeta = (
    <div className="grid gap-3 md:grid-cols-3">
      <div className="rounded-2xl border border-slate-800 bg-[#101b30] p-4 text-left">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Alert queue
        </div>
        <div className="mt-2 text-sm text-slate-300">
          Alerts only escalate when the desk sees a meaningful shift in execution posture.
        </div>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-[#101b30] p-4 text-left">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Re-check cadence
        </div>
        <div className="mt-2 text-sm text-slate-300">
          The queue stays tied to re-check windows so the operator knows when to come back, not
          just what changed.
        </div>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-[#101b30] p-4 text-left">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Snapshot discipline
        </div>
        <div className="mt-2 text-sm text-slate-300">
          If the live frame is stale, alerts remain readable but they stop pretending the setup is
          fresh enough to execute.
        </div>
      </div>
    </div>
  );

  const recheckQueue = React.useMemo(() => {
    return limitTradingOpportunityLayers(opportunityLayers, 6).flatMap((layer) =>
      layer.entries.map((entry) => ({
        id: `${entry.instrument}-${layer.key}`,
        instrument: entry.instrument,
        layerTitle: layer.title,
        state: formatTradingState(entry.currentState),
        guidance: resolveTradingAlertGuidance(entry),
      })),
    );
  }, [opportunityLayers]);

  const alerts = React.useMemo(() => {
    return entries
      .filter(
        (entry) =>
          entry.executionStatus !== "allowed" ||
          entry.currentState === "TOO_LATE" ||
          entry.currentState === "BLOCKED",
      )
      .map((entry) => ({
        id: `${entry.instrument}-${entry.currentState}-${entry.executionStatus}`,
        instrument: entry.instrument,
        state: formatTradingState(entry.currentState),
        status: formatExecutionStatus(entry.executionStatus),
        tone: executionStatusTone(entry.executionStatus),
        detail:
          entry.liveDecision.nextDisciplineStep ||
          entry.liveDecision.reasons[0] ||
          entry.currentHeadline,
      }));
  }, [entries]);
  const followedEntries = React.useMemo(
    () =>
      entries.filter((entry) =>
        isFollowedInstrument(entry.instrument),
      ),
    [entries, followedInstruments, isFollowedInstrument],
  );

  if (status === "idle" || status === "loading") {
    return (
      <PremiumAsyncStateCard
        eyebrow={t.title}
        title={t.loadingTitle}
        body={t.loadingBody}
        state="loading"
        footnote={snapshotFootnote}
        meta={asyncMeta}
      />
    );
  }

  if (status === "error") {
    return (
      <PremiumAsyncStateCard
        eyebrow={t.title}
        title={t.errorTitle}
        body={error || t.errorBody}
        tone="error"
        actionLabel={t.refresh}
        onAction={() => void refresh()}
        footnote={snapshotFootnote}
        meta={asyncMeta}
      />
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
      <div className="xl:col-span-2">
        <TradingWorkspaceContinuityCard
          surface="alerts"
          entry={entries[0] ?? null}
          isRefreshing={isRefreshing}
          snapshotBlocked={snapshotDiscipline?.blocked}
          snapshotFootnote={snapshotFootnote}
          primaryHref="/app?mode=trading&tab=trading"
          primaryLabel="Back to Desk"
          secondaryHref="/app?mode=trading&tab=execution"
          secondaryLabel="Open Execution"
        />
      </div>

      <section className="xl:col-span-2 rounded-[22px] border border-emerald-400/18 bg-[linear-gradient(135deg,rgba(16,185,129,0.12),rgba(13,23,41,0.94)_52%,rgba(14,165,233,0.08))] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.24)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100/70">
              Followed until close
            </div>
            <div className="mt-2 text-2xl font-semibold text-white">
              Markets you chose to keep watching
            </div>
            <div className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              Only markets you choose to follow stay pinned here. Syntrake escalates wait,
              act, invalidation, and close-review alerts for these instruments.
            </div>
          </div>
          <Pill>{followedEntries.length} followed</Pill>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {followedEntries.length ? (
            followedEntries.map((entry) => (
              <article key={entry.instrument} className="rounded-3xl border border-emerald-400/16 bg-[#091524] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-white">{entry.instrument}</div>
                    <div className="mt-1 text-sm text-slate-400">
                      {formatTradingState(entry.currentState)} | {formatExecutionStatus(entry.executionStatus)}
                    </div>
                  </div>
                  <span className="rounded-full border border-emerald-300/35 bg-emerald-400/12 px-3 py-1 text-xs font-semibold text-emerald-50">
                    {resolveFollowUpLabel(entry)}
                  </span>
                </div>
                <div className="mt-4 rounded-2xl border border-slate-800 bg-[#07101c] p-4 text-sm leading-6 text-slate-300">
                  {entry.liveDecision.nextDisciplineStep ||
                    entry.liveDecision.reasons[0] ||
                    entry.currentHeadline}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void closeFollowedInstrument(
                      entry.instrument,
                      entry.liveDecision.nextDisciplineStep ||
                        entry.liveDecision.reasons[0] ||
                        "Removed from follow list",
                    )
                  }
                  className="mt-4 inline-flex items-center justify-center rounded-xl border border-slate-700 bg-[#101b30] px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-emerald-400/35"
                >
                  Close / remove from follow list
                </button>
              </article>
            ))
          ) : (
            <div className="lg:col-span-2 rounded-3xl border border-slate-800 bg-[#101b30] p-5 text-sm leading-6 text-slate-300">
              No followed instruments yet. Open the Trading Desk and choose Follow until close
              on a market you want Syntrake to track after the buy/entry decision.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-[22px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(17,28,49,0.88)_0%,rgba(13,23,41,0.94)_100%)] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              {t.title}
            </div>
            <div className="mt-2 text-2xl font-semibold text-white">{t.active}</div>
            <div className="mt-2 max-w-3xl text-sm text-slate-300">{t.subtitle}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Pill>
              {t.restricted}: {alerts.filter((item) => item.tone === "bad").length}
            </Pill>
            <Pill>
              {t.caution}: {alerts.filter((item) => item.tone === "warn").length}
            </Pill>
            <Pill>
              {t.allowed}: {entries.filter((entry) => entry.executionStatus === "allowed").length}
            </Pill>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {alerts.length ? (
            alerts.map((alert) => (
              <article key={alert.id} className="rounded-3xl border border-slate-800 bg-[#101b30] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-white">{alert.instrument}</div>
                    <div className="mt-1 text-sm text-slate-400">{alert.state}</div>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${toneClasses(
                      alert.tone,
                    )}`}
                  >
                    {alert.status}
                  </span>
                </div>
                <div className="mt-3 text-sm text-slate-300">{alert.detail}</div>
              </article>
            ))
          ) : (
            <div className="rounded-3xl border border-slate-800 bg-[#101b30] p-5 text-sm text-slate-300">
              {t.empty}
            </div>
          )}
        </div>
      </section>

      <div className="space-y-4">
        <TradingNotificationSettingsCard
          eligibleCount={notifications.filter((event) => event.browserEligible).length}
        />

        <section className="rounded-[22px] border border-slate-800/80 bg-[#0d1628] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
          <div className="text-sm font-semibold text-white">{t.timing}</div>
          <div className="mt-2 text-sm text-slate-300">{t.cadenceBody}</div>

          <div className="mt-5 space-y-3">
            {recheckQueue.length ? (
              recheckQueue.map((item) => (
                <article key={item.id} className="rounded-3xl border border-slate-800 bg-[#101b30] p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold text-white">{item.instrument}</div>
                      <div className="mt-1 text-sm text-slate-400">
                        {item.layerTitle} | {item.state}
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${toneClasses(
                        item.guidance.tone === "good"
                          ? "good"
                          : item.guidance.tone === "warn"
                            ? "warn"
                            : "neutral",
                      )}`}
                    >
                      {item.guidance.badge}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3">
                    <div className="rounded-2xl border border-slate-800 bg-[#0b1323] p-4">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                        Re-check window
                      </div>
                      <div className="mt-2 text-sm text-slate-300">{item.guidance.recheckWindow}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-[#0b1323] p-4">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                        Next alert trigger
                      </div>
                      <div className="mt-2 text-sm text-slate-300">
                        {item.guidance.nextAlertCondition}
                      </div>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-3xl border border-slate-800 bg-[#101b30] p-5 text-sm text-slate-300">
                {t.emptyTiming}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-[22px] border border-slate-800/80 bg-[#0d1628] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
          <div className="text-sm font-semibold text-white">{t.automation}</div>
          <div className="mt-2 text-sm text-slate-300">{t.automationBody}</div>

          <div className="mt-5 grid gap-3">
            <div className="rounded-2xl border border-slate-800 bg-[#101b30] p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Restricted</div>
              <div className="mt-2 text-sm text-slate-300">{t.restrictedBody}</div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-[#101b30] p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Caution</div>
              <div className="mt-2 text-sm text-slate-300">{t.cautionBody}</div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-[#101b30] p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Allowed</div>
              <div className="mt-2 text-sm text-slate-300">{t.allowedBody}</div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void refresh()}
            className="mt-5 rounded-xl border border-slate-700 bg-[#12203a] px-4 py-2 text-sm font-semibold text-white transition hover:border-slate-600"
          >
            {t.refresh}
          </button>
        </section>
      </div>
    </div>
  );
}
