"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";

type Mode = "investing";

const MODES: Array<{ key: Mode; title: string; desc: string }> = [
  { key: "investing", title: "Investing", desc: "Long-term compounding, calm risk." },
];

function cls(...xs: Array<string | false | undefined | null>) {
  return xs.filter(Boolean).join(" ");
}

export default function LandingDemo() {
  const [mode, setMode] = useState<Mode>("investing");

  const preview = useMemo(() => {
    void mode;
    return {
      headline: "Compounding, but institutional.",
      bullets: ["Plan constraints", "Drift + concentration scan", "Next Best Action"],
      action: "Start the autopilot",
    };
  }, [mode]);

  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-500">Live preview</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">{preview.headline}</div>
          <div className="mt-3 space-y-2">
            {preview.bullets.map((b) => (
              <div key={b} className="flex items-center gap-2 text-sm text-zinc-700">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900 text-white text-xs">✓</span>
                <span>{b}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="w-full md:w-[320px]">
          <div className="grid grid-cols-2 gap-2">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                className={cls(
                  "rounded-2xl border px-3 py-2 text-left transition",
                  mode === m.key
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50"
                )}
              >
                <div className={cls("text-sm font-semibold", mode === m.key && "text-white")}>{m.title}</div>
                <div className={cls("text-xs", mode === m.key ? "text-white/80" : "text-zinc-500")}>{m.desc}</div>
              </button>
            ))}
          </div>

          <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-xs uppercase tracking-wide text-zinc-500">Today’s decision</div>
            <div className="mt-2 text-sm font-semibold text-zinc-900">{preview.action}</div>
            <div className="mt-2 text-xs text-zinc-500">This is what Daily feels like. One move, receipts, and proof.</div>

            <div className="mt-4 flex items-center gap-2">
              <Link
                href={`/app?tab=daily&mode=${mode}`}
                className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
              >
                Open demo
              </Link>
              <Link
                href="/sign-in"
                className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
              >
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
