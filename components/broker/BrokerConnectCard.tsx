"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import BrokerConnectCard from "@/components/broker/BrokerConnectCard";

/**
 * DailyClient (stable, no refresh loops)
 * - Top: BrokerConnectCard
 * - Loads: user-settings, portfolio, market-regime, daily payload
 * - If goal missing -> shows a very simple "Quick Setup" (2 questions)
 * - Never uses router.refresh()
 */

type UserSettings = {
  goal_amount?: number | null;
  goal_currency?: string | null;
  goal_timeframe_months?: number | null;
  risk_profile?: string | null;
  horizon?: string | null;
  monthly_contribution?: number | null;
  language?: string | null;
};

type PortfolioItem = {
  symbol?: string;
  name?: string;
  weightPct?: number; // 0..100
  value?: number;
};

type PortfolioPayload = {
  items?: PortfolioItem[];
  updatedAt?: string;
};

type MarketRegimePayload = {
  regime?: string; // e.g. "risk_on", "risk_off"
  confidence?: number; // 0..1
  updatedAt?: string;
};

type DailyPayload = {
  headline?: string;
  note?: string;
  actionTitle?: string;
  actionBody?: string;
  actionCta?: string;
  urgency?: "Watch" | "Pro-active" | "Urgent";
  date?: string; // YYYY-MM-DD
};

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function parseNumber(input: string): number | null {
  const s = (input || "")
    .trim()
    .replaceAll(" ", "")
    .replaceAll(".", "")
    .replaceAll(",", ".");
  const m = s.match(/([0-9]+(\.[0-9]+)?)/);
  if (!m) return null;
  const val = Number(m[1]);
  if (!Number.isFinite(val) || val <= 0) return null;
  return val;
}

async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchGET<T>(url: string): Promise<{ ok: boolean; status: number; data: T | null; text?: string }> {
  try {
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, status: res.status, data: null, text: txt };
    }
    const data = await safeJson<T>(res);
    return { ok: true, status: res.status, data };
  } catch (e: any) {
    return { ok: false, status: 0, data: null, text: e?.message ?? "network_error" };
  }
}

async function postUserSettings(patch: Partial<UserSettings>) {
  const res = await fetch("/api/user-settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    return { ok: false, status: res.status, text: txt };
  }
  return { ok: true, status: res.status, text: "" };
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-border-soft bg-white px-2 py-0.5 text-[11px] font-semibold text-ink-600">
      {children}
    </span>
  );
}

