"use client";

import React, { useState } from "react";
import Link from "next/link";

type SetupMode = "offline" | "broker";

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
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

function StatusPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3">
      <div className="text-sm font-semibold text-neutral-900">{title}</div>
      <div className="mt-1 text-xs leading-5 text-neutral-600">{children}</div>
    </div>
  );
}

export default function OfflineSetupClient() {
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState<string>("");

  async function completeSetup(modeValue: SetupMode) {
    const r = await fetchJSON("/api/setup/complete", {
      method: "POST",
      body: JSON.stringify({ mode: modeValue }),
    });
    return r;
  }

  async function ensureSetupIsComplete(modeValue: SetupMode) {
    const mark = await fetchJSON("/api/user-settings", {
      method: "POST",
      body: JSON.stringify({
        active_mode: "investing",
        setup_mode: modeValue,
        setup_status: "complete",
      }),
    });
    if (!mark.ok) throw new Error(String(mark.data?.error || "Could not mark setup as complete."));

    const complete = await completeSetup(modeValue);
    if (!complete.ok) {
      console.warn("setup/complete endpoint failed, continuing with user-settings completion.");
    }

    const check = await fetchJSON("/api/user-settings", { method: "GET" });
    const setupStatus = String(check.data?.settings?.setup_status || "").toLowerCase().trim();
    if (setupStatus !== "complete") {
      console.warn("setup_status readback is not complete; continuing with onboarding redirect.");
    }
  }

  async function onLaunch() {
    if (status === "saving") return;
    setStatus("saving");
    setError("");

    try {
      await ensureSetupIsComplete("offline");

      const qp = new URLSearchParams();
      qp.set("tab", "portfolio");
      qp.set("mode", "investing");
      qp.set("workspace", "simple");
      qp.set("fromSetup", "1");
      window.localStorage.setItem("sc_onboarded", "1");
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
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/app?tab=portfolio&mode=investing" className="text-sm font-semibold tracking-tight">
            Syntrake
          </Link>
          <div className="text-xs text-neutral-500">Investing setup compatibility</div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-5xl px-6 py-8">
        <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs text-neutral-700">
            <span className="inline-flex h-2 w-2 rounded-full bg-amber-500" />
            Authority unavailable
          </div>

          <h1 className="mt-4 text-3xl font-semibold tracking-tight">Continue without creating financial truth</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">
            Canonical Plan authoring is currently unavailable. Recommendation authority is unavailable. Portfolio and
            account checks can continue without creating a recommendation, mandate, projection, or execution authority.
          </p>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <StatusPanel title="Plan authoring">
              Canonical financial authoring is unavailable in this setup path.
            </StatusPanel>
            <StatusPanel title="Recommendations">
              Recommendation authority is unavailable during setup.
            </StatusPanel>
            <StatusPanel title="Next step">
              Continue to Portfolio for account and holdings checks only.
            </StatusPanel>
          </div>
        </section>

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
              status === "saving" ? "bg-neutral-400" : "bg-neutral-950 hover:bg-black",
            )}
          >
            {status === "saving" ? "Continuing..." : "Continue to Portfolio"}
          </button>

          <Link
            href="/app?tab=portfolio&mode=investing"
            className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-900 hover:bg-neutral-50"
          >
            Open Portfolio
          </Link>

          <Link
            href="/app?tab=autonomy&mode=investing&brokerSetup=1"
            className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-900 hover:bg-neutral-50"
          >
            Connect broker instead
          </Link>
        </div>
      </div>
    </main>
  );
}
