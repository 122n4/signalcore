"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

function classNames(...xs: Array<string | false | undefined | null>) {
  return xs.filter(Boolean).join(" ");
}

function Card({
  title,
  children,
  right,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-black/5 bg-white p-7 shadow-sm">
      {title ? (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="text-lg font-semibold tracking-tight text-neutral-950">
            {title}
          </div>
          {right ? <div>{right}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={classNames(
        "rounded-2xl px-5 py-3 text-sm font-semibold shadow-sm transition active:scale-[0.99]",
        disabled ? "bg-neutral-200 text-neutral-500" : "",
        variant === "primary" && !disabled
          ? "bg-neutral-950 text-white hover:bg-black"
          : "",
        variant === "secondary" && !disabled
          ? "border border-neutral-200 bg-white text-neutral-950 hover:bg-neutral-50"
          : ""
      )}
    >
      {children}
    </button>
  );
}

type StarterPackItem = {
  symbol: string;
  type: "ETF" | "Stock";
  role: "core" | "satellite" | "hedge" | "cash";
  suggestedEUR: number;
  maxEUR: number;
};

type StarterPack = {
  note: string;
  items: StarterPackItem[];
};

type DailyAction = {
  title: string;
  rationale: string;
  impact: string;
  confidence: number;
  tags: string[];
  cta: { label: string; href: string };
  starterPack: StarterPack;
};

type DailyBundle = {
  ok: boolean;
  asOf: number;

  // ✅ backend normalizado (o teu /api/daily-bundle já devolve isto)
  daily: DailyAction | null;

  // ✅ para sabermos se existe plano/portfolio sem depender de user-settings
  plan: any;
  portfolio: { holdings: any[]; cashBase: number; baseCurrency: string } | null;

  error: string;
  message: string;
};

async function getJSON<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { method: "GET", cache: "no-store", signal });
  const data = await res.json().catch(() => ({}));
  return data as T;
}

export default function DailyClient() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [bundle, setBundle] = useState<DailyBundle | null>(null);
  const [err, setErr] = useState<string>("");

  async function loadDaily() {
    setLoading(true);
    setErr("");

    const ac = new AbortController();
    try {
      const b = await getJSON<DailyBundle>("/api/daily-bundle", ac.signal);
      setBundle(b ?? null);

      if (b.ok === false) {
        setErr(b.message || b.error || "Failed to load Daily");
      }

      setLoading(false);
    } catch (e: any) {
      setErr(e.message || "Failed to load Daily");
      setLoading(false);
    }

    return () => ac.abort();
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDaily();
  }, []);

  const hasPlan = useMemo(() => {
    return Boolean(bundle?.plan && typeof bundle.plan === "object");
  }, [bundle]);

  const daily = bundle?.daily ?? null;
  const starter = daily?.starterPack ?? { note: "", items: [] };

  // --- UI states ---

  if (loading) {
    return (
      <Card title="Daily">
        <div className="text-sm text-neutral-600">Loading…</div>
      </Card>
    );
  }

  // ✅ sem plano → empurra para planning (sem depender do user_settings)
  if (!hasPlan) {
    return (
      <Card title="Daily">
        <div className="text-sm text-neutral-600">
          No plan detected.
          <div className="mt-1">
            Create a plan first — then Syntrake can generate your next best action.
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={() => router.push("/app?mode=investing&tab=planning")}>Open Planning</Button>
          <Button variant="secondary" onClick={() => router.push("/app/welcome")}>
            Open Welcome setup
          </Button>
        </div>
      </Card>
    );
  }

  // ✅ plano existe mas daily ainda não veio → estado autopilot
  if (!daily) {
    return (
      <Card
        title="Daily"
        right={
          <span className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-semibold text-neutral-700">
            Autopilot Active ✓
          </span>
        }
      >
        <div className="text-sm text-neutral-600">
          Generating today’s next best action…
          <div className="mt-1 text-xs text-neutral-500">
            If you just activated your plan, this can take a moment.
          </div>
        </div>

        {err ? <div className="mt-4 text-sm font-semibold text-rose-700">{err}</div> : null}

        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={() => loadDaily()}>Refresh</Button>
          <Button variant="secondary" onClick={() => router.push("/app?mode=investing&tab=planning")}>
            Open Planning
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title="Today’s Next Best Action"
      right={
        <span className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-semibold text-neutral-700">
          Autopilot Active ✓
        </span>
      }
    >
      <div className="text-xl font-semibold tracking-tight text-neutral-950">
        {daily.title || "Action"}
      </div>

      {daily.rationale ? (
        <div className="mt-3 text-sm text-neutral-600">{daily.rationale}</div>
      ) : null}

      {daily.impact ? (
        <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Impact
          </div>
          <div className="mt-1">{daily.impact}</div>
        </div>
      ) : null}

      {/* ✅ Starter Pack */}
      {starter.items.length ? (
        <div className="mt-5 rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-neutral-950">
                Starter Portfolio (ETF-only)
              </div>
              <div className="mt-1 text-sm text-neutral-600">
                {starter.note ||
                  "Start with Core. Add Hedge only if needed. Keep moves small and consistent."}
              </div>
            </div>
            <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-semibold text-neutral-700">
              Recommended
            </span>
          </div>

          <div className="mt-4 space-y-2">
            {starter.items.map((it, idx) => (
              <div
                key={`${it.symbol}_${idx}`}
                className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="text-sm font-semibold text-neutral-950">{it.symbol}</div>
                  <div className="text-xs text-neutral-500">
                    {it.type || "ETF"} • {it.role || "core"}
                  </div>
                </div>

                <div className="text-xs font-semibold text-neutral-700">
                  {typeof it.suggestedEUR === "number" ? `Suggested: ${it.suggestedEUR}` : ""}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => router.push("/app?mode=investing&tab=planning&addHoldingsNow=1")}>
              Add holdings now
            </Button>
            <Button variant="secondary" onClick={() => router.push("/app?mode=trading&tab=opportunities")}>
              View opportunities
            </Button>
          </div>
        </div>
      ) : null}

      {/* CTAs */}
      <div className="mt-6 flex flex-wrap gap-2">
        <Button onClick={() => router.push("/app?mode=investing&tab=planning")}>View Plan</Button>
        <Button variant="secondary" onClick={() => router.push("/app?mode=investing&tab=advisor")}>
          Explain Simply
        </Button>
      </div>

      {err ? <div className="mt-4 text-sm font-semibold text-rose-700">{err}</div> : null}
    </Card>
  );
}

