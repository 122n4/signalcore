"use client";

import Link from "next/link";

export default function BrokerPageClient() {
  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-10 text-zinc-950">
      <section className="mx-auto max-w-3xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
          Trading broker
        </p>
        <h1 className="mt-2 text-2xl font-black tracking-tight">Broker controls are paused.</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          Trading keeps broker connection management separate while the removed capital sync layer
          is purged from the active codebase.
        </p>
        <Link
          href="/app?tab=trading&mode=trading"
          className="mt-6 inline-flex rounded-xl bg-zinc-950 px-4 py-3 text-sm font-black text-white"
        >
          Back to Trading
        </Link>
      </section>
    </main>
  );
}
