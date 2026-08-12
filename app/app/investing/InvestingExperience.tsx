"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, BarChart3, CircleAlert, RefreshCw, ShieldCheck, Target, Wallet } from "lucide-react";

import {
  buildInvestingExperienceModel,
  investingExperienceCopy,
  type InvestingDashboardPayload,
  type InvestingExperienceScreen,
  type ValueDisplay,
} from "@/app/app/investing/investingExperienceModel";

type LoadState =
  | { status: "loading"; data: InvestingDashboardPayload | null; error: null }
  | { status: "ready"; data: InvestingDashboardPayload; error: null }
  | { status: "error"; data: InvestingDashboardPayload | null; error: string };

const DASHBOARD_TIMEOUT_MS = 12_000;

function toneClasses(tone: ValueDisplay["tone"]) {
  if (tone === "good") return "border-emerald-400/20 bg-emerald-400/10 text-emerald-50";
  if (tone === "warn") return "border-amber-400/20 bg-amber-400/10 text-amber-50";
  if (tone === "bad") return "border-rose-400/20 bg-rose-400/10 text-rose-50";
  return "border-cyan-300/20 bg-cyan-300/10 text-cyan-50";
}

function Metric(props: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail?: string | null;
  tone?: ValueDisplay["tone"];
}) {
  return (
    <div className={`rounded-lg border p-4 ${toneClasses(props.tone ?? "info")}`}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase text-current/70">
        {props.icon}
        <span>{props.label}</span>
      </div>
      <div className="mt-3 text-2xl font-semibold text-white">{props.value}</div>
      {props.detail ? <div className="mt-1 text-sm leading-6 text-current/75">{props.detail}</div> : null}
    </div>
  );
}

function Section(props: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-white">{props.title}</h2>
        {props.right}
      </div>
      {props.children}
    </section>
  );
}

