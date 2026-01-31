"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import PortfolioAppV1 from "@/components/PortfolioAppV1";
import PlanningTab from "@/components/PlanningTab";

type Holding = {
  name: string;
  ticker?: string;
  type?: string;
  value?: number;
  note?: string;
};

type ApiPayload = {
  data: { holdings?: Holding[] } | null;
  updatedAt: string | null;
};

export default function MyPortfolioPage() {
  const [status, setStatus] = useState<"loading" | "signedOut" | "ok" | "error">("loading");
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const hasHoldings = useMemo(
    () => holdings.some((h) => (h?.name ?? "").trim().length > 0),
    [holdings]
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/portfolio", {
          method: "GET",
          credentials: "include",
        });

        if (cancelled) return;

        if (res.status === 401) {
          setStatus("signedOut");
          return;
        }

        if (!res.ok) {
          setStatus("error");
          return;
        }

        const json = (await res.json()) as ApiPayload;
        const cloudHoldings = json?.data?.holdings ?? [];

        setHoldings(cloudHoldings);
        setUpdatedAt(json.updatedAt ?? null);
        setStatus("ok");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-white text-ink-900">
      <section className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-ink-500">My Portfolio</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Your holdings</h1>
            <p className="mt-2 max-w-2xl text-sm text-ink-700">
              Your portfolio is now cloud-first. It won’t disappear if you change devices.
            </p>
          </div>

          <Link
            href="/app"
            className="rounded-2xl border border-border-soft bg-white px-4 py-2 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
          >
            Back to dashboard
          </Link>
        </div>

        {/* Cloud block */}
        <div className="mt-8 rounded-3xl border border-border-soft bg-white p-8 shadow-soft">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-ink-500">Cloud</p>
              <h2 className="mt-2 text-xl font-semibold">Saved portfolio</h2>
            </div>

            {updatedAt ? <p className="text-xs text-ink-500">Updated: {updatedAt}</p> : null}
          </div>

          <div className="mt-6">
            {status === "loading" && <p className="text-sm text-ink-700">Loading…</p>}

            {status === "signedOut" && (
              <div className="rounded-2xl border border-border-soft bg-canvas-50 p-4">
                <p className="text-sm text-ink-700">Sign in to see your cloud portfolio.</p>
                <Link
                  href="/sign-in"
                  className="mt-4 inline-flex rounded-2xl bg-signal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-signal-800"
                >
                  Sign in
                </Link>
              </div>
            )}

            {status === "error" && (
              <div className="rounded-2xl border border-border-soft bg-canvas-50 p-4">
                <p className="text-sm text-ink-700">Couldn’t load from cloud right now.</p>
              </div>
            )}

            {status === "ok" && !hasHoldings && (
              <div className="rounded-2xl border border-border-soft bg-canvas-50 p-4">
                <p className="text-sm font-semibold text-ink-900">No holdings yet</p>
                <p className="mt-2 text-sm text-ink-700">
                  Add assets in the dashboard Portfolio tab. They’ll appear here automatically.
                </p>
              </div>
            )}

            {status === "ok" && hasHoldings && (
              <div className="rounded-2xl border border-border-soft bg-canvas-50 p-4">
                <ul className="space-y-2 text-sm text-ink-900">
                  {holdings
                    .filter((h) => (h?.name ?? "").trim().length > 0)
                    .map((h, idx) => (
                      <li key={idx} className="flex items-center justify-between gap-4">
                        <span className="truncate">
                          {h.name}
                          {h.ticker ? ` (${h.ticker})` : ""}{" "}
                          <span className="text-ink-600">· {h.type ?? "Asset"}</span>
                        </span>
                        {typeof h.value === "number" ? (
                          <span className="tabular-nums text-ink-600">{h.value}</span>
                        ) : null}
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <TabsMyPortfolio />
      </section>
    </main>
  );
}

function TabsMyPortfolio() {
  const [tab, setTab] = useState<"portfolio" | "planning">("portfolio");

  return (
    <div className="mt-10">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab("portfolio")}
          className={[
            "rounded-2xl px-4 py-2 text-sm font-semibold transition",
            tab === "portfolio"
              ? "bg-ink-900 text-white"
              : "border border-border-soft bg-white text-ink-700 hover:bg-canvas-50",
          ].join(" ")}
        >
          Portfolio
        </button>

        <button
          type="button"
          onClick={() => setTab("planning")}
          className={[
            "rounded-2xl px-4 py-2 text-sm font-semibold transition",
            tab === "planning"
              ? "bg-ink-900 text-white"
              : "border border-border-soft bg-white text-ink-700 hover:bg-canvas-50",
          ].join(" ")}
        >
          Planning
        </button>
      </div>

      <div className="mt-6">
        {tab === "portfolio" ? (
          <PortfolioAppV1 locale="en" />
        ) : (
          <PlanningTab locale="en" isPaid={isPaid} />
        )}
      </div>
    </div>
  );
}