function Card({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-border-soft bg-white p-5 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-ink-900">{title}</div>
          {subtitle ? <div className="mt-1 text-xs text-ink-600">{subtitle}</div> : null}
        </div>
        {right}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function SoftButton({
  children,
  onClick,
  href,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
}) {
  const cls =
    "inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-4 py-2 text-sm font-semibold text-ink-700 hover:opacity-95";
  if (href) return <Link className={cls} href={href}>{children}</Link>;
  return (
    <button className={cls} type="button" onClick={onClick}>
      {children}
    </button>
  );
}

function PrimaryButton({
  children,
  onClick,
  href,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
}) {
  const cls =
    "inline-flex w-full items-center justify-center rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50";
  if (href) return <Link className={cls} href={href}>{children}</Link>;
  return (
    <button className={cls} type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export default function DailyClient() {
  const [loading, setLoading] = useState(true);

  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioPayload | null>(null);
  const [regime, setRegime] = useState<MarketRegimePayload | null>(null);
  const [daily, setDaily] = useState<DailyPayload | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [unauth, setUnauth] = useState(false);

  const [setupStep, setSetupStep] = useState<"goal" | "timeframe" | "done">("goal");
  const [setupInput, setSetupInput] = useState("");
  const [setupBusy, setSetupBusy] = useState(false);
  const [localGoal, setLocalGoal] = useState<number | null>(null);

  const setupInputRef = useRef<HTMLInputElement | null>(null);

  async function loadAll() {
    setLoading(true);
    setError(null);
    setUnauth(false);

    const [s, p, r, d] = await Promise.all([
      fetchGET<UserSettings>("/api/user-settings"),
      fetchGET<PortfolioPayload>("/api/portfolio"),
      fetchGET<MarketRegimePayload>("/api/market-regime"),
      fetchGET<DailyPayload>("/api/daily"),
    ]);

    // If user-settings is 401, we can still show Daily/Portfolio but avoid setup writes
    if (!s.ok && s.status === 401) setUnauth(true);

    if (s.ok) setSettings(s.data ?? {});
    else setSettings(null);

    if (p.ok) setPortfolio(p.data);
    if (r.ok) setRegime(r.data);
    if (d.ok) setDaily(d.data);

    // Handle hard errors only if everything failed
    const allFailed = !p.ok && !r.ok && !d.ok && !s.ok;
    if (allFailed) setError("Failed to load data. Check your API routes and server logs.");

    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goalMissing = useMemo(() => {
    const ga = settings?.goal_amount;
    const tm = settings?.goal_timeframe_months;
    return !ga || !tm || ga <= 0 || tm <= 0;
  }, [settings]);

  useEffect(() => {
    if (!loading && goalMissing) {
      setSetupStep("goal");
      setSetupInput("");
      setLocalGoal(null);
      // focus
      setTimeout(() => setupInputRef.current?.focus(), 50);
    }
  }, [loading, goalMissing]);

  const urgencyBadge = useMemo(() => {
    const u = daily?.urgency ?? "Pro-active";
    return <Badge>{u}</Badge>;
  }, [daily?.urgency]);

  const headerDate = useMemo(() => {
    if (daily?.date) return daily.date;
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, [daily?.date]);

  async function handleSetupSend() {
    if (setupBusy) return;
    const txt = setupInput.trim();
    if (!txt) return;

    if (setupStep === "goal") {
      const val = parseNumber(txt);
      if (!val) return;
      setLocalGoal(val);
      setSetupInput("");
      setSetupStep("timeframe");
      setTimeout(() => setupInputRef.current?.focus(), 0);
      return;
    }

    if (setupStep === "timeframe") {
      const years = parseNumber(txt);
      if (!years) return;

      const goal = localGoal ?? 50000;
      const months = clamp(Math.round(years * 12), 3, 600);

      setSetupBusy(true);

      // If unauthorized, don't POST (avoid console spam)
      if (unauth) {
        setSetupBusy(false);
        setSetupStep("done");
        return;
      }

      const r = await postUserSettings({
        goal_amount: goal,
        goal_currency: settings?.goal_currency ?? "EUR",
        goal_timeframe_months: months,
        language: settings?.language ?? "en",
      });

      setSetupBusy(false);

      if (!r.ok) {
        // keep them moving; but show a small warning
        console.error("user-settings POST failed", r.status, r.text);
        setSetupStep("done");
        return;
      }

      // re-fetch settings + daily (without full reload storm)
      const s2 = await fetchGET<UserSettings>("/api/user-settings");
      if (s2.ok) setSettings(s2.data ?? {});
      const d2 = await fetchGET<DailyPayload>("/api/daily");
      if (d2.ok) setDaily(d2.data);

      setSetupStep("done");
      return;
    }
  }

  return (
    <div className="space-y-4">
      {/* Broker Connect at the top */}
      <BrokerConnectCard />

      {/* Header */}
      <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-ink-600">Daily Command Center</div>
            <div className="mt-1 text-2xl font-semibold text-ink-900">
              {daily?.headline ?? "Your Next Best Action (today)"}
            </div>
            <div className="mt-2 text-sm text-ink-600">
              {daily?.note ??
                "Open this page, do one next best action, and stop. SignalCore’s edge comes from disciplined repetition."}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            {urgencyBadge}
            <div className="text-xs text-ink-500">{headerDate}</div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <SoftButton onClick={loadAll}>Refresh</SoftButton>
          <SoftButton href="/app?tab=planning">Edit plan</SoftButton>
          <SoftButton href="/pricing">Upgrade</SoftButton>
        </div>

        {unauth && (
          <div className="mt-4 rounded-2xl border border-border-soft bg-neutral-50 p-3 text-xs text-ink-700">
            You’re not authenticated — settings updates are disabled.{" "}
            <Link href="/sign-in" className="font-semibold underline">
              Sign in
            </Link>{" "}
            to save your plan.
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-2xl border border-border-soft bg-neutral-50 p-3 text-xs text-ink-700">
            {error}
          </div>
        )}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Left: NBA */}
        <div className="xl:col-span-2 space-y-4">
          <Card
            title={daily?.actionTitle ?? "Next Best Action"}
            subtitle="One move. High signal. No noise."
            right={<Badge>{daily?.urgency ?? "Pro-active"}</Badge>}
          >
            <div className="text-sm font-semibold text-ink-900">
              {daily?.actionBody ? "" : "Ambition vs posture"}
            </div>
            <div className="mt-2 text-sm text-ink-700">
              {daily?.actionBody ??
                "Conservative plan may underfit ambition. Either relax the ambition, extend timeframe, or accept slightly more risk to match the goal."}
            </div>

            <div className="mt-4">
              <PrimaryButton href="/app?tab=execution">
                {daily?.actionCta ?? "Open Execution (candidates + rationale)"}
              </PrimaryButton>
            </div>

            <div className="mt-3 text-[11px] text-ink-500">
              Educational decision-support tool. Not financial advice. You remain responsible for outcomes.
            </div>
          </Card>

          {/* Quick Setup (only when missing goal) */}
          {goalMissing && (
            <Card
              title="Quick setup (60 seconds)"
              subtitle="Answer 2 questions. We’ll tailor Daily + Advisor to your goal."
              right={<Badge>Beginner</Badge>}
            >
              <div className="space-y-3">
                <div className="text-sm text-ink-700">
                  {setupStep === "goal" && (
                    <>
                      <div className="font-semibold text-ink-900">1) What is your goal amount?</div>
                      <div className="text-xs text-ink-600">Example: 50,000€</div>
                    </>
                  )}

                  {setupStep === "timeframe" && (
                    <>
                      <div className="font-semibold text-ink-900">2) By when do you want to reach it?</div>
                      <div className="text-xs text-ink-600">Example: 5 years</div>
                    </>
                  )}

                  {setupStep === "done" && (
                    <>
                      <div className="font-semibold text-ink-900">✅ Done.</div>
                      <div className="text-xs text-ink-600">
                        Your plan is updated. Daily + Advisor + Alerts will now work off your goal.
                      </div>
                    </>
                  )}
                </div>

                {setupStep !== "done" ? (
                  <div className="flex items-center gap-2">
                    <input
                      ref={setupInputRef}
                      value={setupInput}
                      onChange={(e) => setSetupInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSetupSend();
                      }}
                      disabled={setupBusy}
                      placeholder={setupStep === "goal" ? "Type your goal (e.g., 50000)" : "Type years (e.g., 5)"}
                      className="w-full rounded-2xl border border-border-soft bg-white px-3 py-2 text-sm outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleSetupSend}
                      disabled={setupBusy || !setupInput.trim()}
                      className="rounded-2xl bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Send
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <PrimaryButton href="/app?tab=planning">Open Planning</PrimaryButton>
                    <SoftButton href="/app?tab=advisor">Open Advisor</SoftButton>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* Right: Context */}
        <div className="space-y-4">
          <Card title="Portfolio context" subtitle="What SignalCore is working with.">
            {loading ? (
              <div className="text-xs text-ink-600">Loading…</div>
            ) : (
              <>
                <div className="text-xs text-ink-600">
                  {portfolio?.items?.length ? `${portfolio.items.length} holdings` : "No holdings detected yet."}
                </div>

                <div className="mt-3 space-y-2">
                  {(portfolio?.items ?? []).slice(0, 5).map((it, idx) => (
                    <div key={idx} className="flex items-center justify-between rounded-2xl border border-border-soft bg-neutral-50 px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-ink-900">{it.symbol ?? "—"}</div>
                        <div className="truncate text-[11px] text-ink-600">{it.name ?? ""}</div>
                      </div>
                      <div className="text-sm font-semibold text-ink-900">
                        {typeof it.weightPct === "number" ? `${it.weightPct.toFixed(1)}%` : "—"}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 text-[11px] text-ink-500">
                  If your portfolio is empty, connect a broker or add holdings in “My Portfolio”.
                </div>
              </>
            )}
          </Card>

          <Card
            title="Market regime"
            subtitle="Context-aware guidance (changes the tone + risk)."
            right={<Badge>{regime?.regime ?? "Unknown"}</Badge>}
          >
            <div className="text-xs text-ink-600">
              Confidence:{" "}
              {typeof regime?.confidence === "number"
                ? `${Math.round(regime.confidence * 100)}%`
                : "—"}
            </div>
            <div className="mt-2 text-sm text-ink-700">
              SignalCore adapts guardrails + execution pressure based on regime, so you don’t overreact.
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <SoftButton href="/app?tab=alerts">Open Alerts</SoftButton>
              <SoftButton href="/app?tab=risk">Risk (Pro)</SoftButton>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}