import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="text-sm text-ink-600">
          <Link href="/" className="underline">Back to home</Link>
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">What we collect</h2>
        <ul className="list-disc pl-5 text-sm text-ink-700 space-y-1">
          <li>Account information (e.g., email, authentication identifiers).</li>
          <li>Plan and preferences you enter (goals, risk settings, guardrails, policy choices).</li>
          <li>Usage and diagnostic data (pages viewed, feature usage, error logs).</li>
          <li>Billing status and subscription metadata (not your full payment details).</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">How we use data</h2>
        <ul className="list-disc pl-5 text-sm text-ink-700 space-y-1">
          <li>Provide and improve the service.</li>
          <li>Maintain security and prevent fraud.</li>
          <li>Operate subscriptions and access.</li>
          <li>Support and service communications.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Cookies & analytics</h2>
        <p className="text-sm text-ink-700">
          We may use cookies to keep you signed in, remember preferences, and measure usage for product improvement.
          You can control cookies through your browser settings.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Contact</h2>
        <p className="text-sm text-ink-700">Add your support email in the footer or a support page.</p>
      </section>
    </main>
  );
}