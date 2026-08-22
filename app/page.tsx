import Link from "next/link";

const bullets = [
  "Live market radar for the current Trading desk.",
  "Execution framing, invalidation, and risk notes before broker action.",
  "Journal, alerts, and paper-trading feedback loops for disciplined review.",
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#07111f] text-white">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-20">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-200">
          Syntrake Trading
        </p>
        <h1 className="mt-6 max-w-4xl text-5xl font-black tracking-tight md:text-7xl">
          A focused desk for cleaner trading decisions.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
          Syntrake is currently Trading-only while the old capital product is removed from the
          active codebase.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/app?tab=trading&mode=trading"
            className="rounded-2xl bg-cyan-200 px-5 py-3 text-sm font-black text-slate-950"
          >
            Open Trading
          </Link>
          <Link
            href="/pricing"
            className="rounded-2xl border border-white/12 px-5 py-3 text-sm font-bold text-white"
          >
            View pricing
          </Link>
        </div>
        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {bullets.map((item) => (
            <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <p className="text-sm leading-6 text-slate-200">{item}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