function StatusBadge(props: { label: string; tone: ValueDisplay["tone"] }) {
  return <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${toneClasses(props.tone)}`}>{props.label}</span>;
}

function SummaryMetrics({ data }: { data: InvestingDashboardPayload | null }) {
  const model = buildInvestingExperienceModel(data);
  return (
    <div className="grid gap-3 md:grid-cols-4">
      <Metric
        icon={<BarChart3 className="h-4 w-4" />}
        label="Portfolio value"
        value={model.portfolioValue.text}
        detail={model.portfolioValue.label}
        tone={model.portfolioValue.tone}
      />
      <Metric
        icon={<Wallet className="h-4 w-4" />}
        label="Cash"
        value={model.cash.text}
        detail={model.cash.label}
        tone={model.cash.tone}
      />
      <Metric
        icon={<ShieldCheck className="h-4 w-4" />}
        label="Environment"
        value={model.environment}
        detail={model.accountStatus}
        tone={model.hasAccount ? "info" : "warn"}
      />
      <Metric
        icon={<Activity className="h-4 w-4" />}
        label="Performance"
        value={model.performanceText}
        tone="warn"
      />
    </div>
  );
}

function Overview({ data }: { data: InvestingDashboardPayload | null }) {
  const model = buildInvestingExperienceModel(data);
  return (
    <>
      <SummaryMetrics data={data} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Decision" right={<StatusBadge label={model.decision.label} tone={model.decision.tone} />}>
          <p className="text-lg font-semibold text-white">{model.decision.text}</p>
          {!model.decision.actionable ? (
            <p className="mt-2 text-sm leading-6 text-slate-300">{investingExperienceCopy.unavailable}</p>
          ) : null}
        </Section>
        <Section title="Next step">
          <p className="text-lg font-semibold text-white">{model.nextStep}</p>
        </Section>
      </div>
    </>
  );
}

function Portfolio({ data }: { data: InvestingDashboardPayload | null }) {
  const model = buildInvestingExperienceModel(data);
  return (
    <>
      <SummaryMetrics data={data} />
      <Section title="Holdings" right={<StatusBadge label={model.portfolioValue.label} tone={model.portfolioValue.tone} />}>
        {model.items.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-slate-400">
                <tr>
                  <th className="py-2 font-semibold">Symbol</th>
                  <th className="py-2 font-semibold">Quantity</th>
                  <th className="py-2 text-right font-semibold">Value</th>
                  <th className="py-2 text-right font-semibold">Truth</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {model.items.map((item) => (
                  <tr key={item.symbol}>
                    <td className="py-3 text-white">{item.symbol}</td>
                    <td className="py-3 text-slate-300">{item.quantity}</td>
                    <td className="py-3 text-right text-white">{item.valuation.text}</td>
                    <td className="py-3 text-right">
                      <StatusBadge label={item.valuation.label} tone={item.valuation.tone} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm leading-6 text-slate-300">No active holdings</p>
        )}
      </Section>
    </>
  );
}

function Plan({ data }: { data: InvestingDashboardPayload | null }) {
  const model = buildInvestingExperienceModel(data);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Metric icon={<Target className="h-4 w-4" />} label="Plan" value={model.planName} tone={model.hasPlan ? "info" : "warn"} />
      <Metric
        icon={<BarChart3 className="h-4 w-4" />}
        label="Target"
        value={model.planTarget}
        tone={model.planTargetAvailable ? "info" : "warn"}
      />
    </div>
  );
}

function Insights({ data }: { data: InvestingDashboardPayload | null }) {
  const model = buildInvestingExperienceModel(data);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Guidance" right={<StatusBadge label={model.decision.label} tone={model.decision.tone} />}>
        <p className="text-lg font-semibold text-white">{model.decision.text}</p>
      </Section>
      <Section title="Research">
        <p className="text-sm leading-6 text-slate-300">Research remains a validation surface. It does not authorize account ownership or execution.</p>
      </Section>
    </div>
  );
}

export function InvestingExperienceStateView(props: {
  screen: InvestingExperienceScreen;
  state: LoadState;
  onRetry?: () => void;
}) {
  const data = props.state.data;
  const body =
    props.screen === "portfolio" ? (
      <Portfolio data={data} />
    ) : props.screen === "plan" ? (
      <Plan data={data} />
    ) : props.screen === "insights" ? (
      <Insights data={data} />
    ) : (
      <Overview data={data} />
    );

  return (
    <div className="grid gap-4">
      {props.state.status === "loading" ? (
        <div className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-4 text-sm font-semibold text-cyan-50">
          Loading dashboard
        </div>
      ) : null}
      {props.state.status === "error" ? (
        <div className="rounded-lg border border-rose-400/20 bg-rose-400/10 p-4 text-rose-50">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <CircleAlert className="h-4 w-4" />
              <span>{props.state.error}</span>
            </div>
            <button
              type="button"
              onClick={props.onRetry}
              className="inline-flex items-center gap-2 rounded-md border border-white/15 px-3 py-2 text-sm font-semibold text-white"
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </button>
          </div>
        </div>
      ) : null}
      {body}
    </div>
  );
}

export default function InvestingExperience({ screen }: { screen: InvestingExperienceScreen }) {
  const [state, setState] = useState<LoadState>({ status: "loading", data: null, error: null });

  const load = useCallback(async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), DASHBOARD_TIMEOUT_MS);

    setState((current) => ({ status: "loading", data: current.data, error: null }));
    try {
      const response = await fetch("/api/investing/dashboard", {
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = await response.json();
      if (!response.ok || payload?.ok === false) throw new Error(payload?.error || "Dashboard unavailable");
      setState({ status: "ready", data: payload, error: null });
    } catch {
      setState((current) => ({
        status: "error",
        data: current.data,
        error: current.data ? "Refresh failed" : "Dados indisponiveis neste momento",
      }));
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleState = useMemo(() => state, [state]);
  return <InvestingExperienceStateView screen={screen} state={visibleState} onRetry={load} />;
}
