"use client";

import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { useUser, SignInButton } from "@clerk/nextjs";
import { usePaid, type AccessTrialState } from "@/lib/signalcore/usePaid";
import TrackedLink from "@/components/TrackedLink";
import { getCampaignData, track } from "@/lib/analytics/client";

const FOUNDING_TOTAL = 500;

type PaywallVariant = "A" | "B";
type BillingCycle = "monthly" | "annual";
type ModeValueTone = "core" | "warn" | "high";
type PricingIntent = "trial" | "checkout";
type PublicPricingSnapshot = {
  early?: {
    amount?: number | null;
    currency?: string | null;
    active?: boolean;
    remaining?: number | null;
  } | null;
  standard?: {
    amount?: number | null;
    currency?: string | null;
    active?: boolean;
  } | null;
  display?: {
    amount?: number | null;
    currency?: string | null;
    tier?: "early" | "standard" | string | null;
    earlyActive?: boolean;
    annualAvailable?: boolean;
    annualAmount?: number | null;
    annualCurrency?: string | null;
  } | null;
  meta?: {
    source?: string | null;
  } | null;
};

function formatPriceEUR(amount: number | null | undefined) {
  if (!Number.isFinite(Number(amount))) return "-";
  const n = Number(amount);
  if (Math.abs(n - Math.round(n)) < 0.001) return `${Math.round(n)}\u20AC`;
  return `${n.toFixed(2).replace(/\.00$/, "")}\u20AC`;
}

