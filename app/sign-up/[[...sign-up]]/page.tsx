import { SignUp } from "@clerk/nextjs";

export default function Page() {
  return (
    <main className="min-h-screen bg-white text-ink-900">
      <section className="mx-auto max-w-7xl px-6 py-14">
        <div className="mx-auto max-w-md">
          <p className="text-xs font-semibold text-ink-500">SignalCore</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">
            Create account
          </h1>
          <p className="mt-2 text-sm text-ink-700">
            Create your free account in seconds. No card required.
          </p>

          <div className="mt-8 rounded-3xl border border-border-soft bg-white p-4 shadow-soft">
            <SignUp />
          </div>

          <p className="mt-6 text-xs text-ink-500">
            Educational content only. No signals. No predictions.
          </p>
        </div>
      </section>
    </main>
  );
}