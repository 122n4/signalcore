import Link from "next/link";

const tiers = [
  {
    name: "Free",
    price: "0 EUR",
    lines: ["Market radar preview", "Trading desk access", "Basic notification preview"],
  },
  {
    name: "Pro",
    price: "19 EUR / month",
    lines: ["Full Trading desk", "Alerts and journal", "Extended history and paper feedback"],
  },
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-[#07111f] px-6 py-20 text-white">
      <section className="mx-auto max-w-5xl">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-200">
          Trading pricing
        </p>
        <h1 className="mt-4 text-4xl font-black tracking-tight md:text-6xl">
          Pick the Trading depth you need.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">
          The active product is Trading-only. The old capital product is not represented in current
          plans or product gates.
        </p>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {tiers.map((tier) => (
            <article key={tier.name} className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
              <h2 className="text-2xl font-black">{tier.name}</h2>
              <p className="mt-2 text-xl font-semibold text-cyan-100">{tier.price}</p>
              <ul className="mt-5 space-y-3 text-sm leading-6 text-slate-300">
                {tier.lines.map((line) => (
                  <li key={line}>- {line}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <Link
          href="/app?tab=trading&mode=trading"
          className="mt-10 inline-flex rounded-2xl bg-cyan-200 px-5 py-3 text-sm font-black text-slate-950"
        >
          Open Trading
        </Link>
      </section>
    </main>
  );
}