function hash32(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function getAnonSeed() {
  if (typeof window === "undefined") return "anon_default";
  const key = "sc_paywall_seed_v1";
  const saved = window.localStorage.getItem(key);
  if (saved && saved.length >= 8) return saved;
  const seed = `anon_${Date.now().toString(36)}_${Math.abs(hash32(navigator.userAgent || "ua")).toString(36)}`;
  window.localStorage.setItem(key, seed);
  return seed;
}

function variantFromSeed(seed: string): PaywallVariant {
  return hash32(seed) % 2 === 0 ? "A" : "B";
}

function pickVariant(userId?: string | null): PaywallVariant {
  if (typeof window === "undefined") return "A";
  const scopeKey = userId ? `sc_paywall_variant_user_${userId}` : "sc_paywall_variant_anon";
  const saved = window.localStorage.getItem(scopeKey);
  if (saved === "A" || saved === "B") return saved;
  const seed = userId ? `user_${userId}` : getAnonSeed();
  const variant = variantFromSeed(seed);
  window.localStorage.setItem(scopeKey, variant);
  return variant;
}

function formatDayUTC(iso?: string | null) {
  if (!iso) return null;
  const dt = new Date(iso);
  if (!Number.isFinite(dt.getTime())) return null;
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function buildAuthIntentHref(intent: PricingIntent) {
  const params = new URLSearchParams({
    intent,
    source: `pricing_${intent}`,
  });

  if (typeof window !== "undefined") {
    const returnUrl = new URL(window.location.href);
    returnUrl.searchParams.set("intent", intent);
    returnUrl.searchParams.set("source", "auth_return");
    params.set("redirect_url", `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`);
  }

  return `/sign-up?${params.toString()}`;
}

function StatusChip({
  hasProAccess,
  isBillingActive,
  trial,
}: {
  hasProAccess: boolean;
  isBillingActive: boolean;
  trial: AccessTrialState;
}) {
  const trialEnd = formatDayUTC(trial.endsAt);
  const label = isBillingActive
    ? "Status: Pro active"
    : trial.active
      ? `Status: Trial active${trialEnd ? ` (until ${trialEnd})` : ""}`
      : trial.expired
        ? "Status: Trial ended"
        : "Status: Free mode";
  const tone = isBillingActive || trial.active;

  return (
    <div
      className={[
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold",
        tone
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-border-soft bg-white text-ink-700",
      ].join(" ")}
    >
      <span className={["h-2 w-2 rounded-full", tone ? "bg-emerald-600" : "bg-ink-400"].join(" ")} />
      {hasProAccess ? label : "Status: Free mode"}
    </div>
  );
}

function PricingLaneCard({
  title,
  badge,
  tone,
  body,
  bullets,
}: {
  title: string;
  badge: string;
  tone: "free" | "discovery" | "pro";
  body: string;
  bullets: string[];
}) {
  const toneClasses =
    tone === "free"
      ? "border-emerald-200 bg-emerald-50/70"
      : tone === "discovery"
        ? "border-cyan-200 bg-cyan-50/70"
        : "border-violet-200 bg-violet-50/70";
  const badgeClasses =
    tone === "free"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : tone === "discovery"
        ? "border-cyan-200 bg-cyan-50 text-cyan-900"
        : "border-violet-200 bg-violet-50 text-violet-900";

  return (
    <div className={`rounded-3xl border p-5 shadow-soft ${toneClasses}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-ink-900">{title}</div>
          <p className="mt-2 text-sm leading-6 text-ink-700">{body}</p>
        </div>
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${badgeClasses}`}>
          {badge}
        </span>
      </div>
      <ul className="mt-4 space-y-2 text-sm text-ink-700">
        {bullets.map((bullet) => (
          <li key={bullet} className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-ink-900" />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Pricing() {
  const { user, isLoaded, isSignedIn } = useUser();
  const { isPaid: hasProAccess, isBillingActive, trial, loadingPaid } = usePaid();

  const [loading, setLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [startingTrial, setStartingTrial] = useState(false);
  const [syncingSession, setSyncingSession] = useState(false);
  const [sessionSyncDone, setSessionSyncDone] = useState(false);
  const [forcePaid, setForcePaid] = useState(false);
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);
  const [checkoutCanceled, setCheckoutCanceled] = useState(false);
  const [checkoutSessionId, setCheckoutSessionId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [variant, setVariant] = useState<PaywallVariant>("A");
  const [variantReady, setVariantReady] = useState(false);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [portfolioSizeUsd, setPortfolioSizeUsd] = useState<number>(50000);
  const [avoidableDragPct, setAvoidableDragPct] = useState<number>(1.5);
  const [pricingSnapshot, setPricingSnapshot] = useState<PublicPricingSnapshot | null>(null);
  const [intentResumeStarted, setIntentResumeStarted] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/pricing", { method: "GET", cache: "no-store" });
        const data = (await res.json().catch(() => null)) as PublicPricingSnapshot | null;
        if (!alive || !res.ok || !data || typeof data !== "object") return;
        setPricingSnapshot(data);
      } catch {
        // non-blocking: fallback UI values below
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const foundingRemaining = useMemo(() => {
    const raw = pricingSnapshot?.early?.remaining;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(FOUNDING_TOTAL, Math.floor(n)));
  }, [pricingSnapshot]);
  const accessNow = hasProAccess || forcePaid;
  const showManage = !loadingPaid && isBillingActive;
  const canStartTrial = !accessNow && !trial.started;
  const trialExpired = !accessNow && trial.expired;
  const trialUrgency = useMemo(() => {
    if (!trial.active) return null as null | { tone: "good" | "warn" | "bad"; message: string };
    const d = Math.max(1, Number(trial.remainingDays || 1));
    const end = formatDayUTC(trial.endsAt);
    if (d <= 1) {
      return {
        tone: "bad",
        message: `Trial ends in less than 24h${end ? ` (${end} UTC)` : ""}. Upgrade now to avoid interruption.`,
      };
    }
    if (d <= 3) {
      return {
        tone: "warn",
        message: `Trial ends in ${d} days${end ? ` (${end} UTC)` : ""}. Upgrade now to keep Pro active.`,
      };
    }
    return {
      tone: "good",
      message: `Trial active: ${d} days left${end ? ` (until ${end} UTC)` : ""}.`,
    };
  }, [trial.active, trial.remainingDays, trial.endsAt]);

  useEffect(() => {
    if (!isLoaded) return;
    const id = isSignedIn && user?.id ? user.id : null;
    setVariant(pickVariant(id));
    setVariantReady(true);
  }, [isLoaded, isSignedIn, user?.id]);

  useEffect(() => {
    if (!variantReady) return;
    track("pricing_view", { page: "pricing", variant });
  }, [variant, variantReady]);

  async function logConversionEvent(event: string, details: Record<string, unknown> = {}) {
    try {
      const visitorId = !isSignedIn ? getAnonSeed() : null;
      await fetch("/api/conversion/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event,
          source: "pricing",
          ...(visitorId ? { visitorId } : {}),
          details: {
            variant,
            billingCycle,
            ...details,
          },
        }),
      });
    } catch {
      // non-blocking
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const params = url.searchParams;
    const success = params.get("success") === "1";
    const canceled = params.get("canceled") === "1";
    const sessionId = params.get("session_id") || "";

    setCheckoutSuccess(success);
    setCheckoutCanceled(canceled);
    setCheckoutSessionId(sessionId);

    if (success || canceled || sessionId) {
      params.delete("success");
      params.delete("canceled");
      params.delete("session_id");
      const next = `${url.pathname}${params.toString() ? `?${params.toString()}` : ""}${url.hash || ""}`;
      window.history.replaceState({}, "", next);
    }
  }, []);

  useEffect(() => {
    if (!isLoaded || !variantReady) return;
    const viewerKey = isSignedIn && user?.id ? `user:${user.id}` : `anon:${getAnonSeed()}`;
    const storageKey = `sc_paywall_open_logged_v1:${viewerKey}`;
    if (typeof window !== "undefined" && window.sessionStorage.getItem(storageKey) === "1") return;
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(storageKey, "1");
    }
    void logConversionEvent("paywall_open", { page: "pricing" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, user?.id, variantReady]);

  useEffect(() => {
    if (!checkoutSuccess || !checkoutSessionId) return;
    if (!isLoaded || !isSignedIn || !user) return;
    if (sessionSyncDone) return;

    let alive = true;

    (async () => {
      try {
        setSyncingSession(true);
        const res = await fetch("/api/stripe/sync-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: checkoutSessionId }),
        });
        const data = await res.json().catch(() => ({}));

        if (!alive) return;

        if (res.ok && data?.ok) {
          if (data?.isPaid) {
            setForcePaid(true);
            track("checkout_sync_success", { page: "pricing", variant, billingCycle });
          } else {
            track("checkout_sync_pending", { page: "pricing", variant, billingCycle, status: data?.status || null });
          }
        } else {
          track("checkout_sync_error", { page: "pricing", variant, billingCycle, status: res.status });
        }
      } catch {
        if (!alive) return;
        track("checkout_sync_error", { page: "pricing", variant, billingCycle, reason: "exception" });
      } finally {
        if (!alive) return;
        setSyncingSession(false);
        setSessionSyncDone(true);
      }
    })();

    return () => {
      alive = false;
    };
  }, [checkoutSuccess, checkoutSessionId, isLoaded, isSignedIn, user, sessionSyncDone, variant, billingCycle]);

  async function goCheckout() {
    setError(null);
    setCheckoutSuccess(false);
    setCheckoutCanceled(false);
    setCheckoutSessionId("");
    setSessionSyncDone(false);
    if (!isLoaded) return;

    if (!isSignedIn || !user) {
      track("checkout_blocked_unsigned", { page: "pricing", variant, billingCycle });
      window.location.href = buildAuthIntentHref("checkout");
      return;
    }

    const email = user.primaryEmailAddress?.emailAddress;
    if (!email) {
      setError("We could not find your email address.");
      track("checkout_blocked_no_email", { page: "pricing", variant, billingCycle });
      return;
    }
    if (billingCycle === "annual" && !annualAvailable) {
      setError("Annual billing is not active yet. Use monthly billing for now.");
      track("checkout_blocked_billing_cycle_unavailable", { page: "pricing", variant, billingCycle });
      return;
    }

    try {
      setLoading(true);
      const campaign = getCampaignData();
      track("checkout_start", {
        page: "pricing",
        variant,
        billingCycle,
        user_id: user.id,
        ref: campaign?.ref || null,
        utm_source: campaign?.utm_source || null,
      });
      void logConversionEvent("checkout_start", {
        page: "pricing",
        user_id: user.id,
      });

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, email, variant, billingCycle, campaign }),
      });

      const data = await res.json();
      if (!res.ok || !data?.url) {
        setError(data?.message || data?.error || "Checkout failed.");
        setLoading(false);
        track("checkout_error", { page: "pricing", variant, billingCycle, status: res.status });
        return;
      }

      window.location.href = data.url;
    } catch {
      setError("Checkout failed.");
      setLoading(false);
      track("checkout_error", { page: "pricing", variant, billingCycle, reason: "exception" });
    }
  }

  async function openCustomerPortal() {
    setError(null);
    if (!isLoaded || !isSignedIn || !user) return;

    try {
      setPortalLoading(true);
      track("portal_open_start", { page: "pricing", user_id: user.id });

      const res = await fetch("/api/stripe/customer-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnUrl: "/app" }),
      });
      const data = await res.json();
      if (!res.ok || !data?.url) {
        setError(data?.error || "Could not open customer portal.");
        setPortalLoading(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Could not open customer portal.");
      setPortalLoading(false);
    }
  }

  async function startTrial() {
    setError(null);
    if (!isLoaded) return;
    if (!isSignedIn || !user) {
      track("trial_blocked_unsigned", { page: "pricing", variant });
      window.location.href = buildAuthIntentHref("trial");
      return;
    }

    try {
      setStartingTrial(true);
      track("trial_start_click", { page: "pricing", variant, billingCycle, user_id: user.id });
      void logConversionEvent("trial_start_click", { page: "pricing", user_id: user.id });

      const res = await fetch("/api/trial/start", { method: "POST" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        if (res.status === 409 && data?.error === "trial_already_used") {
          setError("Your free trial has already been used. Upgrade to continue with Pro.");
          track("trial_start_blocked_used", { page: "pricing", variant, billingCycle });
          return;
        }
        setError(data?.message || data?.error || "Could not start trial.");
        track("trial_start_error", { page: "pricing", variant, billingCycle, status: res.status });
        return;
      }

      track("trial_start_success", { page: "pricing", variant, billingCycle });
      window.location.href = "/app?tab=daily&source=trial_start";
    } catch {
      setError("Could not start trial.");
      track("trial_start_error", { page: "pricing", variant, billingCycle, reason: "exception" });
    } finally {
      setStartingTrial(false);
    }
  }

  const monthlyEarlyPrice = Number(pricingSnapshot?.early?.amount);
  const monthlyStandardPrice = Number(pricingSnapshot?.standard?.amount);
  const displayMonthlyPrice = Number(pricingSnapshot?.display?.amount);
  const displayAnnualPrice = Number(pricingSnapshot?.display?.annualAmount);
  const displayTier = String(pricingSnapshot?.display?.tier || "").toLowerCase() === "early" ? "early" : "standard";
  const earlyOfferActive =
    typeof pricingSnapshot?.display?.earlyActive === "boolean"
      ? Boolean(pricingSnapshot?.display?.earlyActive)
      : foundingRemaining == null
        ? true
        : foundingRemaining > 0;
  const monthlyPrice = Number.isFinite(displayMonthlyPrice)
    ? displayMonthlyPrice
    : earlyOfferActive && Number.isFinite(monthlyEarlyPrice)
      ? monthlyEarlyPrice
      : Number.isFinite(monthlyStandardPrice)
        ? monthlyStandardPrice
        : 19;
  const annualAvailable =
    Boolean(pricingSnapshot?.display?.annualAvailable) && Number.isFinite(displayAnnualPrice);
  const standardMonthlyPrice = Number.isFinite(monthlyStandardPrice) ? monthlyStandardPrice : 29;
  const annualPrice = annualAvailable && Number.isFinite(displayAnnualPrice) ? displayAnnualPrice : monthlyPrice * 12;
  const annualSavings = annualAvailable ? Math.max(0, monthlyPrice * 12 - annualPrice) : 0;

  const priceCopy =
    billingCycle === "annual" && annualAvailable
      ? { headline: formatPriceEUR(annualPrice), suffix: "/ year", helper: "Billed annually" }
      : {
          headline: formatPriceEUR(monthlyPrice),
          suffix: "/ month",
          helper: displayTier === "early" && earlyOfferActive ? "Early access pricing live now" : "Cancel anytime",
        };

  useEffect(() => {
    if (billingCycle === "annual" && !annualAvailable) {
      setBillingCycle("monthly");
    }
  }, [annualAvailable, billingCycle]);

  const resumePricingIntent = useEffectEvent((intent: PricingIntent) => {
    if (intent === "trial" && canStartTrial) {
      void startTrial();
      return;
    }

    void goCheckout();
  });

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user || intentResumeStarted || loadingPaid) {
      return;
    }
    if (typeof window === "undefined") return;

    const currentUrl = new URL(window.location.href);
    const intent = String(currentUrl.searchParams.get("intent") || "").trim().toLowerCase();

    if (intent !== "trial" && intent !== "checkout") {
      return;
    }

    setIntentResumeStarted(true);
    currentUrl.searchParams.delete("intent");
    currentUrl.searchParams.delete("source");
    window.history.replaceState(null, "", `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);

    resumePricingIntent(intent);
  }, [
    intentResumeStarted,
    isLoaded,
    isSignedIn,
    loadingPaid,
    user,
  ]);

  const valueModel = useMemo(() => {
    const portfolio = Math.max(1000, Math.min(10000000, Number.isFinite(portfolioSizeUsd) ? portfolioSizeUsd : 50000));
    const dragPct = Math.max(0, Math.min(10, Number.isFinite(avoidableDragPct) ? avoidableDragPct : 1.5));
    const annualDragCost = portfolio * (dragPct / 100);
    const breakEvenPct = (annualPrice / portfolio) * 100;
    const netPotential = annualDragCost - annualPrice;
    return { portfolio, dragPct, annualDragCost, breakEvenPct, netPotential };
  }, [portfolioSizeUsd, avoidableDragPct, annualPrice]);

  const money = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }),
    []
  );
  const monthlyBreakEvenPct = (monthlyPrice / valueModel.portfolio) * 100;

  const modeValueCards = useMemo(
    () =>
      [
        {
          key: "investing",
          title: "Investing",
          tone: "core" as ModeValueTone,
          riskLabel: "Free forever",
          whyPay: [
            "Goal-led planning, Daily, Portfolio, Advisor, and Autonomy stay open for free.",
            "The free layer is meant to prove value early instead of hiding everything behind a paywall.",
            "Users can build discipline and confidence before paying for trading depth.",
          ],
          edge: [
            "The free investing loop grows trust because the product works before it asks for money.",
            "That makes Trading Pro feel like a depth upgrade, not a ransom gate.",
          ],
          example:
            "Example: build a goal, tighten allocation, and remove leaks for months without paying anything.",
        },
        {
          key: "trading",
          title: "Trading",
          tone: "warn" as ModeValueTone,
          riskLabel: "Depth unlock",
          whyPay: [
            "Free users get the Desk and Opportunities in discovery mode.",
            "Trial and Pro unlock Execution, Risk, Journal, Alerts, and deeper trading continuity.",
            "This is where the recurring value lives: better execution, cleaner discipline, and stronger memory.",
          ],
          edge: [
            "Same setup quality becomes more valuable when execution mistakes, risk leaks, and shallow history are reduced.",
            `Break-even for annual plan on a ${money.format(valueModel.portfolio)} portfolio is only ${valueModel.breakEvenPct.toFixed(2)}% drag reduction.`,
          ],
          example:
            "Example: open the desk for free, inspect today's flow, then upgrade when you want sizing, invalidation, alerts, and journal-grade continuity.",
        },
      ] as const,
    [money, valueModel.breakEvenPct, valueModel.portfolio]
  );

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(216,232,255,0.7),transparent_34%),linear-gradient(180deg,#f7f9fc_0%,#eef3fb_42%,#f7f9fc_100%)] text-ink-900">
      <section className="mx-auto max-w-6xl px-4 py-14 md:py-20">
        <div className="rounded-3xl border border-border-soft bg-white/95 p-8 shadow-card">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold text-ink-500">Pricing</p>
              <h1 className="mt-2 text-4xl font-semibold tracking-tight md:text-5xl">
                Start free. Pay when broker-ready depth is worth it.
              </h1>
              <p className="mt-4 text-ink-700">
                The free layer lets you inspect the product. Trading Pro is for the expensive moment:
                live Trade/Wait decisions, trigger and invalidation, stale-data blocking, broker checklists,
                alerts, and a journal that remembers what happened after execution.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                {accessNow ? (
                  <TrackedLink
                    href="/app?mode=trading&tab=trading"
                    eventName="cta_click"
                    eventData={{ location: "pricing_hero", target: "open_trading" }}
                    className="inline-flex items-center justify-center rounded-2xl bg-ink-900 px-6 py-3 text-sm font-semibold text-white shadow-soft hover:bg-ink-800"
                  >
                    Open Trading Desk
                  </TrackedLink>
                ) : (
                  <button
                    type="button"
                    onClick={canStartTrial ? startTrial : goCheckout}
                    disabled={loadingPaid || loading || startingTrial}
                    className="inline-flex items-center justify-center rounded-2xl bg-ink-900 px-6 py-3 text-sm font-semibold text-white shadow-soft hover:bg-ink-800 disabled:opacity-60"
                  >
                    {loadingPaid
                      ? "Checking membership..."
                      : startingTrial
                        ? "Starting trial..."
                        : loading
                          ? "Redirecting..."
                          : canStartTrial
                            ? "Start 7-day Pro trial"
                            : "Unlock broker-ready depth"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={goCheckout}
                  disabled={loadingPaid || loading || startingTrial}
                  className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50 disabled:opacity-60"
                >
                  {loading ? "Redirecting..." : "Subscribe monthly"}
                </button>
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-2">
                <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-border-soft bg-white px-3 py-1 text-xs font-semibold text-ink-700">
                  <span className="h-2 w-2 rounded-full bg-signal-700" />
                  {earlyOfferActive ? (
                    <>
                      Early access pricing live:
                      <span className="text-ink-900">
                        {formatPriceEUR(Number.isFinite(monthlyEarlyPrice) ? monthlyEarlyPrice : 19)}/month
                      </span>
                      <span className="text-ink-500">then {formatPriceEUR(standardMonthlyPrice)}/month</span>
                      <span className="ml-1 rounded-full border border-border-soft bg-canvas-50 px-2 py-0.5 text-[11px] font-semibold text-ink-700">
                        {foundingRemaining !== null ? `${foundingRemaining} spots left` : "Limited spots"}
                      </span>
                    </>
                  ) : (
                    <>
                      Standard pricing live:
                      <span className="text-ink-900">{formatPriceEUR(standardMonthlyPrice)}/month</span>
                    </>
                  )}
                </div>
                {!loadingPaid ? <StatusChip hasProAccess={accessNow} isBillingActive={isBillingActive} trial={trial} /> : null}
              </div>
              {trialUrgency ? (
                <div
                  className={`mt-3 rounded-2xl border px-3 py-2 text-xs font-semibold ${
                    trialUrgency.tone === "bad"
                      ? "border-rose-200 bg-rose-50 text-rose-900"
                      : trialUrgency.tone === "warn"
                        ? "border-amber-200 bg-amber-50 text-amber-900"
                        : "border-emerald-200 bg-emerald-50 text-emerald-900"
                  }`}
                >
                  {trialUrgency.message}
                </div>
              ) : null}
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-border-soft bg-canvas-50 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500">Current baseline</div>
                  <div className="mt-2 text-xl font-semibold text-ink-900">PF 1.69</div>
                  <p className="mt-1 text-xs leading-5 text-ink-600">243 trades, 44.44% WR, +0.20R expectancy. Research snapshot, not a promise.</p>
                </div>
                <div className="rounded-2xl border border-border-soft bg-canvas-50 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500">Crisis filter</div>
                  <div className="mt-2 text-xl font-semibold text-amber-700">Still strict</div>
                  <p className="mt-1 text-xs leading-5 text-ink-600">Crisis mode is weak today, so the value is knowing when not to force trades.</p>
                </div>
                <div className="rounded-2xl border border-border-soft bg-canvas-50 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500">Broker use</div>
                  <div className="mt-2 text-xl font-semibold text-ink-900">Manual control</div>
                  <p className="mt-1 text-xs leading-5 text-ink-600">Syntrake prepares the plan. You keep custody, broker choice, and execution control.</p>
                </div>
              </div>
            </div>
            <aside className="space-y-4">
              <TrackedLink
                href="/trust"
                eventName="cta_click"
                eventData={{ location: "pricing_header", target: "trust_center" }}
                className="hidden w-full items-center justify-center rounded-2xl border border-border-soft bg-white px-4 py-2 text-sm font-semibold text-ink-900 hover:bg-canvas-50 sm:inline-flex"
              >
                Trust center
              </TrackedLink>
              <div className="rounded-3xl border border-ink-900/10 bg-ink-900 p-5 text-white shadow-soft">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100/55">
                  Subscription test
                </div>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                  Pay only if it changes the broker click.
                </h2>
                <div className="mt-5 space-y-3 text-sm leading-6">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200/70">Worth paying for</div>
                    <p className="mt-2 text-white/74">Freshness gate, trigger, invalidation, risk cap, broker checklist, alerts, and proof memory.</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200/70">Not worth paying for</div>
                    <p className="mt-2 text-white/74">Profit guarantees, automatic execution, or blind signal-chasing. Syntrake should not sell that.</p>
                  </div>
                  <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/70">Break-even lens</div>
                    <p className="mt-2 text-white/78">
                      On a {money.format(valueModel.portfolio)} portfolio, one month at {formatPriceEUR(monthlyPrice)} is about{" "}
                      <span className="font-semibold text-white">{monthlyBreakEvenPct.toFixed(3)}%</span> of capital.
                    </p>
                  </div>
                </div>
              </div>
            </aside>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            <PricingLaneCard
              title="Investing"
              badge="Free forever"
              tone="free"
              body="For planning, allocation, portfolio integrity, and calmer long-term capital decisions before any paywall pressure."
              bullets={[
                "Daily, Plan, Portfolio, Advisor, and Autonomy stay open",
                "Designed to prove value before asking for money",
                "Best for users who want clarity before speed",
              ]}
            />
            <PricingLaneCard
              title="Trading Discovery"
              badge="Free entry"
              tone="discovery"
              body="For opening the desk, seeing opportunity flow, and deciding whether the execution layer deserves your attention."
              bullets={[
                "Desk and Opportunities remain visible in free mode",
                "Discovery stays lighter by design: less depth, less history, fewer execution tools",
                "Best for deciding if the Trade/Wait workflow is worth it",
              ]}
            />
            <PricingLaneCard
              title="Trading Pro"
              badge="Depth unlock"
              tone="pro"
              body="For cleaner pre-broker decisions: trade, wait, reduce risk, or verify before acting."
              bullets={[
                "Execution, Risk, Journal, Alerts, and live verification",
                "Instruments become broker-ready only when the gate allows it",
                "Best for users who want fewer unforced errors under pressure",
              ]}
            />
          </div>

          <div className="mt-8 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setBillingCycle("monthly");
                track("billing_cycle_change", { page: "pricing", billingCycle: "monthly", variant });
              }}
              className={`rounded-2xl px-4 py-2 text-sm font-semibold ${billingCycle === "monthly" ? "bg-ink-900 text-white" : "border border-border-soft bg-white text-ink-900"}`}
            >
              Monthly
            </button>
            <button
              type="button"
              disabled={!annualAvailable}
              onClick={() => {
                if (!annualAvailable) return;
                setBillingCycle("annual");
                track("billing_cycle_change", { page: "pricing", billingCycle: "annual", variant });
              }}
              className={`rounded-2xl px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${billingCycle === "annual" ? "bg-ink-900 text-white" : "border border-border-soft bg-white text-ink-900"}`}
            >
              {annualAvailable ? `Annual (save ${money.format(annualSavings)})` : "Annual billing inactive"}
            </button>
            <span className="inline-flex items-center rounded-2xl border border-border-soft bg-canvas-50 px-3 py-2 text-xs font-semibold text-ink-700">
              {earlyOfferActive ? "Early access pricing" : "Standard pricing"}
            </span>
            {!annualAvailable ? (
              <span className="inline-flex items-center rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                Monthly checkout is live now. Annual billing opens once annual Stripe pricing is enabled.
              </span>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-ink-700">
            <span className="rounded-full border border-border-soft bg-white px-3 py-1.5">No custody lock-in</span>
            <span className="rounded-full border border-border-soft bg-white px-3 py-1.5">Use your external broker</span>
            <span className="rounded-full border border-border-soft bg-white px-3 py-1.5">Cancel anytime</span>
            <span className="rounded-full border border-border-soft bg-white px-3 py-1.5">Process edge, not profit promises</span>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-4">
            {[
              {
                label: "1. Decide",
                title: "Trade, Wait, or Reduce Risk",
                body: "The paid layer is built around the pre-broker decision, not endless signal noise.",
              },
              {
                label: "2. Verify",
                title: "Freshness and regime checks",
                body: "Open markets should not look executable when live data is stale or the regime is hostile.",
              },
              {
                label: "3. Execute",
                title: "Broker-ready checklist",
                body: "If action is allowed, you get the practical steps to carry into eToro, XTB, or another broker.",
              },
              {
                label: "4. Remember",
                title: "Journal and alerts",
                body: "The value compounds when Syntrake remembers the decision, the proof, and what changed after it.",
              },
            ].map((card) => (
              <div key={card.label} className="rounded-3xl border border-border-soft bg-canvas-50 p-5 shadow-soft">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500">{card.label}</div>
                <div className="mt-2 text-lg font-semibold tracking-tight text-ink-900">{card.title}</div>
                <p className="mt-2 text-sm leading-6 text-ink-700">{card.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-border-soft bg-white p-8 shadow-soft">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">Syntrake Trading Pro</h2>
                  <p className="mt-2 text-sm text-ink-600">
                    {earlyOfferActive
                      ? `Early access pricing is live at ${formatPriceEUR(Number.isFinite(monthlyEarlyPrice) ? monthlyEarlyPrice : 19)}/month while spots remain.`
                      : `Standard plan ${formatPriceEUR(standardMonthlyPrice)}/month.`}
                  </p>
                </div>
                <div className="rounded-2xl border border-border-soft bg-canvas-50 px-3 py-1 text-xs font-semibold text-ink-700">
                  {earlyOfferActive ? "Early access" : "Standard"}
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-border-soft bg-canvas-50 p-5">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-ink-500">{billingCycle === "annual" && annualAvailable ? "Annual" : "Monthly"}</div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-4xl font-semibold">{priceCopy.headline}</span>
                      <span className="text-sm text-ink-500">{priceCopy.suffix}</span>
                    </div>
                    {billingCycle === "monthly" || !annualAvailable ? (
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                        {earlyOfferActive ? (
                          <>
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-800">
                              Early access: {formatPriceEUR(Number.isFinite(monthlyEarlyPrice) ? monthlyEarlyPrice : 19)}/month
                            </span>
                            <span className="text-ink-500">
                              <span className="line-through">{formatPriceEUR(standardMonthlyPrice)}/month</span> standard
                            </span>
                          </>
                        ) : (
                          <span className="text-ink-600">Standard price: {formatPriceEUR(standardMonthlyPrice)}/month</span>
                        )}
                      </div>
                    ) : null}
                    {!annualAvailable ? (
                      <div className="mt-2 text-xs text-ink-500">
                        Annual billing is not active yet, so checkout is monthly only.
                      </div>
                    ) : null}
                  </div>
                  <div className="text-right text-xs text-ink-600">{priceCopy.helper}</div>
                </div>
              </div>

              <ul className="mt-6 space-y-3 text-sm text-ink-700">
                <li>- Investing free forever: Daily, Plan, Portfolio, Advisor, and Autonomy</li>
                <li>- Trading Discovery free: Desk + Opportunities preview</li>
                <li>- Pro: Trade/Wait gate, Execution, Risk, Journal, Alerts, and live verification</li>
                <li>- Manual broker playbooks for eToro, XTB, or a generic broker flow</li>
                <li>- Deeper continuity, proof capture, history, and discipline stack</li>
              </ul>

              {showManage ? (
                <div className="mt-8 space-y-2">
                  <button
                    type="button"
                    onClick={openCustomerPortal}
                    disabled={portalLoading}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft disabled:opacity-60"
                  >
                    {portalLoading ? "Opening portal..." : "Manage subscription"}
                  </button>
                  <TrackedLink
                    href="/app"
                    eventName="cta_click"
                    eventData={{ location: "pricing_manage", target: "app" }}
                    className="inline-flex w-full items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
                  >
                    Go to app
                  </TrackedLink>
                </div>
              ) : accessNow ? (
                <div className="mt-8 space-y-2">
                  <TrackedLink
                    href="/app"
                    eventName="cta_click"
                    eventData={{ location: "pricing_trial_active", target: "app" }}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft"
                  >
                    Open Syntrake Pro
                  </TrackedLink>
                  <button
                    onClick={goCheckout}
                    disabled={loading || loadingPaid}
                    className="inline-flex w-full items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50 disabled:opacity-60"
                  >
                    {loading ? "Redirecting..." : "Upgrade now to keep Pro after trial"}
                  </button>
                </div>
              ) : (
                <>
                  {canStartTrial ? (
                    <button
                      onClick={startTrial}
                      disabled={startingTrial || loadingPaid}
                      className="mt-8 inline-flex w-full items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50 disabled:opacity-60"
                    >
                      {startingTrial ? "Starting trial..." : "Start 7-day Pro trial"}
                    </button>
                  ) : null}
                  <button
                    onClick={goCheckout}
                    disabled={loading || loadingPaid || startingTrial}
                    className={`${canStartTrial ? "mt-2" : "mt-8"} inline-flex w-full items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft disabled:opacity-60`}
                  >
                    {loadingPaid ? "Checking membership..." : loading ? "Redirecting..." : "Unlock broker-ready depth"}
                  </button>
                  <div className="mt-2 text-center text-xs text-ink-600">
                    {earlyOfferActive ? (
                      <>
                        Early access: <span className="font-semibold text-ink-900">{formatPriceEUR(Number.isFinite(monthlyEarlyPrice) ? monthlyEarlyPrice : 19)}/month</span>
                        {" / "}
                        <span className="text-ink-500">standard {formatPriceEUR(standardMonthlyPrice)}/month afterwards</span>
                      </>
                    ) : (
                      <>
                        Standard price: <span className="font-semibold text-ink-900">{formatPriceEUR(standardMonthlyPrice)}/month</span>
                      </>
                    )}
                  </div>
                  {trialExpired ? <p className="mt-3 text-center text-xs text-amber-700">Trial already used. Upgrade to continue with Pro.</p> : null}
                  {!isSignedIn && (
                    <div className="mt-3 text-center">
                      <SignInButton mode="modal">
                        <button
                          className="text-sm font-semibold text-signal-700 underline underline-offset-4"
                          onClick={() => track("signin_modal_open", { page: "pricing", variant })}
                        >
                          Sign in to continue
                        </button>
                      </SignInButton>
                    </div>
                  )}
                </>
              )}

              {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}
              {checkoutSuccess && !error ? (
                <p className="mt-3 text-center text-sm text-emerald-700">
                  {syncingSession ? "Payment received. Syncing Pro access..." : "Payment received. Pro access is being confirmed."}
                </p>
              ) : null}
              {checkoutCanceled ? (
                <p className="mt-3 text-center text-sm text-amber-700">Checkout canceled. You can restart anytime.</p>
              ) : null}
              <p className="mt-4 text-center text-xs text-ink-500">
                Educational decision-support tool. Not financial advice. Investing involves risk.
              </p>
              <p className="mt-2 text-center text-xs text-ink-600">
                Questions before subscribing?{" "}
                <a href="mailto:support@syntrake.com" className="underline underline-offset-2">
                  support@syntrake.com
                </a>
              </p>
            </div>

            <div className="space-y-5">
              <div className="rounded-3xl border border-border-soft bg-canvas-50 p-6 shadow-soft">
                <div className="text-xs font-semibold text-ink-500">Decision-drag calculator (illustrative)</div>
                <p className="mt-2 text-sm text-ink-700">
                  Estimate the break-even point if Syntrake helps reduce avoidable decision drag, missed risk checks,
                  or messy broker execution.
                </p>

                <div className="mt-4 grid gap-3">
                  <label className="text-xs font-semibold text-ink-600">
                    Portfolio size (USD)
                    <input
                      type="number"
                      min={1000}
                      step={1000}
                      value={portfolioSizeUsd}
                      onChange={(e) => setPortfolioSizeUsd(Number(e.target.value || 0))}
                      className="mt-1 w-full rounded-xl border border-border-soft bg-white px-3 py-2 text-sm text-ink-900"
                    />
                  </label>
                  <label className="text-xs font-semibold text-ink-600">
                    Avoidable drag (% / year)
                    <input
                      type="number"
                      min={0}
                      max={10}
                      step={0.1}
                      value={avoidableDragPct}
                      onChange={(e) => setAvoidableDragPct(Number(e.target.value || 0))}
                      className="mt-1 w-full rounded-xl border border-border-soft bg-white px-3 py-2 text-sm text-ink-900"
                    />
                  </label>
                </div>

                <div className="mt-4 rounded-2xl border border-border-soft bg-white p-4 text-sm text-ink-700">
                  <div className="flex items-center justify-between gap-3">
                    <span>Estimated annual drag</span>
                    <span className="font-semibold text-ink-900">{money.format(valueModel.annualDragCost)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span>{annualAvailable ? "Syntrake annual cost" : "12 months at monthly price"}</span>
                    <span className="font-semibold text-ink-900">{formatPriceEUR(annualPrice)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span>Break-even drag reduction</span>
                    <span className="font-semibold text-ink-900">{valueModel.breakEvenPct.toFixed(2)}%</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span>Potential net value</span>
                    <span className={`font-semibold ${valueModel.netPotential >= 0 ? "text-emerald-700" : "text-amber-700"}`}>
                      {valueModel.netPotential >= 0 ? "+" : ""}
                      {money.format(valueModel.netPotential)}
                    </span>
                  </div>
                </div>

                <p className="mt-3 text-xs text-ink-500">
                  Illustrative only. Real outcomes depend on market behavior, execution quality, and risk profile.
                </p>
              </div>

              <div className="rounded-3xl border border-border-soft bg-canvas-50 p-6 shadow-soft">
                <div className="text-xs font-semibold text-ink-500">What should improve in your first 7 days</div>
                <ul className="mt-3 space-y-2 text-sm text-ink-700">
                  <li>- Know where the product says TRADE, WAIT, or REDUCE RISK</li>
                  <li>- See the first daily action queue instead of guessing what matters now</li>
                  <li>- Run freshness and risk checks before execution, not after damage is done</li>
                  <li>- Execute one checklist in your broker and verify the result back inside Syntrake</li>
                </ul>
              </div>
              <div className="rounded-3xl border border-border-soft bg-canvas-50 p-6 shadow-soft">
                <div className="text-xs font-semibold text-ink-500">Using eToro, XTB, or another external broker?</div>
                <ul className="mt-3 space-y-2 text-sm text-ink-700">
                  <li>- Get order-by-order checklists with action, target value, and quantity hint</li>
                  <li>- Execute outside Syntrake only when the decision gate allows it</li>
                  <li>- Return and refresh Daily to validate risk posture after the broker step</li>
                </ul>
                <TrackedLink
                  href="/how-it-works"
                  eventName="cta_click"
                  eventData={{ location: "pricing_side", target: "how_it_works_compare" }}
                  className="mt-4 inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-4 py-2 text-xs font-semibold text-ink-900 hover:bg-canvas-50"
                >
                  See manual execution workflow
                </TrackedLink>
              </div>
              <div className="rounded-3xl border border-border-soft bg-canvas-50 p-6 shadow-soft">
                <div className="text-xs font-semibold text-ink-500">Trust and safety</div>
                <ul className="mt-3 space-y-2 text-sm text-ink-700">
                  <li>- Stripe billing + self-serve portal</li>
                  <li>- Clerk authentication</li>
                  <li>- Transparent legal and risk disclosures</li>
                  <li>- Support: support@syntrake.com</li>
                </ul>
                <TrackedLink
                  href="/trust"
                  eventName="cta_click"
                  eventData={{ location: "pricing_side", target: "trust_center" }}
                  className="mt-4 inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-4 py-2 text-xs font-semibold text-ink-900 hover:bg-canvas-50"
                >
                  Open trust center
                </TrackedLink>
              </div>
            </div>
          </div>

          {false ? (
          <div className="mt-8 rounded-3xl border border-border-soft bg-white p-6 shadow-soft md:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-3xl">
                <div className="text-xs font-semibold text-ink-500">Why the paid layer exists</div>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink-900">
                  Syntrake should feel generous before it feels premium, and premium before it feels expensive.
                </h2>
                <p className="mt-3 text-sm text-ink-700">
                  Investing stays open to build trust. The paid layer exists for the expensive part of the workflow:
                  live trading decisions, stale-data avoidance, risk gates, broker execution, alerts, and continuity.
                </p>
              </div>
              <div className="rounded-2xl border border-border-soft bg-canvas-50 px-3 py-2 text-xs font-semibold text-ink-700">
                No profit promises. Process edge only.
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {modeValueCards.map((card) => {
                const toneClasses =
                  card.tone === "core"
                    ? "border-emerald-200 bg-emerald-50/50"
                    : card.tone === "warn"
                      ? "border-amber-200 bg-amber-50/50"
                      : "border-rose-200 bg-rose-50/50";
                const chipClasses =
                  card.tone === "core"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : card.tone === "warn"
                      ? "border-amber-200 bg-amber-50 text-amber-900"
                      : "border-rose-200 bg-rose-50 text-rose-900";

                return (
                  <div key={card.key} className={`rounded-2xl border p-4 ${toneClasses}`}>
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-ink-900">{card.title}</h3>
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${chipClasses}`}>
                        {card.riskLabel}
                      </span>
                    </div>

                    <div className="mt-3 rounded-xl border border-border-soft bg-white p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Why pay monthly here</div>
                      <ul className="mt-2 space-y-1.5 text-xs text-ink-700">
                        {card.whyPay.map((line) => (
                          <li key={line} className="flex gap-2">
                            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-ink-900" />
                            <span>{line}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="mt-3 rounded-xl border border-border-soft bg-white p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Where the edge comes from</div>
                      <ul className="mt-2 space-y-1.5 text-xs text-ink-700">
                        {card.edge.map((line) => (
                          <li key={line} className="flex gap-2">
                            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-signal-700" />
                            <span>{line}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="mt-3 rounded-xl border border-border-soft bg-canvas-50 p-3 text-xs text-ink-700">
                      <span className="font-semibold text-ink-900">Concrete example:</span> {card.example}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border border-border-soft bg-canvas-50 p-4">
                <div className="text-xs font-semibold text-ink-500">What Syntrake improves every cycle</div>
                <ul className="mt-2 space-y-1.5 text-sm text-ink-700">
                  <li>- Decision quality (what to do)</li>
                  <li>- Execution quality (how to do it)</li>
                  <li>- Risk quality (when to slow down)</li>
                </ul>
              </div>
              <div className="rounded-2xl border border-border-soft bg-canvas-50 p-4">
                <div className="text-xs font-semibold text-ink-500">What users still control</div>
                <ul className="mt-2 space-y-1.5 text-sm text-ink-700">
                  <li>- Capital amount and broker account</li>
                  <li>- Risk tolerance and investing profile</li>
                  <li>- Whether they follow the process</li>
                </ul>
              </div>
              <div className="rounded-2xl border border-border-soft bg-canvas-50 p-4">
                <div className="text-xs font-semibold text-ink-500">Why that supports subscription</div>
                <p className="mt-2 text-sm text-ink-700">
                  Recurring value comes from ongoing guidance, adaptation, and execution discipline as markets and your
                  portfolio change.
                </p>
              </div>
            </div>
          </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

