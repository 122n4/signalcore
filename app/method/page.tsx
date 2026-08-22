export default function MethodPage() {
  return (
    <main className="min-h-screen bg-[#07111f] px-6 py-20 text-white">
      <section className="mx-auto max-w-4xl">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-200">
          Trading method
        </p>
        <h1 className="mt-4 text-4xl font-black tracking-tight">
          Read context, frame risk, then act deliberately.
        </h1>
        <ol className="mt-8 space-y-4 text-sm leading-7 text-slate-300">
          <li>1. Inspect market state and data freshness.</li>
          <li>2. Separate watchlist monitoring from executable setups.</li>
          <li>3. Check invalidation and sizing before broker action.</li>
          <li>4. Log the outcome for review.</li>
        </ol>
      </section>
    </main>
  );
}
