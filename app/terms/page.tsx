// app/terms/page.tsx
import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Terms of Service</h1>
        <p className="text-sm text-ink-600">
          Effective date: {new Date().toISOString().slice(0, 10)} ·{" "}
          <Link href="/" className="underline">
            Back to home
          </Link>
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">1) What SignalCore is</h2>
        <p className="text-sm text-ink-700">
          SignalCore is an educational and decision-support software product. It provides tools for planning, risk
          monitoring, and decision organization. It does not provide personalized financial advice.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">2) No financial advice</h2>
        <p className="text-sm text-ink-700">
          SignalCore does not provide investment, legal, tax, or accounting advice. Any information, outputs, or examples
          (including tickers and portfolio templates) are provided for educational purposes only. You are solely
          responsible for your investment decisions and outcomes.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">3) Risk disclosure</h2>
        <p className="text-sm text-ink-700">
          Investing involves risk, including possible loss of principal. Past performance does not guarantee future
          results. Markets can be volatile. You should consider your financial situation and consult qualified
          professionals before making investment decisions.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">4) Accounts & acceptable use</h2>
        <p className="text-sm text-ink-700">
          You agree to provide accurate information, keep your account secure, and not use SignalCore for illegal
          purposes, abuse, or to attempt to reverse engineer, disrupt, or compromise the service.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">5) Subscriptions & billing</h2>
        <p className="text-sm text-ink-700">
          Subscriptions renew automatically unless canceled. You can cancel at any time through your account billing
          portal. Fees paid are non-refundable except where required by law or explicitly stated otherwise.
        </p>
        <p className="text-sm text-ink-700">
          Founding Member pricing (if available) is limited to the first qualifying users and may be subject to
          availability and eligibility rules displayed at purchase time.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">6) Service changes</h2>
        <p className="text-sm text-ink-700">
          We may update, modify, or discontinue features over time. We may also update these Terms. If changes are
          material, we will take reasonable steps to provide notice.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">7) Intellectual property</h2>
        <p className="text-sm text-ink-700">
          SignalCore and its content, software, and branding are protected by intellectual property laws. You may not
          copy, sell, sublicense, or redistribute the service except as permitted by law or written permission.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">8) Limitation of liability</h2>
        <p className="text-sm text-ink-700">
          To the maximum extent permitted by law, SignalCore is provided “as is” without warranties. We are not liable
          for any indirect, incidental, special, consequential, or punitive damages, or any investment losses, arising
          out of your use of the service.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">9) Contact</h2>
        <p className="text-sm text-ink-700">
          For questions about these Terms, contact us at your support email address (add it in your site footer or
          support page).
        </p>
      </section>
    </main>
  );
}