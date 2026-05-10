import type { ReactNode } from "react";
import type {
  TradingWatchlistEntry,
  TradingWatchlistFocus,
  TradingWatchlistSection,
} from "@/lib/trading/state";

import TradingLiveDecisionSelectionSurface, {
  resolveSelectedTradingWatchlistEntry,
} from "./TradingLiveDecisionSelectionSurface";
import TradingQuickReadPanel from "./TradingQuickReadPanel";
import TradingWatchlistFocusHeader from "./TradingWatchlistFocusHeader";
import TradingWhySummaryPanel from "./TradingWhySummaryPanel";

export type TradingWorkspaceSection =
  | "live-decision"
  | "playbook"
  | "context"
  | "performance";

type TradingWorkspaceSurfaceProps = {
  sections: TradingWatchlistSection[];
  watchlistFocus: TradingWatchlistFocus | null;
  selectedInstrument: string | null;
  activeSection: TradingWorkspaceSection;
  onSelectInstrument?: (instrument: string) => void;
  onSelectSection?: (section: TradingWorkspaceSection) => void;
};

function sectionButtonClasses(active: boolean) {
  return active
    ? "border-sky-400/70 bg-sky-400/10 text-white"
    : "border-slate-700 bg-[#0d1628] text-slate-300 hover:border-slate-600 hover:text-white";
}

function shellCard(children: ReactNode, title: string, subtitle: string) {
  return (
    <section className="rounded-[24px] border border-slate-800 bg-[#07101c] p-5 text-slate-100 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
      <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">{title}</div>
      <div className="mt-2 text-sm text-slate-300">{subtitle}</div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function formatMaybeNumber(value: number | null | undefined, decimals = 0) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "--";
  }

  return value.toFixed(decimals);
}

function formatPercent(value: number | null | undefined, decimals = 2) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "--";
  }

  return `${value.toFixed(decimals)}%`;
}

function formatList(values: string[]) {
  return values.length > 0 ? values.join(", ") : "--";
}

function TradingPlaybookPanel({ entry }: { entry: TradingWatchlistEntry | null }) {
  if (!entry) {
    return shellCard(
      <div className="text-sm text-slate-400">No trading instrument selected.</div>,
      "Playbook",
      "Execution alignment from the current trading envelope.",
    );
  }

  const { liveDecision, workspace } = entry;
  const { playbook } = workspace;
  const activeRules = playbook.activeRules;
  const playbookCheck = playbook.check;
  const behaviorGuard = playbook.behaviorGuard;
  const executionStatus = workspace.execution.executionStatus;

  return shellCard(
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Playbook</div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {playbook.definition?.name ?? "No playbook attached"}
          </div>
          <div className="mt-2 text-sm text-slate-300">
            ID {playbook.definition?.id ?? "--"} | Session {activeRules?.activeSession ?? "--"}
          </div>
        </div>
        <div className="grid gap-2 text-sm text-slate-300">
          <div>Allowed setups: {formatList(activeRules?.allowedSetups ?? [])}</div>
          <div>Blocked setups: {formatList(activeRules?.blockedSetups ?? [])}</div>
          <div>Preferred regimes: {formatList(activeRules?.preferredRegimes ?? [])}</div>
          <div>Blocked regimes: {formatList(activeRules?.blockedRegimes ?? [])}</div>
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Risk Rules</div>
        <div className="grid gap-2 text-sm leading-6 text-slate-300">
          <div>Risk per trade: {formatPercent(activeRules?.riskPerTradePct, 2)}</div>
          <div>Max daily loss: {formatPercent(activeRules?.maxDailyLossPct, 2)}</div>
          <div>Max open risk: {formatPercent(activeRules?.maxOpenRiskPct, 2)}</div>
          <div>Max trades: {formatMaybeNumber(activeRules?.maxTrades)}</div>
          <div>Max consecutive losses: {formatMaybeNumber(activeRules?.maxConsecutiveLosses)}</div>
          <div>Chase policy: {activeRules?.chasePolicy ?? "--"}</div>
          <div>Invalidation policy: {activeRules?.invalidationPolicy ?? "--"}</div>
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Operational Gate</div>
          <div className="mt-2 text-2xl font-semibold text-white">{executionStatus.executionStatus}</div>
          <div className="mt-2 text-sm text-slate-300">
            Playbook {playbookCheck?.executionAllowed ? "aligned" : "restricted"} | Behavior{" "}
            {behaviorGuard?.state ?? "--"}
          </div>
        </div>
        <div className="space-y-3 text-sm leading-6 text-slate-300">
          <div>Session active: {playbookCheck?.sessionActive ? "yes" : "no"}</div>
          <div>Rules aligned: {playbookCheck?.rulesAligned ? "yes" : "no"}</div>
          <div>Execution allowed: {playbookCheck?.executionAllowed ? "yes" : "no"}</div>
          <div>Behavior guard score: {formatMaybeNumber(behaviorGuard?.score)}</div>
          <div>Risk mode: {workspace.execution.riskFraming.riskMode}</div>
          <div>Trade risk: {formatPercent(liveDecision.riskPct, 4)}</div>
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Reasons</div>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
            {executionStatus.reasons.length > 0 ? (
              executionStatus.reasons.map((reason) => <li key={reason}>- {reason}</li>)
            ) : (
              <li>- No operational restrictions attached to this snapshot.</li>
            )}
          </ul>
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Next Discipline Step</div>
          <div className="mt-2 text-sm leading-6 text-slate-300">
            {executionStatus.nextDisciplineStep ??
              "No additional discipline step attached to this snapshot."}
          </div>
        </div>
      </div>
    </div>,
    "Playbook",
    "Execution alignment from the current trading envelope.",
  );
}

