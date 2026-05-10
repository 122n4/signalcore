"use client";

import React from "react";
import { Alert } from "@/lib/alerts/types";
import { Candidate } from "@/lib/core/types";
import { journal } from "@/lib/journal/logger";
import { executionQueue } from "@/lib/execution/queue";
import { alertsStore } from "@/lib/alerts/store";

function badge(sev: Alert["severity"]) {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border";
  if (sev === "critical") return `${base} border-red-200 bg-red-50 text-red-700`;
  if (sev === "high") return `${base} border-amber-200 bg-amber-50 text-amber-700`;
  if (sev === "medium") return `${base} border-neutral-200 bg-neutral-50 text-neutral-800`;
  return `${base} border-emerald-200 bg-emerald-50 text-emerald-700`;
}

function statusChip(st: Alert["status"]) {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border";
  if (st === "open") return `${base} border-neutral-200 bg-white text-neutral-800`;
  if (st === "snoozed") return `${base} border-neutral-200 bg-neutral-50 text-neutral-700`;
  return `${base} border-neutral-200 bg-neutral-50 text-neutral-500`;
}

export function AlertCard(props: {
  alert: Alert;
  onChange: () => void;
}) {
  const { alert, onChange } = props;
  const [showWhy, setShowWhy] = React.useState(false);

  function sendCandidates(cands: Candidate[]) {
    for (const c of cands) executionQueue.add(c);
    journal.log({
      type: "note",
      title: `[alerts] Sent ${cands.length} candidates to Execution`,
      details: `${alert.title}`,
      meta: { alertId: alert.id, candidates: cands },
    });
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={badge(alert.severity)}>{alert.severity.toUpperCase()}</span>
            <span className={statusChip(alert.status)}>{alert.status.toUpperCase()}</span>
            <div className="text-sm font-semibold text-neutral-900">{alert.title}</div>
          </div>

          <div className="mt-1 text-sm text-neutral-700 leading-relaxed">{alert.message}</div>

          {alert.why ? (
            <button
              onClick={() => setShowWhy(!showWhy)}
              className="mt-2 text-xs font-semibold text-neutral-700 hover:underline"
            >
              {showWhy ? "Hide why" : "Show why"}
            </button>
          ) : null}

          {showWhy && alert.why ? (
            <div className="mt-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700 whitespace-pre-wrap">
              {alert.why}
            </div>
          ) : null}

          {alert.suggestedCandidates?.length ? (
            <div className="mt-3 rounded-xl border border-neutral-200 p-3">
              <div className="text-xs font-semibold text-neutral-700">Suggested actions</div>
              <div className="mt-2 space-y-2">
                {alert.suggestedCandidates.slice(0, 3).map((c) => (
                  <div key={c.id} className="rounded-xl border border-neutral-200 p-3">
                    <div className="text-sm font-semibold text-neutral-900">{c.action}: {c.label}</div>
                    <div className="mt-1 text-xs text-neutral-600 whitespace-pre-wrap">{c.rationale}</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-neutral-600">
                      {c.impact?.riskDown ? <span>Risk: {c.impact.riskDown}</span> : null}
                      {c.impact?.driftDown ? <span>Drift: {c.impact.driftDown}</span> : null}
                      {c.impact?.returnUp ? <span>Return: {c.impact.returnUp}</span> : null}
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => sendCandidates(alert.suggestedCandidates ?? [])}
                className="mt-3 rounded-xl bg-neutral-900 px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
              >
                Send to Execution
              </button>
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col gap-2">
          {alert.status !== "resolved" ? (
            <>
              <button
                onClick={() => {
                  alertsStore.resolve(alert.id);
                  journal.log({ type: "note", title: `[alerts] Resolved: ${alert.title}`, meta: { alertId: alert.id } });
                  onChange();
                }}
                className="rounded-xl bg-neutral-900 px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
              >
                Resolve
              </button>

              <button
                onClick={() => {
                  alertsStore.snooze(alert.id, 60);
                  journal.log({ type: "note", title: `[alerts] Snoozed 1h: ${alert.title}`, meta: { alertId: alert.id } });
                  onChange();
                }}
                className="rounded-xl border border-neutral-200 px-3 py-2 text-xs hover:bg-neutral-50"
              >
                Snooze 1h
              </button>

              <button
                onClick={() => {
                  alertsStore.snooze(alert.id, 24 * 60);
                  journal.log({ type: "note", title: `[alerts] Snoozed 24h: ${alert.title}`, meta: { alertId: alert.id } });
                  onChange();
                }}
                className="rounded-xl border border-neutral-200 px-3 py-2 text-xs hover:bg-neutral-50"
              >
                Snooze 24h
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                alertsStore.reopen(alert.id);
                journal.log({ type: "note", title: `[alerts] Reopened: ${alert.title}`, meta: { alertId: alert.id } });
                onChange();
              }}
              className="rounded-xl border border-neutral-200 px-3 py-2 text-xs hover:bg-neutral-50"
            >
              Reopen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}