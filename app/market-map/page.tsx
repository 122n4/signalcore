import Link from "next/link";

export default function MarketMapPage() {
  return (
    <main className="min-h-screen bg-white px-6 py-20 text-zinc-950">
      <section className="mx-auto max-w-4xl">
        <p className="text-sm font-black uppercase tracking-[0.2em] text-zinc-500">
          Market Map
        </p>
        <h1 className="mt-4 text-4xl font-black tracking-tight">
          Trading research snapshots.
        </h1>
        <p className="mt-5 text-sm leading-7 text-zinc-700">
          Market Map is a Trading research surface for context, regime notes, and scanner
          discipline.
        </p>
        <Link
          href="/market-map/week-11"
          className="mt-8 inline-flex rounded-2xl bg-zinc-950 px-5 py-3 text-sm font-black text-white"
        >
          Open latest map
        </Link>
      </section>
    </main>
  );
}