function TradingContextPanel({ entry }: { entry: TradingWatchlistEntry | null }) {
  if (!entry) {
    return shellCard(
      <div className="text-sm text-slate-400">No trading instrument selected.</div>,
      "Context",
      "Market reading details currently attached to the trading envelope.",
    );
  }

  const { market, setupCore, decisionCore, execution } = entry.workspace;
  const { contextSummary } = entry.workspace;

  return shellCard(
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Operational Context</div>
        <div className="mt-2 text-sm text-slate-300">
          {contextSummary.sessionLabel} | {contextSummary.marketOpen ? "Open" : "Closed"}
        </div>
        <div className="mt-2 text-sm text-slate-300">{contextSummary.contextLabel}</div>
        <div className="mt-2 text-xs text-slate-400">
          {contextSummary.priorityReason ?? "No priority reason attached to this snapshot."}
        </div>
        <div className="mt-3 inline-flex rounded-full border border-slate-700 bg-[#0b1323] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
          {contextSummary.coverageLabel}
        </div>
        {contextSummary.coverageReason ? (
          <div className="mt-2 text-xs text-slate-500">{contextSummary.coverageReason}</div>
        ) : null}
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Structure</div>
        <div className="mt-2 text-sm text-slate-300">
          {market.structure.state} | {market.structure.direction} | Score{" "}
          {formatMaybeNumber(market.structure.score)}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Regime</div>
        <div className="mt-2 text-sm text-slate-300">
          {market.regime.state} | Score {formatMaybeNumber(market.regime.score)} | Confidence{" "}
          {formatMaybeNumber(market.regime.confidence)}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Volatility</div>
        <div className="mt-2 text-sm text-slate-300">
          {market.volatility.state} | Score {formatMaybeNumber(market.volatility.score)} | Confidence{" "}
          {formatMaybeNumber(market.volatility.confidence)}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Liquidity</div>
        <div className="mt-2 text-sm text-slate-300">
          {market.liquidity.state} | Score {formatMaybeNumber(market.liquidity.score)} | Confidence{" "}
          {formatMaybeNumber(market.liquidity.confidence)}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Momentum</div>
        <div className="mt-2 text-sm text-slate-300">
          {market.momentum.state} | {market.momentum.direction} | Score{" "}
          {formatMaybeNumber(market.momentum.score)}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Setup</div>
        <div className="mt-2 text-sm text-slate-300">
          {setupCore.setup.type} | {setupCore.setup.direction} | Confidence{" "}
          {formatMaybeNumber(setupCore.setup.confidence)}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Clarity</div>
        <div className="mt-2 text-sm text-slate-300">
          {decisionCore.clarity.level} | Score {formatMaybeNumber(decisionCore.clarity.score)} | Conflict{" "}
          {formatMaybeNumber(decisionCore.clarity.conflictScore)}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Setup Maturity</div>
        <div className="mt-2 text-sm text-slate-300">
          {setupCore.maturity.state} | Score {formatMaybeNumber(setupCore.maturity.score)} | Window{" "}
          {setupCore.opportunityWindow.state}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Trigger / Invalidation</div>
        <div className="mt-2 text-sm text-slate-300">
          Trigger {formatMaybeNumber(execution.entryZone.triggerLevel, 4)} / Invalidation{" "}
          {formatMaybeNumber(execution.invalidation.invalidationLevel, 4)}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Session</div>
        <div className="mt-2 text-sm text-slate-300">
          {market.session.session} | Market {market.session.marketOpen ? "open" : "closed"} | Confidence{" "}
          {formatMaybeNumber(market.session.confidence)}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Bias</div>
        <div className="mt-2 text-sm text-slate-300">
          {decisionCore.bias.direction} | Score {formatMaybeNumber(decisionCore.bias.score)} | Confidence{" "}
          {formatMaybeNumber(decisionCore.bias.confidence)}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Environment</div>
        <div className="mt-2 text-sm text-slate-300">
          {decisionCore.environment.state} | Score {formatMaybeNumber(decisionCore.environment.score)} | Confidence{" "}
          {formatMaybeNumber(decisionCore.environment.confidence)}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Quality / Weighting</div>
        <div className="mt-2 text-sm text-slate-300">
          Grade {setupCore.quality.grade} | Quality {formatMaybeNumber(setupCore.quality.score)} |{" "}
          {decisionCore.weighting.contextProfile}
        </div>
      </div>
    </div>,
    "Context",
    "Market reading details currently attached to the trading envelope.",
  );
}

