"use client";

import React from "react";

import type { TradingExternalVerificationResult } from "@/lib/trading/verification/externalVerification";

type TradingExternalVerificationCardProps = {
  instrument: string;
};

type VerificationResponse =
  | { ok: true; result: TradingExternalVerificationResult }
  | { ok: false; error?: string };

function formatPrice(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return "--";
  }

  if (value >= 1000) {
    return value.toFixed(2);
  }

  if (value >= 1) {
    return value.toFixed(4);
  }

  return value.toFixed(6);
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusClasses(status: TradingExternalVerificationResult["status"] | "loading" | "error") {
  switch (status) {
    case "confirmed":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
    case "caution":
      return "border-amber-500/30 bg-amber-500/10 text-amber-100";
    case "unavailable":
      return "border-slate-700 bg-slate-900/70 text-slate-300";
    case "error":
      return "border-rose-500/30 bg-rose-500/10 text-rose-100";
    default:
      return "border-slate-700 bg-slate-900/70 text-slate-300";
  }
}

export default function TradingExternalVerificationCard({
  instrument,
}: TradingExternalVerificationCardProps) {
  const [result, setResult] = React.useState<TradingExternalVerificationResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [refreshTick, setRefreshTick] = React.useState(0);

  const loadVerification = React.useEffectEvent(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/trading/verify-live?instrument=${encodeURIComponent(instrument)}`,
        {
          cache: "no-store",
          signal,
        },
      );
      const json = (await response.json().catch(() => null)) as VerificationResponse | null;

      if (!response.ok || !json?.ok) {
        throw new Error(
          json && "error" in json && json.error ? json.error : `verify_failed_${response.status}`,
        );
      }

      setResult(json.result);
    } catch (loadError) {
      if (signal?.aborted) {
        return;
      }

      setResult(null);
      setError(loadError instanceof Error ? loadError.message : "verify_live_failed");
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false);
      }
    }
  });

  React.useEffect(() => {
    const controller = new AbortController();
    void loadVerification(controller.signal);

    const intervalId = window.setInterval(() => {
      const intervalController = new AbortController();
      void loadVerification(intervalController.signal);
    }, 90_000);

    return () => {
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [instrument, refreshTick]);

  const status = error
    ? "error"
    : isLoading && !result
      ? "loading"
      : (result?.status ?? "unavailable");
  const statusLabel =
    status === "confirmed"
      ? "Externally Confirmed"
      : status === "caution"
        ? "Cross-check Caution"
        : status === "error"
          ? "Verification Error"
          : status === "loading"
            ? "Checking Live References"
            : "No External Confirmation";

  return (
    <section className="rounded-2xl border border-slate-800 bg-[#08111f] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
            External Verification
          </div>
          <div className="mt-2 text-lg font-semibold text-white">{instrument}</div>
          <div className="mt-1 text-sm text-slate-300">
            Compare Syntrake against live provider and public market references before execution.
          </div>
        </div>

        <div
          className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${statusClasses(
            status,
          )}`}
        >
          {statusLabel}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Syntrake price</div>
          <div className="mt-2 text-lg font-semibold text-white">
            {formatPrice(result?.internalPrice)}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Snapshot: {formatDate(result?.internalSnapshotAt)}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Tolerance</div>
          <div className="mt-2 text-lg font-semibold text-white">
            {result?.toleranceBps != null ? `${result.toleranceBps} bps` : "--"}
          </div>
          <div className="mt-1 text-xs text-slate-400">Max allowed distance for live confirmation.</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Action</div>
          <button
            type="button"
            onClick={() => setRefreshTick((tick) => tick + 1)}
            className="mt-2 inline-flex items-center justify-center rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm font-semibold text-white transition hover:border-sky-400/60 hover:text-sky-100"
          >
            Refresh verification
          </button>
          <div className="mt-1 text-xs text-slate-400">Runs automatically every 90 seconds.</div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/50 p-3 text-sm text-slate-300">
        {error ? `Verification failed: ${error}` : result?.summary ?? "Checking external references now."}
      </div>

      <div className="mt-4 space-y-3">
        {result?.checks?.length ? (
          result.checks.map((check) => (
            <div
              key={check.source}
              className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">{check.source}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">
                    {check.kind}
                  </div>
                </div>
                <div
                  className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${statusClasses(
                    check.matchesInternal === true
                      ? "confirmed"
                      : check.price != null
                        ? "caution"
                        : "unavailable",
                  )}`}
                >
                  {check.matchesInternal === true
                    ? "match"
                    : check.price != null
                      ? "distance"
                      : "missing"}
                </div>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Price</div>
                  <div className="mt-1 text-sm font-semibold text-white">{formatPrice(check.price)}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Delta</div>
                  <div className="mt-1 text-sm font-semibold text-white">
                    {check.deltaBps == null ? "--" : `${check.deltaBps.toFixed(1)} bps`}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Fetched</div>
                  <div className="mt-1 text-sm font-semibold text-white">
                    {formatDate(check.fetchedAt)}
                  </div>
                </div>
              </div>

              {check.note ? <div className="mt-3 text-sm text-slate-300">{check.note}</div> : null}

              {check.url ? (
                <a
                  href={check.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex text-sm font-semibold text-sky-300 transition hover:text-sky-200"
                >
                  Open external reference
                </a>
              ) : null}
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-sm text-slate-400">
            No external checks returned yet.
          </div>
        )}
      </div>

      {result?.links?.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {result.links.map((link) => (
            <a
              key={link.label}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-200 transition hover:border-sky-400/60 hover:text-sky-100"
            >
              {link.label}
            </a>
          ))}
        </div>
      ) : null}
    </section>
  );
}
