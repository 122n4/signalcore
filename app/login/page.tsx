import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-[#07111f] px-6 py-20 text-white">
      <section className="mx-auto max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-200">
          Account access
        </p>
        <h1 className="mt-4 text-4xl font-black tracking-tight">Open your Trading desk.</h1>
        <p className="mt-4 text-sm leading-7 text-slate-300">
          Sign in to save Trading preferences, alerts, journal state, and research workspace data.
        </p>
        <Link
          href="/sign-in"
          className="mt-8 inline-flex rounded-2xl bg-cyan-200 px-5 py-3 text-sm font-black text-slate-950"
        >
          Continue
        </Link>
      </section>
    </main>
  );
}