function TradingPerformancePanel({ entry }: { entry: TradingWatchlistEntry | null }) {
  if (!entry) {
    return shellCard(
      <div className="text-sm text-slate-400">No trading instrument selected.</div>,
      "Performance",
      "Base session history from the live trading feed.",
    );
  }

  const { performance } = entry.workspace;
  const events = entry.liveDecision.feed;
  const stateCounts = Object.entries(performance.stateCounts);

  return shellCard(
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Instrument</div>
          <div className="mt-2 text-lg font-semibold text-white">{performance.instrument}</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Session ID</div>
          <div className="mt-2 text-sm font-semibold text-white">{performance.sessionId}</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Session Events</div>
          <div className="mt-2 text-lg font-semibold text-white">{performance.eventCount}</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Started</div>
          <div className="mt-2 text-sm text-slate-300">{performance.startedAt}</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Latest State</div>
          <div className="mt-2 text-lg font-semibold text-white">{performance.latestState ?? "--"}</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Latest Event</div>
          <div className="mt-2 text-sm text-slate-300">{performance.latestHeadline ?? "--"}</div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.7fr_1.3fr]">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">State Counts</div>
          <div className="mt-4 space-y-3">
            {stateCounts.length > 0 ? (
              stateCounts.map(([state, count]) => (
                <div
                  key={state}
                  className="flex items-center justify-between rounded-xl border border-slate-800 bg-[#0b1423] px-4 py-3"
                >
                  <div className="text-sm font-semibold text-white">{state}</div>
                  <div className="text-sm text-slate-300">{count}</div>
                </div>
              ))
            ) : (
              <div className="text-sm text-slate-400">No state history attached to this session yet.</div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Session Timeline</div>
          <div className="mt-4 space-y-3">
            {events.length > 0 ? (
              events.map((event) => (
                <div key={event.id} className="rounded-xl border border-slate-800 bg-[#0b1423] px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-white">{event.headline}</div>
                    <div className="text-xs uppercase tracking-[0.14em] text-slate-500">{event.state}</div>
                  </div>
                  <div className="mt-1 text-xs text-slate-400">{event.timestamp}</div>
                </div>
              ))
            ) : (
              <div className="text-sm text-slate-400">No performance events attached to this session yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>,
    "Performance",
    "Base session history from the live trading feed.",
  );
}

export default function TradingWorkspaceSurface({
  sections,
  watchlistFocus,
  selectedInstrument,
  activeSection,
  onSelectInstrument,
  onSelectSection,
}: TradingWorkspaceSurfaceProps) {
  const selectedEntry = resolveSelectedTradingWatchlistEntry(sections, selectedInstrument);

  return (
    <div className="space-y-6">
      <TradingWatchlistFocusHeader focus={watchlistFocus} />

      <TradingLiveDecisionSelectionSurface
        sections={sections}
        watchlistFocus={watchlistFocus}
        selectedInstrument={selectedInstrument}
        onSelectInstrument={onSelectInstrument}
      />

      <TradingQuickReadPanel entry={selectedEntry} />
      <TradingWhySummaryPanel entry={selectedEntry} />

      <section className="rounded-[24px] border border-slate-800 bg-[#07101c] p-4 text-slate-100 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["live-decision", "Live Decision"],
              ["playbook", "Playbook"],
              ["context", "Context"],
              ["performance", "Performance"],
            ] as Array<[TradingWorkspaceSection, string]>
          ).map(([section, label]) => (
            <button
              key={section}
              type="button"
              onClick={() => onSelectSection?.(section)}
              data-section={section}
              data-active={activeSection === section ? "true" : "false"}
              className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${sectionButtonClasses(
                activeSection === section,
              )}`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {activeSection === "playbook" ? <TradingPlaybookPanel entry={selectedEntry} /> : null}
      {activeSection === "context" ? <TradingContextPanel entry={selectedEntry} /> : null}
      {activeSection === "performance" ? <TradingPerformancePanel entry={selectedEntry} /> : null}
    </div>
  );
}
