"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { buildScenarios, requiredMonthlyContribution } from "@/lib/signalcore/wealthMath";
import { usePaid } from "@/lib/signalcore/usePaid";

type GoalType = "Investing";
type RiskProfile = "Conservative" | "Balanced" | "Aggressive";
type RealityVerdict = "realistic" | "stretch" | "unrealistic";
type SetupMode = "offline" | "broker";
type ModeKey = "investing";

type StarterRow = {
  symbol: string;
  name: string | null;
  valueEur: number;
  qty: number | null;
};

type OpportunityRow = {
  symbol: string;
  side: "BUY" | "SELL" | "HOLD";
  why: string;
  conviction: number;
};

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function toMode(goalType: GoalType): ModeKey {
  void goalType;
  return "investing";
}

function goalTypeFromMode(modeValue: string | null): GoalType {
  void modeValue;
  return "Investing";
}

function baseAnnualReturnPct(goalType: GoalType, risk: RiskProfile) {
  void goalType;
  const byRisk: Record<RiskProfile, number> = {
    Conservative: 5.5,
    Balanced: 7.5,
    Aggressive: 10,
  };
  return byRisk[risk];
}

function parsePositiveNumber(v: string, fallback: number) {
  const n = Number(String(v || "").replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, n);
}

function formatIntWithSpaces(v: number) {
  const n = Math.round(Math.abs(Number.isFinite(v) ? v : 0));
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function fmtEUR(v: number) {
  const sign = Number(v) < 0 ? "-" : "";
  return `${sign}${formatIntWithSpaces(v)} EUR`;
}

function pct(v: number) {
  return `${Math.round(v)}%`;
}

function horizonLabel(months: number) {
  if (months < 12) return `${months} months`;
  if (months % 12 === 0) return `${months / 12} years`;
  return `${months} months`;
}

function Pill({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={classNames(
        "rounded-xl px-3 py-2 text-sm font-semibold transition",
        active ? "bg-neutral-950 text-white" : "border border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-50"
      )}
    >
      {children}
    </button>
  );
}

function Badge({ tone, children }: { tone: "good" | "warn" | "bad" | "neutral"; children: React.ReactNode }) {
  const styles =
    tone === "good"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : tone === "bad"
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : "border-neutral-200 bg-neutral-50 text-neutral-700";
  return <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${styles}`}>{children}</span>;
}

function modeHint(goalType: GoalType) {
  void goalType;
  return "Calm compounding mode with risk discipline.";
}

async function fetchJSON(url: string, opts?: RequestInit) {
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts?.headers || {}) },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false as const, status: res.status, data };
  return { ok: true as const, status: res.status, data };
}

function normalizeOpportunitySide(v: unknown): "BUY" | "SELL" | "HOLD" {
  const x = String(v || "").toUpperCase().trim();
  if (x === "SELL") return "SELL";
  if (x === "HOLD") return "HOLD";
  return "BUY";
}

function verdictTone(v: RealityVerdict): "good" | "warn" | "bad" {
  if (v === "realistic") return "good";
  if (v === "stretch") return "warn";
  return "bad";
}

function verdictTitle(v: RealityVerdict) {
  if (v === "realistic") return "Realistic";
  if (v === "stretch") return "Stretch goal";
  return "Unrealistic now";
}

export default function OfflineSetupClient() {
  useSearchParams();
  const { hasProAccess, loadingPaid } = usePaid();
  const requestedMode = null;
  const [goalType, setGoalType] = useState<GoalType>(() => goalTypeFromMode(requestedMode));
  const [riskProfile, setRiskProfile] = useState<RiskProfile>("Balanced");
  const [horizonMonths, setHorizonMonths] = useState<number>(36);
  const [startingCapitalInput, setStartingCapitalInput] = useState<string>("5000");
  const [monthlyContributionInput, setMonthlyContributionInput] = useState<string>("300");
  const [targetCapitalInput, setTargetCapitalInput] = useState<string>("50000");
  const [hasExistingHoldings, setHasExistingHoldings] = useState<boolean>(false);

  const [previewLoading, setPreviewLoading] = useState(false);
  const [starterPreview, setStarterPreview] = useState<StarterRow[]>([]);
  const [opportunityPreview, setOpportunityPreview] = useState<OpportunityRow[]>([]);
  const [previewSource, setPreviewSource] = useState<string>("local");

  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState<string>("");

  const mode = toMode(goalType);
  const startingCapital = useMemo(() => parsePositiveNumber(startingCapitalInput, 5000), [startingCapitalInput]);
  const monthlyContribution = useMemo(
    () => parsePositiveNumber(monthlyContributionInput, 300),
    [monthlyContributionInput]
  );
  const targetCapital = useMemo(() => parsePositiveNumber(targetCapitalInput, 50000), [targetCapitalInput]);
  const annualReturn = useMemo(() => baseAnnualReturnPct(goalType, riskProfile), [goalType, riskProfile]);

  const scenarios = useMemo(
    () =>
      buildScenarios({
        startingCapital,
        monthlyContribution,
        targetCapital,
        horizonMonths,
        baseAnnualReturnPct: annualReturn,
      }),
    [annualReturn, horizonMonths, monthlyContribution, startingCapital, targetCapital]
  );

  const baseScenario = scenarios.find((s) => s.label === "Base") ?? scenarios[1];
  const upsideScenario = scenarios.find((s) => s.label === "Upside") ?? scenarios[2];
  const requiredMonthly = useMemo(
    () => requiredMonthlyContribution(startingCapital, annualReturn, horizonMonths, targetCapital),
    [annualReturn, horizonMonths, startingCapital, targetCapital]
  );

  const verdict: RealityVerdict = useMemo(() => {
    if (baseScenario && baseScenario.finalValue >= targetCapital) return "realistic";
    if (upsideScenario && upsideScenario.finalValue >= targetCapital) return "stretch";
    return "unrealistic";
  }, [baseScenario, targetCapital, upsideScenario]);

  const monthlyGap = Math.max(0, requiredMonthly - monthlyContribution);
  const shouldPrepareStarter = !hasExistingHoldings && startingCapital >= 100;
  useEffect(() => {
    const nextGoalType = goalTypeFromMode(requestedMode);
    setGoalType((current) => (current === nextGoalType ? current : nextGoalType));
  }, [requestedMode]);

  useEffect(() => {
    void loadingPaid;
    void hasProAccess;
    if (goalType !== "Investing") {
      setGoalType("Investing");
    }
  }, [goalType, hasProAccess, loadingPaid]);

  useEffect(() => {
    let cancelled = false;
    async function loadPreview() {
      setPreviewLoading(true);
      try {
        const r = await fetchJSON(`/api/daily-bundle?mode=investing&budgetEur=${Math.max(100, Math.round(startingCapital))}`, {
          method: "GET",
        });
        if (!r.ok) return;
        if (cancelled) return;

        const starterPackRaw = Array.isArray(r.data?.daily?.starterPack) ? r.data.daily.starterPack : [];
        const starter = starterPackRaw
          .map((x: any) => ({
            symbol: String(x?.symbol || "").toUpperCase(),
            name: x?.name ? String(x.name) : null,
            valueEur: Number(x?.value_eur ?? x?.valueEur ?? 0),
            qty: x?.qty == null ? null : Number(x.qty),
          }))
          .filter((x: StarterRow) => x.symbol.length > 0)
          .slice(0, 6);

        const opportunitiesRaw = Array.isArray(r.data?.daily?.opportunities) ? r.data.daily.opportunities : [];
        const opportunities = opportunitiesRaw
          .map((x: any) => ({
            symbol: String(x?.symbol || "").toUpperCase(),
            side: normalizeOpportunitySide(x?.side ?? x?.action),
            why: x?.why ? String(x.why) : x?.title ? String(x.title) : "Opportunity from current market scan.",
            conviction: Number(x?.score ?? x?.conviction ?? 0),
          }))
          .filter((x: OpportunityRow) => x.symbol.length > 0)
          .sort((a: OpportunityRow, b: OpportunityRow) => b.conviction - a.conviction)
          .slice(0, 3);

        setStarterPreview(starter);
        setOpportunityPreview(opportunities);
        setPreviewSource(String(r.data?.daily?.starterPackMeta?.source || "local"));
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }
    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [mode, startingCapital]);

  async function completeSetup(modeValue: SetupMode) {
    const r = await fetchJSON("/api/setup/complete", {
      method: "POST",
      body: JSON.stringify({ mode: modeValue }),
    });
    return r;
  }

  async function ensureSetupIsComplete(modeValue: SetupMode) {
    // 1) Mark setup complete in user settings directly.
    const mark = await fetchJSON("/api/user-settings", {
      method: "POST",
      body: JSON.stringify({
        setup_mode: modeValue,
        setup_status: "complete",
      }),
    });
    if (!mark.ok) throw new Error(String(mark.data?.error || "Could not mark setup as complete."));

    // 2) Keep dedicated endpoint call for compatibility paths.
    const complete = await completeSetup(modeValue);
    if (!complete.ok) {
      // Non-blocking fallback; status was already set above.
      console.warn("setup/complete endpoint failed, continuing with user-settings completion.");
    }

    // 3) Verify readback to avoid redirect loop back to welcome.
    const check = await fetchJSON("/api/user-settings", { method: "GET" });
    const setupStatus = String(check.data?.settings?.setup_status || "").toLowerCase().trim();
    if (setupStatus !== "complete") {
      // Do not block onboarding here. App gate also accepts complete profile/plan.
      console.warn("setup_status readback is not complete; continuing with onboarding redirect.");
    }
  }

  async function onLaunch() {
    if (status === "saving") return;
    setStatus("saving");
    setError("");

    try {
      const goalLine =
        verdict === "unrealistic"
          ? `Target is currently too aggressive. Goal: reach EUR ${Math.round(targetCapital)} in ${horizonMonths} months with risk controls and iterative target reviews.`
          : `Reach EUR ${Math.round(targetCapital)} in ${horizonMonths} months with ${riskProfile.toLowerCase()} risk in investing mode.`;

      const saveSettings = await fetchJSON("/api/user-settings", {
        method: "POST",
        body: JSON.stringify({
          active_mode: mode,
          setup_mode: "offline",
          setup_status: "complete",
          risk_profile: riskProfile,
          horizon: horizonMonths < 12 ? "Short" : horizonMonths < 48 ? "Medium" : "Long",
          goal_type: goalType,
          goal_target_value: Math.round(targetCapital),
        }),
      });
      if (!saveSettings.ok) throw new Error("Could not save profile settings.");

      const plan = await fetchJSON("/api/plans", {
        method: "POST",
        body: JSON.stringify({
          mode,
          goal: goalLine,
          activate: true,
        }),
      });
      if (!plan.ok) throw new Error("Could not activate your plan.");

      await ensureSetupIsComplete("offline");

      try {
        window.localStorage.setItem(
          "sc_wealth_plan_v1",
          JSON.stringify({
            startingCapital: Math.round(startingCapital),
            monthlyContribution: Math.round(monthlyContribution),
            targetCapital: Math.round(targetCapital),
          })
        );
        window.localStorage.setItem(
          "sc_goal_quiz_v1",
          JSON.stringify({
            goalType,
            riskProfile,
            mode,
            horizonMonths,
            startingCapital: Math.round(startingCapital),
            monthlyContribution: Math.round(monthlyContribution),
            targetCapital: Math.round(targetCapital),
            hasExistingHoldings,
            annualReturn,
            verdict,
          })
        );
        const starterBudgetRaw = window.localStorage.getItem("sc_starter_budget_v1");
        const starterBudgetParsed = (starterBudgetRaw ? JSON.parse(starterBudgetRaw) : {}) as Record<string, number>;
        starterBudgetParsed[mode] = Math.max(100, Math.round(startingCapital));
        window.localStorage.setItem("sc_starter_budget_v1", JSON.stringify(starterBudgetParsed));
        window.localStorage.setItem("sc_onboarded", "1");
      } catch {
        // non-blocking
      }

      const qp = new URLSearchParams();
      qp.set("tab", "portfolio");
      qp.set("mode", "investing");
      qp.set("workspace", "simple");
      qp.set("fromSetup", "1");
      if (hasExistingHoldings) qp.set("addHoldingsNow", "1");
      else if (shouldPrepareStarter && starterPreview.length > 0) qp.set("starterReady", "1");
      window.location.href = `/app?${qp.toString()}`;
    } catch (e: any) {
      setStatus("error");
      setError(String(e?.message || "Could not finish setup. Please try again."));
    } finally {
      setStatus((prev) => (prev === "error" ? "error" : "idle"));
    }
  }

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="border-b border-black/5 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/app?tab=daily&mode=investing" className="text-sm font-semibold tracking-tight">
            Syntrake
          </Link>
          <div className="text-xs text-neutral-500">Goal setup to first action</div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <div className="grid gap-6 lg:grid-cols-3">
          <section className="lg:col-span-2 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs text-neutral-700">
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              90-second setup to your first action
            </div>

            <h1 className="mt-4 text-3xl font-semibold tracking-tight">Turn a real money goal into your first Syntrake action</h1>
            <p className="mt-2 text-sm text-neutral-600">
              Answer six inputs. Syntrake activates your plan, prepares your Portfolio import or Starter Pack, and then hands
              you a clear next step in Daily.
            </p>

            <div className="mt-4 flex flex-wrap gap-2 text-xs text-neutral-600">
              <div className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1">1. Set goal and guardrails</div>
              <div className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1">2. Confirm holdings or starter pack</div>
              <div className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1">3. Land on one next best action</div>
            </div>

            <div className="mt-8 space-y-6">
              <div>
                <div className="text-sm font-semibold">1) What type of execution do you want?</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-xl bg-neutral-950 px-3 py-2 text-sm font-semibold text-white"
                    aria-label="Investing"
                  >
                    <span>Investing</span>
                  </button>
                </div>
                <div className="mt-2 text-xs text-neutral-600">{modeHint(goalType)}</div>
              </div>

              <div>
                <div className="text-sm font-semibold">2) How risky can this strategy be?</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(["Conservative", "Balanced", "Aggressive"] as RiskProfile[]).map((r) => (
                    <Pill key={r} active={riskProfile === r} onClick={() => setRiskProfile(r)}>
                      {r}
                    </Pill>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <div className="text-sm font-semibold">3) Starting capital now (EUR)</div>
                  <input
                    value={startingCapitalInput}
                    onChange={(e) => setStartingCapitalInput(e.target.value)}
                    inputMode="decimal"
                    className="mt-2 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                    placeholder="5000"
                  />
                </label>

                <label className="block">
                  <div className="text-sm font-semibold">4) Monthly contribution (EUR)</div>
                  <input
                    value={monthlyContributionInput}
                    onChange={(e) => setMonthlyContributionInput(e.target.value)}
                    inputMode="decimal"
                    className="mt-2 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                    placeholder="300"
                  />
                </label>

                <label className="block">
                  <div className="text-sm font-semibold">5) Final target capital (EUR)</div>
                  <input
                    value={targetCapitalInput}
                    onChange={(e) => setTargetCapitalInput(e.target.value)}
                    inputMode="decimal"
                    className="mt-2 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                    placeholder="50000"
                  />
                </label>

                <div className="block">
                  <div className="text-sm font-semibold">6) Deadline</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {[12, 24, 36, 60, 120].map((m) => (
                      <Pill key={m} active={horizonMonths === m} onClick={() => setHorizonMonths(m)}>
                        {horizonLabel(m)}
                      </Pill>
                    ))}
                  </div>
                </div>
              </div>

              <label className="flex items-start gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3">
                <input
                  type="checkbox"
                  checked={hasExistingHoldings}
                  onChange={(e) => setHasExistingHoldings(e.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                <div>
                  <div className="text-sm font-semibold">I already have holdings</div>
                  <div className="text-xs text-neutral-600">
                    If checked, Syntrake will skip auto-creating a starter portfolio and guide you to import current positions.
                  </div>
                </div>
              </label>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">Reality check</div>
                <Badge tone={verdictTone(verdict)}>{verdictTitle(verdict)}</Badge>
              </div>

              <div className="mt-4 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-neutral-600">Assumed annual return</span>
                  <span className="font-semibold">{pct(annualReturn)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-neutral-600">Projected value ({horizonLabel(horizonMonths)})</span>
                  <span className="font-semibold">{fmtEUR(baseScenario?.finalValue || 0)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-neutral-600">Target</span>
                  <span className="font-semibold">{fmtEUR(targetCapital)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-neutral-600">Required monthly deposit</span>
                  <span className="font-semibold">{fmtEUR(requiredMonthly)}</span>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-700">
                {monthlyGap <= 0
                  ? "Your contribution level is inside the realistic range for this timeline."
                  : `To hit this target with this risk profile, increase monthly contribution by about ${fmtEUR(monthlyGap)}.`}
              </div>
            </div>

            <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">What happens right after launch</div>
                <Badge tone={shouldPrepareStarter ? "good" : "warn"}>{shouldPrepareStarter ? "Ready" : "Manual import mode"}</Badge>
              </div>

              <div className="mt-3 text-xs text-neutral-600">
                {shouldPrepareStarter
                  ? "On launch, Syntrake sends you to Portfolio where you can apply this starter allocation."
                  : "On launch, Syntrake sends you to Portfolio to import your current holdings."}
              </div>

              <div className="mt-3 space-y-2">
                {previewLoading ? (
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">Loading market opportunities...</div>
                ) : null}
                {!previewLoading && starterPreview.length === 0 ? (
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                    No starter pack generated yet.
                  </div>
                ) : null}
                {starterPreview.map((row) => (
                  <div key={row.symbol} className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-neutral-900">{row.symbol}</span>
                      <span className="text-neutral-700">{fmtEUR(row.valueEur)}</span>
                    </div>
                    <div className="mt-0.5 text-neutral-600">{row.name || "Allocation target"}</div>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-[11px] text-neutral-500">Source: {previewSource}</div>
            </div>

            <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="text-sm font-semibold">Top opportunities now</div>
              <div className="mt-3 space-y-2">
                {opportunityPreview.length === 0 ? (
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                    No high-conviction opportunities right now.
                  </div>
                ) : null}
                {opportunityPreview.map((o) => (
                  <div key={`${o.symbol}-${o.side}`} className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-neutral-900">{o.symbol}</span>
                      <Badge tone={o.side === "BUY" ? "good" : o.side === "SELL" ? "bad" : "neutral"}>{o.side}</Badge>
                    </div>
                    <div className="mt-1 text-neutral-700">{o.why}</div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>

        {status === "error" && (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onLaunch}
            disabled={status === "saving"}
            className={classNames(
              "rounded-2xl px-5 py-3 text-sm font-semibold text-white",
              status === "saving" ? "bg-neutral-400" : "bg-neutral-950 hover:bg-black"
            )}
          >
            {status === "saving" ? "Launching..." : "Get my first action"}
          </button>

          <Link
            href="/app?tab=autonomy&mode=investing&brokerSetup=1"
            className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-900 hover:bg-neutral-50"
          >
            Connect broker instead
          </Link>

          <div className="text-xs text-neutral-600">Plan now, Portfolio next, Daily action after that.</div>
        </div>
      </div>
    </main>
  );
}
