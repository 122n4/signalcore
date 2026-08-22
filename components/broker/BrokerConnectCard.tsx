"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Link2, AlertTriangle, CheckCircle2 } from "lucide-react";

type Status =
  | { status: "disconnected" | "error"; provider?: string | null; message?: string | null }
  | { status: "connecting"; provider: string }
  | { status: "connected" | "active"; provider: string; accountLabel?: string | null };

function cls(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function BrokerConnectCard({
  compact = false,
  title = "Broker",
  subtitle = "Connect broker context for Trading workflows.",
}: {
  compact?: boolean;
  title?: string;
  subtitle?: string;
}) {
  const router = useRouter();
  const search = useSearchParams();

  const [status, setStatus] = React.useState<Status>({ status: "disconnected" });
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/broker/status", { method: "GET" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "status_failed");
      setStatus(data as Status);
    } catch (e: any) {
      setStatus({ status: "error", message: e?.message ?? "status_failed" });
    }
  }

  React.useEffect(() => {
    load();
  }, []);

  // Auto-connect if we land here with ?connect=1 (from Welcome screen)
  React.useEffect(() => {
    const wants = (search?.get("connect") || "").toString() === "1";
    if (!wants) return;
    if (busy) return;
    if (status.status === "disconnected" || status.status === "error") {
      void handleConnect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status.status]);

  async function handleConnect() {
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch("/api/broker/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "snaptrade" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "connect_failed");
      const url = data?.connectUrl;
      if (!url) throw new Error("missing_connect_url");
      window.location.href = url;
    } catch (e: any) {
      setMsg(e?.message ?? "connect_failed");
    } finally {
      setBusy(false);
    }
  }

  const ok = status.status === "connected" || status.status === "active";
  const isError = status.status === "error";

  return (
    <div
      className={cls(
        "rounded-3xl border border-white/10 bg-white/5 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.18)] backdrop-blur",
        compact && "p-3"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-white/90">{title}</div>
            {ok ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Connected
              </span>
            ) : isError ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[11px] font-semibold text-amber-200">
                <AlertTriangle className="h-3.5 w-3.5" />
                Needs attention
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-white/70">
                <Link2 className="h-3.5 w-3.5" />
                Not connected
              </span>
            )}
          </div>

          <div className="mt-1 text-xs text-white/65">{subtitle}</div>

          {msg ? (
            <div className="mt-2 text-xs text-amber-200">
              {msg}
            </div>
          ) : null}

          {ok && (status as any).accountLabel ? (
            <div className="mt-2 text-xs text-white/60">
              {(status as any).accountLabel}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {ok ? (
            <button
              type="button"
              onClick={() => router.refresh()}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
            >
              Refresh
            </button>
          ) : (
            <button
              type="button"
              onClick={handleConnect}
              disabled={busy}
              className={cls(
                "inline-flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-neutral-950 hover:bg-white/90",
                busy && "opacity-60"
              )}
            >
              <Link2 className="h-4 w-4" />
              Connect
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
