import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import type { ReactNode } from "react";
import TrackedLink from "@/components/TrackedLink";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { pickByLang, type SiteLang } from "@/lib/i18n/siteLanguage";
import { resolveRequestSiteLang, withLangQuery } from "@/lib/i18n/requestSiteLang";

type PageSearchParams = Record<string, string | string[] | undefined>;

export const metadata: Metadata = {
  title: "Syntrake - Today's Trade, Wait, or Reduce-Risk Plan",
  description:
    "Open Syntrake before your broker: get a trade, wait, or reduce-risk decision with live-data checks, risk framing, and a broker-ready checklist.",
};

function t(
  lang: SiteLang,
  value: { en: string; pt?: string; es?: string; fr?: string; de?: string; it?: string }
) {
  return pickByLang(lang, value);
}

function ShowcaseCard({
  id,
  kicker,
  title,
  body,
  preview,
}: {
  id: string;
  kicker: string;
  title: string;
  body: string;
  preview: ReactNode;
}) {
  return (
    <article
      id={id}
      className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(12,24,66,0.7),rgba(8,17,42,0.72))] p-5 shadow-[0_24px_80px_rgba(6,12,40,0.35)] backdrop-blur md:p-6"
    >
      <div className="space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-100/45">{kicker}</div>
        <h3 className="text-[30px] font-semibold tracking-tight text-white">{title}</h3>
        <p className="max-w-lg text-sm leading-6 text-white/64">{body}</p>
      </div>
      <div className="relative mt-5 overflow-hidden rounded-[24px] border border-white/10 bg-[#0a1534]/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
        <div className="relative aspect-[16/10] overflow-hidden">{preview}</div>
      </div>
    </article>
  );
}

function PreviewShell({
  children,
  compact = false,
  activeTab = "Daily",
}: {
  children: ReactNode;
  compact?: boolean;
  activeTab?: "Daily" | "Advisor" | "Portfolio" | "Plan" | "Autonomy";
}) {
  const tabs: Array<{ label: "Daily" | "Advisor" | "Portfolio" | "Plan" | "Autonomy" }> = [
    { label: "Daily" },
    { label: "Advisor" },
    { label: "Portfolio" },
    { label: "Plan" },
    { label: "Autonomy" },
  ];

  return (
    <div className="h-full bg-[radial-gradient(circle_at_top,rgba(32,68,170,0.38),transparent_45%),linear-gradient(180deg,#07112b_0%,#081432_100%)] text-white">
      <div className={`border-b border-white/6 bg-[#08112b]/92 ${compact ? "px-3 py-2" : "px-4 py-3"}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={`${compact ? "h-4 w-4" : "h-5 w-5"} rounded-full bg-[radial-gradient(circle_at_30%_30%,#67afff,#275cff)] shadow-[0_0_22px_rgba(73,123,255,0.42)]`} />
            <span className={`font-semibold tracking-tight ${compact ? "text-[10px]" : "text-xs"}`}>Syntrake</span>
            <div className={`ml-1 flex items-center gap-1.5 ${compact ? "text-[8px]" : "text-[10px]"}`}>
              {tabs.map((tab) => (
                <span
                  key={tab.label}
                  className={`rounded-full border px-2.5 py-1 ${
                    tab.label === activeTab
                      ? "border-blue-400/30 bg-blue-400/10 text-white"
                      : "border-transparent text-white/64"
                  }`}
                >
                  {tab.label}
                </span>
              ))}
            </div>
          </div>
          <div className={`flex items-center gap-2 ${compact ? "text-[8px]" : "text-[10px]"}`}>
            <span className="hidden rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-white/72 md:inline-flex">Search</span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-white/72">+EUR -</span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-white/72">Protected</span>
            <span className="rounded-full border border-blue-400/24 bg-blue-400/10 px-2.5 py-1 text-blue-100">7-Day Trial</span>
            <span className="rounded-full border border-amber-400/18 bg-amber-400/10 px-2.5 py-1 text-amber-200">Free</span>
            <span className={`${compact ? "h-5 w-5" : "h-6 w-6"} flex items-center justify-center rounded-full bg-[#e04d8a] font-semibold text-white`}>
              S
            </span>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

function PreviewTag({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "green" | "amber" | "red" | "blue";
}) {
  const tones: Record<string, string> = {
    neutral: "border-white/10 bg-white/[0.04] text-white/72",
    green: "border-emerald-400/18 bg-emerald-400/10 text-emerald-200",
    amber: "border-amber-400/18 bg-amber-400/10 text-amber-200",
    red: "border-rose-400/18 bg-rose-400/10 text-rose-200",
    blue: "border-cyan-300/18 bg-cyan-300/10 text-cyan-100",
  };

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

function MetricTile({
  label,
  value,
  tone = "white",
}: {
  label: string;
  value: string;
  tone?: "white" | "amber" | "green" | "cyan";
}) {
  const toneClass =
    tone === "amber" ? "text-amber-200" : tone === "green" ? "text-emerald-200" : tone === "cyan" ? "text-cyan-200" : "text-white";
  return (
    <div className="rounded-2xl border border-white/8 bg-[#0a1738]/88 p-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-white/44">{label}</div>
      <div className={`mt-2 text-lg font-semibold tracking-tight ${toneClass}`}>{value}</div>
    </div>
  );
}

function MiniBar({
  value,
  tone = "blue",
}: {
  value: string;
  tone?: "blue" | "amber" | "green" | "violet";
}) {
  const gradient =
    tone === "amber"
      ? "from-amber-400 via-amber-300 to-orange-300"
      : tone === "green"
        ? "from-emerald-400 via-teal-300 to-green-200"
        : tone === "violet"
          ? "from-violet-400 via-indigo-300 to-blue-300"
          : "from-blue-500 via-cyan-300 to-blue-200";

  return (
    <div>
      <div className="h-2.5 rounded-full bg-white/[0.05]">
        <div className={`h-full rounded-full bg-gradient-to-r ${gradient}`} style={{ width: value }} />
      </div>
    </div>
  );
}

function LandingDailyPreview({ compact = false }: { compact?: boolean }) {
  return (
    <PreviewShell compact={compact} activeTab="Daily">
      <div className={compact ? "grid gap-3 p-3" : "grid gap-4 p-5"}>
        <div className={`grid gap-3 rounded-[24px] border border-white/8 bg-[#0a1534]/86 ${compact ? "p-4" : "p-5"} lg:grid-cols-[1.35fr_0.95fr]`}>
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-white/46">Directive</div>
            <div className={`${compact ? "mt-2 text-3xl" : "mt-3 text-5xl"} font-semibold tracking-tight text-amber-300`}>REDUCE RISK</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <PreviewTag tone="amber">Posture: caution</PreviewTag>
              <PreviewTag tone="blue">Portfolio impact: lower concentration risk</PreviewTag>
              <PreviewTag tone="red">Action gate: high attention</PreviewTag>
            </div>
            <p className={`${compact ? "mt-3 text-xs leading-5" : "mt-4 text-sm leading-7"} max-w-xl text-white/64`}>
              Volatility remains elevated and signal confirmation quality is weak. Capital preservation has higher expected value than aggressive positioning today.
            </p>
            <div className={`mt-4 grid ${compact ? "grid-cols-2 gap-2" : "grid-cols-4 gap-3"}`}>
              <MetricTile label="Confidence" value="42%" />
              <MetricTile label="Recommended exposure" value="36%" />
              <MetricTile label="Next review" value="2h" />
              <MetricTile label="Risk score" value="72/100" tone="amber" />
            </div>
          </div>
          <div className="grid gap-3">
            <div className="rounded-2xl border border-white/8 bg-[#0a1738]/88 p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/44">Most likely path</div>
              <div className="mt-3 text-2xl font-semibold text-amber-200">Defensive</div>
              <p className="mt-2 text-sm leading-6 text-white/56">Continuation favored over base consolidation and accelerated recovery.</p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-[#0a1738]/88 p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/44">Expected impact</div>
              <div className="mt-3 text-2xl font-semibold text-cyan-200">Lower drawdown</div>
              <p className="mt-2 text-sm leading-6 text-white/56">Risk trimming improves stability if volatility persists through the next cycle.</p>
            </div>
            <div className="flex gap-2">
              <button className="flex-1 rounded-2xl bg-[linear-gradient(135deg,#3f82ff,#5ea1ff)] px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_36px_rgba(49,115,255,0.28)]">
                Execute Decision
              </button>
              <button className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white/80">
                Review Details
              </button>
            </div>
          </div>
        </div>

        {!compact && (
          <>
            <div className="grid gap-4 xl:grid-cols-3">
              <div className="rounded-[22px] border border-white/8 bg-[#0a1738]/88 p-4">
                <div className="text-2xl font-semibold tracking-tight text-white">Market State</div>
                <p className="mt-2 text-sm leading-6 text-white/54">High-level read of current market structure and internal conditions.</p>
                <div className="mt-5 space-y-3">
                  <div className="grid grid-cols-[78px_1fr_72px] items-center gap-3 text-sm">
                    <span className="font-semibold text-white/86">Trend</span>
                    <MiniBar value="42%" />
                    <span className="text-right font-semibold text-white/64">Neutral</span>
                  </div>
                  <div className="grid grid-cols-[78px_1fr_72px] items-center gap-3 text-sm">
                    <span className="font-semibold text-white/86">Volatility</span>
                    <MiniBar value="68%" tone="amber" />
                    <span className="text-right font-semibold text-white/64">Elevated</span>
                  </div>
                  <div className="grid grid-cols-[78px_1fr_72px] items-center gap-3 text-sm">
                    <span className="font-semibold text-white/86">Liquidity</span>
                    <MiniBar value="58%" tone="green" />
                    <span className="text-right font-semibold text-white/64">Stable</span>
                  </div>
                  <div className="grid grid-cols-[78px_1fr_72px] items-center gap-3 text-sm">
                    <span className="font-semibold text-white/86">Momentum</span>
                    <MiniBar value="37%" tone="violet" />
                    <span className="text-right font-semibold text-white/64">Weak</span>
                  </div>
                </div>
              </div>

              <div className="rounded-[22px] border border-white/8 bg-[#0a1738]/88 p-4">
                <div className="text-2xl font-semibold tracking-tight text-white">Scenario Model</div>
                <p className="mt-2 text-sm leading-6 text-white/54">Probability-weighted paths derived from market structure and signal quality.</p>
                <div className="mt-5 space-y-4">
                  <div className="grid grid-cols-[92px_1fr_40px] items-center gap-3 text-sm">
                    <span className="font-semibold text-white/86">Defensive</span>
                    <MiniBar value="60%" tone="amber" />
                    <span className="text-right font-semibold text-white/86">60%</span>
                  </div>
                  <div className="grid grid-cols-[92px_1fr_40px] items-center gap-3 text-sm">
                    <span className="font-semibold text-white/86">Base</span>
                    <MiniBar value="30%" tone="green" />
                    <span className="text-right font-semibold text-white/86">30%</span>
                  </div>
                  <div className="grid grid-cols-[92px_1fr_40px] items-center gap-3 text-sm">
                    <span className="font-semibold text-white/86">Accelerated</span>
                    <MiniBar value="10%" />
                    <span className="text-right font-semibold text-white/86">10%</span>
                  </div>
                </div>
              </div>

              <div className="rounded-[22px] border border-white/8 bg-[#0a1738]/88 p-4">
                <div className="text-2xl font-semibold tracking-tight text-white">Risk Temperature</div>
                <p className="mt-2 text-sm leading-6 text-white/54">Quick read of how dangerous the environment is for adding fresh exposure.</p>
                <div className="mt-6 rounded-2xl border border-white/8 bg-[#09122e]/88 p-4">
                  <MiniBar value="68%" tone="amber" />
                  <div className="mt-4 flex justify-between text-[11px] font-semibold uppercase tracking-[0.18em] text-white/44">
                    <span>Cold</span>
                    <span>Balanced</span>
                    <span>Elevated</span>
                    <span>Hot</span>
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <MetricTile label="Current state" value="Caution" tone="amber" />
                    <MetricTile label="Change vs yesterday" value="+0.4" tone="amber" />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.35fr_0.95fr]">
              <div className="rounded-[22px] border border-white/8 bg-[#0a1738]/88 p-4">
                <div className="text-2xl font-semibold tracking-tight text-white">Action Stack</div>
                <p className="mt-2 text-sm leading-6 text-white/54">Priority-ranked tasks required to execute today&apos;s directive cleanly.</p>
                <div className="mt-5 space-y-3">
                  {[
                    ["01", "Fix pricing coverage", "High", "amber"],
                    ["02", "Reduce concentration risk", "Medium", "amber"],
                    ["03", "Capture proof and close day", "Low", "green"],
                  ].map(([idx, title, level, tone]) => (
                    <div key={idx} className="flex items-start gap-4 rounded-2xl border border-white/8 bg-[#08122e]/88 p-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-blue-400/18 bg-blue-400/10 text-sm font-semibold text-blue-100">
                        {idx}
                      </div>
                      <div className="flex-1">
                        <div className="text-xl font-semibold text-white">{title}</div>
                        <p className="mt-1 text-sm leading-6 text-white/56">
                          {title === "Fix pricing coverage"
                            ? "Missing or outdated price feeds reduce signal quality and weaken decision confidence."
                            : title === "Reduce concentration risk"
                              ? "A concentrated sleeve is above defensive target and should be trimmed back inside policy limits."
                              : "Log execution outcome and complete the loop to preserve disciplined behavior."}
                        </p>
                      </div>
                      <PreviewTag tone={tone === "green" ? "green" : tone === "amber" ? "amber" : "red"}>{level}</PreviewTag>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[22px] border border-white/8 bg-[#0a1738]/88 p-4">
                <div className="text-2xl font-semibold tracking-tight text-white">Daily Loop</div>
                <p className="mt-2 text-sm leading-6 text-white/54">Discipline, proof capture, progression tracking, and opportunity watch.</p>
                <div className="mt-5 space-y-4">
                  <MetricTile label="Streak" value="18 days" />
                  <MetricTile label="Proven value" value="+16.8%" tone="green" />
                  <MetricTile label="Receipts logged" value="24" />
                  <div className="rounded-2xl border border-white/8 bg-[#09122e]/88 p-4">
                    <div className="text-lg font-semibold text-white">Why close the loop?</div>
                    <p className="mt-2 text-sm leading-6 text-white/54">
                      Completing the loop reinforces execution discipline and improves long-term capital behavior tracking.
                    </p>
                    <div className="mt-5">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-white/44">Loop completion</div>
                      <div className="mt-2 flex items-center justify-between text-sm font-semibold text-white/70">
                        <span>Review</span>
                        <span>68%</span>
                      </div>
                      <div className="mt-2">
                        <MiniBar value="68%" tone="green" />
                      </div>
                    </div>
                    <button className="mt-5 rounded-2xl bg-[linear-gradient(135deg,#3f82ff,#5ea1ff)] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_36px_rgba(49,115,255,0.28)]">
                      Complete Loop
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </PreviewShell>
  );
}

function LandingAdvisorPreview() {
  return (
    <PreviewShell activeTab="Advisor">
      <div className="grid gap-4 p-5">
        <div className="grid gap-4 rounded-[24px] border border-white/8 bg-[#0a1534]/86 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <PreviewTag tone="green">Observe</PreviewTag>
            <PreviewTag>State: starter warmup</PreviewTag>
            <PreviewTag>Stability: live</PreviewTag>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-white/46">Start here</div>
              <div className="mt-2 text-4xl font-semibold tracking-tight text-white">Step 3: observe starter pack</div>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-white/62">
                Starter warmup is active. Let the initial allocation settle before fixing leaks or increasing risk.
              </p>
            </div>
            <button className="rounded-2xl bg-[linear-gradient(135deg,#3f82ff,#5ea1ff)] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_36px_rgba(49,115,255,0.28)]">
              Open Daily
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <MetricTile label="Strategic posture" value="Caution" tone="amber" />
            <MetricTile label="Plan alignment" value="High" tone="green" />
            <MetricTile label="Top blocker" value="Pricing coverage low" />
            <MetricTile label="Action gate" value="Blocked" tone="amber" />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[22px] border border-white/8 bg-[#0a1738]/88 p-4">
            <div className="flex items-center justify-between">
              <div className="text-2xl font-semibold tracking-tight text-white">Your Capital Strategy</div>
              <PreviewTag tone="green">High</PreviewTag>
            </div>
            <p className="mt-2 text-sm leading-6 text-white/54">Long-term positioning, safety posture, and alignment quality.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <MetricTile label="Investment goal" value="Growth with controlled risk" />
              <MetricTile label="Plan alignment" value="High" tone="green" />
              <MetricTile label="Capital posture" value="Caution" tone="amber" />
              <MetricTile label="Portfolio score" value="57/100" />
            </div>
          </div>

          <div className="rounded-[22px] border border-white/8 bg-[#0a1738]/88 p-4">
            <div className="flex items-center justify-between">
              <div className="text-2xl font-semibold tracking-tight text-white">Capital Protection</div>
              <PreviewTag tone="amber">Caution</PreviewTag>
            </div>
            <p className="mt-2 text-sm leading-6 text-white/54">Risk and survival controls behind long-term capital durability.</p>
            <div className="mt-5 rounded-2xl border border-white/8 bg-[#09122e]/88 p-4">
              <div className="text-sm font-medium text-white/80">Protection mode active (Protecting). New risk is paused.</div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <MetricTile label="Risk pressure" value="72/100" tone="amber" />
              <MetricTile label="Plan confidence" value="95/100" tone="green" />
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[22px] border border-white/8 bg-[#0a1738]/88 p-4">
            <div className="flex items-center justify-between">
              <div className="text-2xl font-semibold tracking-tight text-white">What limits faster growth?</div>
              <PreviewTag tone="amber">3 limiters</PreviewTag>
            </div>
            <p className="mt-2 text-sm leading-6 text-white/54">Top structural blockers and how Syntrake removes them.</p>
            <div className="mt-5 space-y-3">
              {[
                "Pricing coverage low",
                "Low daily closure discipline",
                "Pricing coverage quality",
              ].map((item) => (
                <div key={item} className="rounded-2xl border border-white/8 bg-[#09122e]/88 p-4">
                  <div className="text-lg font-semibold text-white">{item}</div>
                  <p className="mt-2 text-sm leading-6 text-white/54">Impact and next improvement are spelled out in plain language.</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[22px] border border-white/8 bg-[#0a1738]/88 p-4">
            <div className="flex items-center justify-between">
              <div className="text-2xl font-semibold tracking-tight text-white">Your Investor Evolution</div>
              <PreviewTag>AT_RISK</PreviewTag>
            </div>
            <p className="mt-2 text-sm leading-6 text-white/54">How your strategy behavior is improving over time.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <MetricTile label="Risk Control" value="45/100" />
              <MetricTile label="Execution Discipline" value="0/100" />
              <MetricTile label="Consistency" value="0/100" />
              <MetricTile label="Decision Quality" value="41/100" />
            </div>
          </div>
        </div>
      </div>
    </PreviewShell>
  );
}

function LandingPortfolioPreview() {
  return (
    <PreviewShell activeTab="Portfolio">
      <div className="grid gap-4 p-5">
        <div className="grid gap-4 rounded-[24px] border border-white/8 bg-[#0a1534]/86 p-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <PreviewTag>Portfolio overview</PreviewTag>
              <PreviewTag tone="amber">Step 3/3</PreviewTag>
              <PreviewTag tone="amber">Improve pricing quality</PreviewTag>
            </div>
            <div className="mt-3 text-4xl font-semibold tracking-tight text-white">Step 3: improve data quality</div>
            <p className="mt-3 text-sm leading-7 text-white/62">
              Coverage is still low. Re-check quality before following directives.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              <MetricTile label="Capital" value="1000 EUR" />
              <MetricTile label="Exposure" value="100%" />
              <MetricTile label="Cash buffer" value="0%" />
              <MetricTile label="Assets" value="4" />
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button className="rounded-2xl bg-[linear-gradient(135deg,#3f82ff,#5ea1ff)] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_36px_rgba(49,115,255,0.28)]">
                Re-check quality
              </button>
              <button className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-white/80">Sync portfolio</button>
              <button className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-white/80">Repair pricing</button>
            </div>
          </div>

          <div className="grid gap-3">
            <div className="rounded-2xl border border-white/8 bg-[#09122e]/88 p-4">
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold text-white">Plan alignment</span>
                <PreviewTag tone="green">High</PreviewTag>
              </div>
            </div>
            <div className="rounded-2xl border border-white/8 bg-[#09122e]/88 p-4">
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold text-white">Data coverage</span>
                <PreviewTag tone="amber">75%</PreviewTag>
              </div>
            </div>
            <div className="rounded-2xl border border-white/8 bg-[#09122e]/88 p-4">
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold text-white">Risk temperature</span>
                <PreviewTag tone="green">Balanced</PreviewTag>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[22px] border border-white/8 bg-[#0a1738]/88 p-4">
          <div className="text-2xl font-semibold tracking-tight text-white">Add holding</div>
          <p className="mt-2 text-sm leading-6 text-white/54">Search or paste. Keep symbols clean.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_220px]">
            <div className="rounded-2xl border border-white/8 bg-[#09122e]/88 px-4 py-3 text-white/44">Search: AAPL, MSFT, BTC, EURUSD...</div>
            <div className="rounded-2xl border border-white/8 bg-[#09122e]/88 px-4 py-3 text-white/44">Qty (optional)</div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_220px]">
            <div className="rounded-2xl border border-white/8 bg-[#09122e]/88 px-4 py-3 text-white/44">Paste list: AAPL MSFT TSLA BTC ETH...</div>
            <button className="rounded-2xl bg-[linear-gradient(135deg,#3f82ff,#5ea1ff)] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_36px_rgba(49,115,255,0.28)]">
              Add list
            </button>
          </div>
        </div>
      </div>
    </PreviewShell>
  );
}

function LandingAutonomyPreview() {
  return (
    <PreviewShell activeTab="Autonomy">
      <div className="grid gap-4 p-5">
        <div className="grid gap-4 rounded-[24px] border border-white/8 bg-[#0a1534]/86 p-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-white/46">Operational state</div>
            <div className="mt-3 text-4xl font-semibold tracking-tight text-white">OBSERVE: starter pack settling</div>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-white/62">
              Starter positions were just deployed. Let the initial allocation settle, observe fills, and monitor conditions before any remediation.
            </p>
            <div className="mt-5 rounded-2xl border border-white/8 bg-[#09122e]/88 p-4 text-sm text-white/80">
              Autonomy is observing the starter allocation while fills and early conditions settle.
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricTile label="Active mode" value="investing" />
              <MetricTile label="Last evaluation" value="never" />
              <MetricTile label="Execution tempo" value="defensive" />
              <MetricTile label="State source" value="Live" tone="green" />
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button className="rounded-2xl bg-[linear-gradient(135deg,#3f82ff,#5ea1ff)] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_36px_rgba(49,115,255,0.28)]">
                Refresh system status
              </button>
              <button className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-white/80">
                Start 7-day Pro Trial
              </button>
            </div>
          </div>

          <div className="grid gap-3">
            <MetricTile label="Operational state" value="Observing" />
            <MetricTile label="Next evaluation" value="2h 28m" />
          </div>
        </div>

        <div className="rounded-[22px] border border-white/8 bg-[#0a1738]/88 p-4">
          <div className="flex items-center justify-between">
            <div className="text-2xl font-semibold tracking-tight text-white">Your Autopilot is ready.</div>
            <PreviewTag tone="amber">Free</PreviewTag>
          </div>
          <p className="mt-2 text-sm leading-6 text-white/54">
            Syntrake completed overnight evaluation for your portfolio. Activate Pro to receive continuous daily decisions.
          </p>
          <div className="mt-5 rounded-2xl border border-white/8 bg-[#09122e]/88 p-4 text-white/72">
            Cancel anytime. No promises. Decisions are explainable and auditable.
          </div>
        </div>
      </div>
    </PreviewShell>
  );
}

function LandingTradingPreview() {
  return (
    <div className="h-full bg-[radial-gradient(circle_at_top,rgba(14,79,127,0.34),transparent_38%),linear-gradient(180deg,#07101f_0%,#09172b_100%)] text-white">
      <div className="border-b border-white/6 bg-[#081120]/94 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="h-5 w-5 rounded-full bg-[radial-gradient(circle_at_30%_30%,#87d5ff,#1b74ff)] shadow-[0_0_22px_rgba(73,123,255,0.42)]" />
            <span className="text-xs font-semibold tracking-tight">Syntrake Trading</span>
            <div className="ml-1 flex items-center gap-1.5 text-[10px]">
              {["Desk", "Opportunities", "Execution", "Risk", "Journal"].map((tab, index) => (
                <span
                  key={tab}
                  className={`rounded-full border px-2.5 py-1 ${
                    index === 1 ? "border-cyan-300/30 bg-cyan-300/10 text-white" : "border-transparent text-white/62"
                  }`}
                >
                  {tab}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px]">
            <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-cyan-100">Discovery</span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-white/72">London / NY</span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-5">
        <div className="grid gap-4 rounded-[24px] border border-white/8 bg-[#0a1534]/86 p-5 lg:grid-cols-[1.08fr_0.92fr]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <PreviewTag tone="blue">Desk open</PreviewTag>
              <PreviewTag tone="green">Clarity high</PreviewTag>
              <PreviewTag tone="amber">Risk capped</PreviewTag>
            </div>
            <div className="mt-3 text-4xl font-semibold tracking-tight text-white">NAS100 breakout continuation</div>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/62">
              Clean continuation setup with defined invalidation, broker-ready execution steps, and a capped risk frame.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              <MetricTile label="Setup clarity" value="84/100" tone="green" />
              <MetricTile label="Risk per trade" value="0.75%" tone="amber" />
              <MetricTile label="Session" value="NY open" />
              <MetricTile label="Expected path" value="2.1R" tone="cyan" />
            </div>
          </div>

          <div className="grid gap-3">
            <div className="rounded-2xl border border-white/8 bg-[#09122e]/88 p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/44">Execution frame</div>
              <div className="mt-3 text-2xl font-semibold text-white">Wait for reclaim and enter on confirmation</div>
              <p className="mt-2 text-sm leading-6 text-white/56">Checklist includes invalidation, target structure, and broker-ready quantity guidance.</p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-[#09122e]/88 p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/44">Journal continuity</div>
              <div className="mt-3 text-2xl font-semibold text-cyan-200">3 similar setups reviewed</div>
              <p className="mt-2 text-sm leading-6 text-white/56">Execution history and caution memory prevent repeating weak patterns under pressure.</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-[22px] border border-white/8 bg-[#0a1738]/88 p-4">
            <div className="flex items-center justify-between">
              <div className="text-2xl font-semibold tracking-tight text-white">Opportunity stack</div>
              <PreviewTag tone="blue">3 live</PreviewTag>
            </div>
            <div className="mt-5 space-y-3">
              {[
                ["NAS100", "Breakout continuation", "High clarity"],
                ["XAUUSD", "Late-US squeeze", "Watch only"],
                ["USDJPY", "Asia flow continuation", "Conditional"],
              ].map(([market, setup, note]) => (
                <div key={market} className="rounded-2xl border border-white/8 bg-[#09122e]/88 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold text-white">{market}</div>
                      <div className="text-sm text-white/58">{setup}</div>
                    </div>
                    <PreviewTag tone={note === "High clarity" ? "green" : note === "Watch only" ? "amber" : "blue"}>{note}</PreviewTag>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[22px] border border-white/8 bg-[#0a1738]/88 p-4">
            <div className="text-2xl font-semibold tracking-tight text-white">Risk framing</div>
            <p className="mt-2 text-sm leading-6 text-white/54">Execution only opens when invalidation, risk cap, and posture are aligned.</p>
            <div className="mt-5 space-y-3">
              <div className="grid grid-cols-[90px_1fr_48px] items-center gap-3 text-sm">
                <span className="font-semibold text-white/86">Clarity</span>
                <MiniBar value="84%" tone="green" />
                <span className="text-right font-semibold text-white/86">84</span>
              </div>
              <div className="grid grid-cols-[90px_1fr_48px] items-center gap-3 text-sm">
                <span className="font-semibold text-white/86">Pressure</span>
                <MiniBar value="41%" tone="amber" />
                <span className="text-right font-semibold text-white/86">41</span>
              </div>
              <div className="grid grid-cols-[90px_1fr_48px] items-center gap-3 text-sm">
                <span className="font-semibold text-white/86">Confidence</span>
                <MiniBar value="72%" tone="blue" />
                <span className="text-right font-semibold text-white/86">72</span>
              </div>
            </div>
          </div>

          <div className="rounded-[22px] border border-white/8 bg-[#0a1738]/88 p-4">
            <div className="text-2xl font-semibold tracking-tight text-white">Broker-ready output</div>
            <p className="mt-2 text-sm leading-6 text-white/54">Built for manual execution in your existing broker, not for locking you into a closed platform.</p>
            <div className="mt-5 space-y-3">
              <MetricTile label="Action" value="Wait / Confirm / Execute" />
              <MetricTile label="Invalidation" value="Defined" tone="amber" />
              <MetricTile label="Proof required" value="Yes" tone="green" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LandingDecisionPreview() {
  return (
    <div className="relative overflow-hidden bg-[radial-gradient(circle_at_20%_0%,rgba(88,171,255,0.22),transparent_34%),linear-gradient(180deg,#07101f_0%,#09172b_100%)] p-4 text-white">
      <div className="rounded-[26px] border border-white/12 bg-[#071326]/92 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-100/48">
              Live decision
            </div>
            <div className="mt-2 text-4xl font-semibold tracking-tight text-white">Prepare only</div>
          </div>
          <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-100">
            No broker order
          </span>
        </div>

        <p className="mt-4 max-w-xl text-sm leading-6 text-white/62">
          Syntrake does not trade for you. It tells you when not to click. This setup is building,
          but broker execution stays locked until the trigger, invalidation, and risk gate align.
        </p>

        <div className="mt-5 overflow-hidden rounded-[22px] border border-white/8 bg-[#071226]/92 p-4">
          <div className="mb-3 flex items-center justify-between gap-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/42">
            <span>Chart + trigger</span>
            <span>BTCUSD 5m</span>
          </div>
          <svg viewBox="0 0 520 180" className="h-[180px] w-full rounded-2xl bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.16),rgba(7,18,38,0.94))]" role="img" aria-label="Broker trigger chart preview">
            <path d="M24 118 C58 112 72 135 102 126 C132 117 146 82 176 91 C206 100 220 130 250 112 C280 94 294 68 324 78 C354 88 368 118 398 102 C428 86 442 48 496 58" fill="none" stroke="rgba(125,211,252,0.72)" strokeWidth="3" />
            <path d="M24 132 C72 134 118 130 164 136 C214 142 258 136 306 130 C364 122 414 124 496 116" fill="none" stroke="rgba(148,163,184,0.28)" strokeWidth="2" strokeDasharray="6 8" />
            <line x1="24" x2="496" y1="74" y2="74" stroke="#38bdf8" strokeWidth="2" strokeDasharray="8 7" />
            <line x1="24" x2="496" y1="132" y2="132" stroke="#fb7185" strokeWidth="2" strokeDasharray="7 7" />
            <rect x="24" y="78" width="472" height="20" fill="rgba(34,197,94,0.1)" stroke="rgba(34,197,94,0.2)" strokeDasharray="5 5" />
            <text x="34" y="66" fill="#7dd3fc" fontSize="13" fontWeight="700">Trigger 80777.0</text>
            <text x="34" y="150" fill="#fb7185" fontSize="13" fontWeight="700">Invalidation 80476.8</text>
            <text x="370" y="94" fill="#bbf7d0" fontSize="12" fontWeight="700">Entry zone</text>
          </svg>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">Trigger</div>
            <div className="mt-2 text-xl font-semibold text-white">80777.0</div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">Invalidation</div>
            <div className="mt-2 text-xl font-semibold text-white">80476.8</div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">Risk</div>
            <div className="mt-2 text-xl font-semibold text-amber-200">Locked</div>
          </div>
        </div>

        <div className="mt-5 grid gap-3">
          {[
            ["01", "Read Syntrake", "Trade, Wait, Prepare only, or Reduce risk."],
            ["02", "Open broker only if allowed", "No order is submitted while the gate is locked."],
            ["03", "Return with proof", "Save reference, fill, fees, and execution note."],
          ].map(([step, title, body]) => (
            <div key={step} className="grid grid-cols-[42px_1fr] gap-3 rounded-2xl border border-white/8 bg-[#091b33]/78 p-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-cyan-300/22 bg-cyan-300/10 text-xs font-semibold text-cyan-100">
                {step}
              </div>
              <div>
                <div className="text-sm font-semibold text-white">{title}</div>
                <div className="mt-1 text-xs leading-5 text-white/54">{body}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PathModeCard({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[26px] border border-white/10 bg-white/[0.04] p-6 text-center backdrop-blur">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
        <div className="h-8 w-8 rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(98,194,255,0.95),rgba(111,93,255,0.35))]" />
      </div>
      <div className="text-2xl font-semibold tracking-tight text-white">{title}</div>
      <p className="mt-2 text-sm leading-6 text-white/58">{body}</p>
    </div>
  );
}

function TrustPill({ label }: { label: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white/72">
      <span className="h-2 w-2 rounded-full bg-cyan-300" />
      {label}
    </div>
  );
}

function ProofPillarCard({
  label,
  title,
  body,
  accentClass,
}: {
  label: string;
  title: string;
  body: string;
  accentClass: string;
}) {
  return (
    <div className="rounded-[26px] border border-white/10 bg-white/[0.04] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${accentClass}`}>
        {label}
      </div>
      <div className="mt-4 text-xl font-semibold tracking-tight text-white">{title}</div>
      <p className="mt-3 text-sm leading-6 text-white/62">{body}</p>
    </div>
  );
}

function HeroStatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/42">{label}</div>
      <div className="mt-2 text-lg font-semibold tracking-tight text-white">{value}</div>
      <p className="mt-2 text-sm leading-6 text-white/60">{detail}</p>
    </div>
  );
}

function WorkspaceCard({
  kicker,
  title,
  body,
  bullets,
  ctaLabel,
  ctaHref,
  ctaEventTarget,
  accentClass,
}: {
  kicker: string;
  title: string;
  body: string;
  bullets: string[];
  ctaLabel: string;
  ctaHref: string;
  ctaEventTarget: string;
  accentClass: string;
}) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(10,21,52,0.9),rgba(8,17,42,0.88))] p-6 shadow-[0_24px_80px_rgba(5,12,34,0.32)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-100/45">{kicker}</div>
          <h3 className="mt-2 text-3xl font-semibold tracking-tight text-white">{title}</h3>
        </div>
        <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${accentClass}`}>{kicker}</span>
      </div>
      <p className="mt-4 max-w-xl text-sm leading-7 text-white/64">{body}</p>
      <div className="mt-5 space-y-3">
        {bullets.map((bullet) => (
          <div key={bullet} className="flex items-start gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-3 text-sm text-white/78">
            <span className="mt-1 h-2 w-2 rounded-full bg-cyan-300" />
            <span>{bullet}</span>
          </div>
        ))}
      </div>
      <TrackedLink
        href={ctaHref}
        eventName="cta_click"
        eventData={{ location: "home_workspace_split", target: ctaEventTarget }}
        className="mt-5 inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
      >
        {ctaLabel}
      </TrackedLink>
    </div>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<PageSearchParams> | PageSearchParams;
}) {
  const { userId } = await auth();
  if (userId) redirect("/app");
  const params =
    searchParams && typeof (searchParams as Promise<PageSearchParams>).then === "function"
      ? await (searchParams as Promise<PageSearchParams>)
      : (searchParams as PageSearchParams | undefined);
  const lang = await resolveRequestSiteLang(params);
  const link = (href: string) => withLangQuery(href, lang);
  const proofPillars = [
    {
      label: t(lang, { en: "Free first", pt: "Gratis primeiro", es: "Gratis primero", fr: "Gratuit d abord", de: "Zuerst kostenlos", it: "Gratis prima" }),
      title: t(lang, {
        en: "The product proves value before the paywall gets serious.",
        pt: "O produto prova valor antes da paywall ficar seria.",
        es: "El producto demuestra valor antes de que la paywall se vuelva seria.",
        fr: "Le produit prouve sa valeur avant que la paywall ne devienne serieuse.",
        de: "Das Produkt beweist Wert, bevor die Paywall ernst wird.",
        it: "Il prodotto dimostra valore prima che la paywall diventi seria.",
      }),
      body: t(lang, {
        en: "Investing stays free forever. Trading opens in discovery mode so users can inspect the desk before paying for execution depth.",
        pt: "Investing fica gratis para sempre. Trading abre em discovery mode para que o utilizador veja a desk antes de pagar por profundidade de execucao.",
        es: "Investing permanece gratis para siempre. Trading se abre en discovery mode para que el usuario vea la desk antes de pagar por profundidad de ejecucion.",
        fr: "Investing reste gratuit pour toujours. Trading s ouvre en mode decouverte pour que l utilisateur inspecte le desk avant de payer pour plus de profondeur d execution.",
        de: "Investing bleibt fuer immer kostenlos. Trading oeffnet im Discovery-Modus, damit Nutzer das Desk sehen koennen, bevor sie fuer Execution-Tiefe zahlen.",
        it: "Investing resta gratis per sempre. Trading si apre in modalita discovery cosi l utente puo vedere la desk prima di pagare per piu profondita di esecuzione.",
      }),
      accentClass: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
    },
    {
      label: t(lang, { en: "Broker independent", pt: "Broker independente", es: "Broker independiente", fr: "Broker independant", de: "Broker-unabhaengig", it: "Broker indipendente" }),
      title: t(lang, {
        en: "Syntrake is not trying to trap capital inside a closed platform.",
        pt: "O Syntrake nao tenta prender capital numa plataforma fechada.",
        es: "Syntrake no intenta atrapar capital dentro de una plataforma cerrada.",
        fr: "Syntrake n essaie pas d enfermer le capital dans une plateforme fermee.",
        de: "Syntrake versucht nicht, Kapital in einer geschlossenen Plattform einzusperren.",
        it: "Syntrake non cerca di intrappolare il capitale in una piattaforma chiusa.",
      }),
      body: t(lang, {
        en: "Users keep their own broker. Syntrake adds planning, risk framing, execution checklists, and proof capture around that broker workflow.",
        pt: "O utilizador fica com o proprio broker. O Syntrake acrescenta planeamento, enquadramento de risco, checklists de execucao e captura de prova a volta desse workflow.",
        es: "El usuario mantiene su propio broker. Syntrake anade planificacion, marco de riesgo, checklists de ejecucion y captura de prueba alrededor de ese flujo.",
        fr: "L utilisateur garde son propre broker. Syntrake ajoute planification, cadrage du risque, checklists d execution et capture de preuve autour de ce workflow.",
        de: "Nutzer behalten ihren eigenen Broker. Syntrake fuegt Planung, Risikorahmen, Execution-Checklisten und Proof-Capture um diesen Workflow herum hinzu.",
        it: "L utente mantiene il proprio broker. Syntrake aggiunge pianificazione, cornice di rischio, checklist di esecuzione e cattura della prova attorno a quel workflow.",
      }),
      accentClass: "border-cyan-300/20 bg-cyan-300/10 text-cyan-100",
    },
    {
      label: t(lang, { en: "Explainable", pt: "Explicavel", es: "Explicable", fr: "Explicable", de: "Erklaerbar", it: "Spiegabile" }),
      title: t(lang, {
        en: "Every action should come with context, caps, and a reason.",
        pt: "Cada acao deve vir com contexto, limites e uma razao.",
        es: "Cada accion debe venir con contexto, limites y una razon.",
        fr: "Chaque action doit venir avec contexte, limites et une raison.",
        de: "Jede Aktion soll Kontext, Limits und einen Grund haben.",
        it: "Ogni azione deve arrivare con contesto, limiti e una ragione.",
      }),
      body: t(lang, {
        en: "The engine is built around one next action, a risk frame, plain-language rationale, and a before-vs-after view that users can inspect.",
        pt: "O motor foi construido a volta de uma proxima acao, uma moldura de risco, racional em linguagem simples e uma vista antes-vs-depois que o utilizador pode inspecionar.",
        es: "El motor esta construido alrededor de una siguiente accion, un marco de riesgo, razonamiento en lenguaje claro y una vista antes-vs-despues que el usuario puede inspeccionar.",
        fr: "Le moteur est construit autour d une action suivante, d un cadre de risque, d une rationale claire et d une vue avant-apres que l utilisateur peut inspecter.",
        de: "Die Engine ist rund um eine naechste Aktion, einen Risikorahmen, klare Begruendung und eine Vorher-Nachher-Ansicht gebaut, die Nutzer pruefen koennen.",
        it: "Il motore e costruito attorno a una prossima azione, una cornice di rischio, razionale chiaro e una vista prima-dopo che l utente puo ispezionare.",
      }),
      accentClass: "border-violet-300/20 bg-violet-300/10 text-violet-100",
    },
    {
      label: t(lang, { en: "Transparent trust", pt: "Confianca transparente", es: "Confianza transparente", fr: "Confiance transparente", de: "Transparente Vertrauensbasis", it: "Fiducia trasparente" }),
      title: t(lang, {
        en: "Trust is visible in billing, auth, disclosures, and operator flow.",
        pt: "A confianca fica visivel na cobranca, autenticacao, disclosures e fluxo do operador.",
        es: "La confianza se vuelve visible en cobro, autenticacion, disclosures y flujo del operador.",
        fr: "La confiance devient visible dans la facturation, l authentification, les disclosures et le flux operateur.",
        de: "Vertrauen wird in Billing, Auth, Disclosure und Operator-Flow sichtbar.",
        it: "La fiducia diventa visibile in billing, autenticazione, disclosure e flusso operativo.",
      }),
      body: t(lang, {
        en: "Users can inspect the trust center, legal disclosures, Stripe billing, Clerk auth, and the manual execution workflow before they commit.",
        pt: "O utilizador pode inspecionar o trust center, disclosures legais, cobranca Stripe, autenticacao Clerk e o workflow manual antes de se comprometer.",
        es: "El usuario puede inspeccionar el trust center, disclosures legales, cobro con Stripe, autenticacion Clerk y el flujo manual antes de comprometerse.",
        fr: "L utilisateur peut inspecter le trust center, les disclosures legales, la facturation Stripe, l auth Clerk et le workflow manuel avant de s engager.",
        de: "Nutzer koennen Trust Center, rechtliche Hinweise, Stripe-Billing, Clerk-Auth und den manuellen Workflow pruefen, bevor sie sich festlegen.",
        it: "L utente puo ispezionare trust center, disclosure legali, billing Stripe, auth Clerk e workflow manuale prima di impegnarsi.",
      }),
      accentClass: "border-amber-300/20 bg-amber-300/10 text-amber-100",
    },
  ];

  return (
    <main className="syn-home min-h-screen bg-[#060b18] pb-24 text-ink-900 md:pb-0">
      <div className="absolute inset-x-0 top-0 -z-10 h-[1120px] bg-[radial-gradient(circle_at_top_left,rgba(46,95,255,0.22),transparent_35%),radial-gradient(circle_at_top_right,rgba(132,87,255,0.16),transparent_32%),radial-gradient(circle_at_center,rgba(42,73,180,0.18),transparent_55%),linear-gradient(180deg,#07112a_0%,#081230_40%,#060b18_100%)]" />
      <div className="absolute inset-x-0 top-0 -z-10 h-[1120px] bg-[linear-gradient(180deg,rgba(255,255,255,0.05)_0,transparent_8%),radial-gradient(circle_at_20%_18%,rgba(255,255,255,0.08),transparent_0.7%),radial-gradient(circle_at_38%_24%,rgba(255,255,255,0.08),transparent_0.7%),radial-gradient(circle_at_64%_12%,rgba(255,255,255,0.08),transparent_0.7%),radial-gradient(circle_at_78%_30%,rgba(255,255,255,0.07),transparent_0.8%),radial-gradient(circle_at_15%_72%,rgba(255,255,255,0.06),transparent_0.8%)] opacity-60" />
      <header className="sticky top-0 z-40 border-b border-white/8 bg-[#071128]/72 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <Link href={link("/")} className="flex items-center gap-3 text-white">
            <div className="h-10 w-10 rounded-full bg-[radial-gradient(circle_at_30%_30%,#56a3ff,#235cff)] shadow-[0_0_40px_rgba(66,120,255,0.45)]" />
            <div className="text-2xl font-semibold tracking-tight">Syntrake</div>
          </Link>

          <nav className="hidden items-center gap-8 text-sm font-semibold md:flex">
            <a href="#decision" className="text-white opacity-70 transition hover:opacity-100">Decision</a>
            <a href="#broker-command" className="text-white opacity-70 transition hover:opacity-100">Broker flow</a>
            <a href="#trading-workspace" className="text-white opacity-70 transition hover:opacity-100">Product</a>
            <a href="#value-proof" className="text-white opacity-70 transition hover:opacity-100">Proof</a>
          </nav>

          <div className="flex items-center gap-3">
            <LanguageSwitcher compact />
            <Link
              href={link("/sign-in")}
              className="hidden items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-white/72 transition hover:bg-white/[0.06] hover:text-white md:inline-flex"
            >
              {t(lang, { en: "Sign in", pt: "Entrar", es: "Entrar", fr: "Connexion", de: "Anmelden", it: "Accedi" })}
            </Link>
            <TrackedLink
              href={link("/sign-up")}
              eventName="cta_click"
              eventData={{ location: "home_header", target: "sign_up" }}
              className="hidden items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#7b6df5,#ff5aa5)] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_60px_rgba(132,89,255,0.28)] transition hover:opacity-95 sm:inline-flex"
            >
              {t(lang, { en: "See Today's Plan", pt: "Ver plano de hoje", es: "Ver plan de hoy", fr: "Voir le plan du jour", de: "Heutigen Plan sehen", it: "Vedi piano di oggi" })}
            </TrackedLink>
          </div>
        </div>
      </header>

      <section id="decision" className="mx-auto max-w-7xl px-6 pt-14 pb-8 text-white md:pt-16">
        <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <div className="pt-3 lg:pt-8">
            <div className="flex flex-wrap items-center gap-3 text-sm text-white/72">
              <TrustPill
                label={t(lang, {
                  en: "Fresh-data gate",
                  pt: "Gate de dados frescos",
                  es: "Gate de datos frescos",
                  fr: "Gate donnees fraiches",
                  de: "Fresh-Data-Gate",
                  it: "Gate dati freschi",
                })}
              />
              <TrustPill
                label={t(lang, {
                  en: "Trade / Wait / Reduce risk",
                  pt: "Entrar / Esperar / Reduzir risco",
                  es: "Entrar / Esperar / Reducir riesgo",
                  fr: "Trader / Attendre / Reduire risque",
                  de: "Handeln / Warten / Risiko senken",
                  it: "Entrare / Aspettare / Ridurre rischio",
                })}
              />
              <TrustPill
                label={t(lang, {
                  en: "Use your broker",
                  pt: "Usa o teu broker",
                  es: "Usa tu broker",
                  fr: "Utilisez votre broker",
                  de: "Nutze deinen Broker",
                  it: "Usa il tuo broker",
                })}
              />
            </div>

            <h1 className="mt-7 max-w-3xl text-5xl font-semibold leading-[0.95] tracking-[-0.045em] text-white md:text-7xl">
              {t(lang, {
                en: "Know when to trade. Know when not to click.",
                pt: "Sabe quando entrar. Sabe quando nao clicar.",
                es: "Sabe cuando operar. Sabe cuando no hacer clic.",
                fr: "Sachez quand trader. Sachez quand ne pas cliquer.",
                de: "Wisse, wann du handelst. Wisse, wann du nicht klickst.",
                it: "Sai quando entrare. Sai quando non cliccare.",
              })}
            </h1>

            <p className="mt-6 max-w-2xl text-[20px] leading-8 text-white/66">
              {t(lang, {
                en: "Syntrake is a pre-broker decision layer. It checks live freshness, setup quality, trigger, invalidation, and risk before your money reaches the broker ticket.",
                pt: "O Syntrake e uma camada de decisao antes do broker. Verifica frescura live, qualidade do setup, trigger, invalidation e risco antes do teu dinheiro chegar ao ticket do broker.",
                es: "Syntrake es una capa de decision antes del broker. Comprueba frescura live, calidad del setup, trigger, invalidation y riesgo antes del ticket del broker.",
                fr: "Syntrake est une couche de decision avant le broker. Il verifie fraicheur live, qualite du setup, trigger, invalidation et risque avant le ticket broker.",
                de: "Syntrake ist eine Entscheidungsschicht vor dem Broker. Es prueft Live-Frische, Setup-Qualitaet, Trigger, Invalidation und Risiko vor dem Broker-Ticket.",
                it: "Syntrake e uno strato decisionale prima del broker. Controlla freschezza live, qualita setup, trigger, invalidation e rischio prima del ticket broker.",
              })}
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <TrackedLink
                href={link("/sign-up")}
                eventName="cta_click"
                eventData={{ location: "home_compact_hero", target: "sign_up" }}
                className="inline-flex items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#8b6bff,#ff5aa5)] px-7 py-4 text-base font-semibold text-white shadow-[0_22px_60px_rgba(132,89,255,0.28)] transition hover:opacity-95"
              >
                {t(lang, { en: "See Today's Plan", pt: "Ver plano de hoje", es: "Ver plan de hoy", fr: "Voir le plan du jour", de: "Heutigen Plan sehen", it: "Vedi piano di oggi" })}
              </TrackedLink>
              <TrackedLink
                href={link("/pricing")}
                eventName="cta_click"
                eventData={{ location: "home_compact_hero", target: "pricing" }}
                className="inline-flex items-center justify-center rounded-2xl border border-white/12 bg-white/[0.03] px-7 py-4 text-base font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition hover:bg-white/[0.06]"
              >
                {t(lang, { en: "See pricing", pt: "Ver precos", es: "Ver precios", fr: "Voir tarifs", de: "Preise ansehen", it: "Vedi prezzi" })}
              </TrackedLink>
            </div>

            <div className="mt-6 rounded-[26px] border border-cyan-300/15 bg-cyan-300/[0.07] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-100/55">
                {t(lang, { en: "Monthly value test", pt: "Teste de valor mensal" })}
              </div>
              <p className="mt-2 text-sm leading-6 text-white/72">
                {t(lang, {
                  en: "Syntrake is worth paying for when it improves the broker click: fresh-data gate, no-trade discipline, trigger, invalidation, risk cap, and proof. Not a profit promise.",
                  pt: "O Syntrake vale pagar quando melhora o clique no broker: dados frescos, disciplina de nao operar, trigger, invalidation, limite de risco e prova. Nao e promessa de lucro.",
                })}
              </p>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <HeroStatCard
                label={t(lang, { en: "Baseline lab", pt: "Laboratorio baseline", es: "Laboratorio baseline", fr: "Laboratoire baseline", de: "Baseline-Labor", it: "Laboratorio baseline" })}
                value="PF 1.69"
                detail={t(lang, {
                  en: "Current baseline snapshot: 243 trades, 44.44% WR, +0.20R expectancy. Not a guarantee.",
                  pt: "Snapshot baseline atual: 243 trades, 44.44% WR, +0.20R expectancy. Nao e garantia.",
                })}
              />
              <HeroStatCard
                label={t(lang, { en: "Crisis honesty", pt: "Honestidade em crise", es: "Honestidad en crisis", fr: "Honnetete crise", de: "Krisen-Ehrlichkeit", it: "Onesta in crisi" })}
                value={t(lang, { en: "Weak is blocked", pt: "Fraco e bloqueado" })}
                detail={t(lang, {
                  en: "Crisis readings are still weak, so the product must slow execution instead of selling false certainty.",
                  pt: "Em crise ainda esta fraco, por isso o produto deve travar execucao em vez de vender falsa certeza.",
                })}
              />
              <HeroStatCard
                label={t(lang, { en: "Broker plan", pt: "Plano broker", es: "Plan broker", fr: "Plan broker", de: "Broker-Plan", it: "Piano broker" })}
                value={t(lang, { en: "Trigger + chart", pt: "Trigger + grafico" })}
                detail={t(lang, {
                  en: "The trigger, entry zone, invalidation, risk, and proof trail stay visible before action.",
                  pt: "Trigger, zona de entrada, invalidation, risco e prova ficam visiveis antes da acao.",
                })}
              />
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[560px] lg:ml-auto">
            <div className="absolute -inset-5 rounded-[38px] bg-[radial-gradient(circle_at_center,rgba(94,161,255,0.22),transparent_68%)] blur-2xl" />
            <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[#09112a]/78 shadow-[0_30px_100px_rgba(5,12,34,0.48)]">
              <LandingDecisionPreview />
            </div>
          </div>
        </div>
      </section>

      <section id="broker-command" className="mx-auto max-w-7xl px-6 py-7 text-white">
        <div className="rounded-[34px] border border-white/10 bg-[linear-gradient(135deg,rgba(11,23,54,0.94),rgba(7,15,34,0.9))] p-6 shadow-[0_28px_90px_rgba(5,12,34,0.32)] md:p-8">
          <div className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-end">
            <div className="max-w-2xl">
            <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-100/45">
              {t(lang, { en: "How it should feel", pt: "Como deve ser", es: "Como debe sentirse", fr: "Comment ca doit se sentir", de: "Wie es sich anfuehlen soll", it: "Come deve sentirsi" })}
            </div>
            <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-white md:text-4xl">
              {t(lang, {
                en: "Open Syntrake first. Open the broker only if the gate allows it.",
                pt: "Abres o Syntrake primeiro. Abres o broker so se o gate permitir.",
                es: "Abre Syntrake primero. Abre el broker solo si el gate lo permite.",
                fr: "Ouvrez Syntrake d abord. Ouvrez le broker seulement si le gate le permet.",
                de: "Oeffne zuerst Syntrake. Den Broker nur, wenn das Gate es erlaubt.",
                it: "Apri prima Syntrake. Apri il broker solo se il gate lo consente.",
              })}
            </h2>
            </div>

          <div className="grid gap-3 md:grid-cols-3">
            {[
              {
                step: "01",
                title: t(lang, { en: "Read the call", pt: "Le a decisao" }),
                body: t(lang, {
                  en: "Trade, Wait, Prepare only, or Reduce risk. No ambiguity.",
                  pt: "Entrar, Esperar, Preparar apenas ou Reduzir risco. Sem ambiguidade.",
                }),
              },
              {
                step: "02",
                title: t(lang, { en: "Check broker plan", pt: "Confirma plano do broker" }),
                body: t(lang, {
                  en: "Trigger, entry zone, invalidation, risk, and target stay visible before action.",
                  pt: "Trigger, zona de entrada, invalidation, risco e target ficam visiveis antes da acao.",
                }),
              },
              {
                step: "03",
                title: t(lang, { en: "Return with proof", pt: "Volta com prova" }),
                body: t(lang, {
                  en: "Save broker reference and execution details so the loop becomes auditable.",
                  pt: "Guarda referencia do broker e detalhes de execucao para o loop ficar auditavel.",
                }),
              },
            ].map((item) => (
              <div key={item.step} className="rounded-[24px] border border-white/8 bg-white/[0.035] p-5 transition hover:-translate-y-0.5 hover:bg-white/[0.055]">
                <div className="text-sm font-semibold text-cyan-200">{item.step}</div>
                <div className="mt-3 text-xl font-semibold text-white">{item.title}</div>
                <p className="mt-3 text-sm leading-6 text-white/62">{item.body}</p>
              </div>
            ))}
            </div>
          </div>
        </div>
      </section>

      <section id="trading-workspace" className="mx-auto max-w-7xl px-6 py-7 text-white">
        <div className="grid gap-4 lg:grid-cols-3">
          {[
            {
              title: t(lang, { en: "Freshness before action", pt: "Frescura antes da acao" }),
              body: t(lang, {
                en: "If live data is stale, Syntrake should block broker-ready execution instead of pretending certainty.",
                pt: "Se os dados live estao stale, o Syntrake deve bloquear execucao pronta para broker em vez de fingir certeza.",
              }),
            },
            {
              title: t(lang, { en: "No-trade is a feature", pt: "Nao entrar e uma feature" }),
              body: t(lang, {
                en: "The product is valuable when it stops weak trades, not only when it finds entries.",
                pt: "O produto tem valor quando trava trades fracos, nao so quando encontra entradas.",
              }),
            },
            {
              title: t(lang, { en: "Broker independent", pt: "Independente do broker" }),
              body: t(lang, {
                en: "Users keep their broker. Syntrake adds the decision layer, checklist, and proof trail around it.",
                pt: "O utilizador mantem o broker. O Syntrake adiciona decisao, checklist e prova a volta disso.",
              }),
            },
          ].map((item) => (
            <div key={item.title} className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(11,23,54,0.72),rgba(7,15,34,0.82))] p-6 shadow-[0_18px_60px_rgba(5,12,34,0.22)]">
              <div className="text-xl font-semibold tracking-tight text-white">{item.title}</div>
              <p className="mt-4 text-sm leading-7 text-white/64">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="value-proof" className="mx-auto max-w-7xl px-6 py-10 text-white">
        <div className="rounded-[36px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(139,107,255,0.2),transparent_34%),linear-gradient(180deg,rgba(12,24,58,0.94),rgba(7,15,34,0.96))] p-7 shadow-[0_28px_100px_rgba(5,12,34,0.38)] md:p-9">
          <div className="grid gap-8 lg:grid-cols-[1fr_0.8fr] lg:items-center">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-100/45">
                {t(lang, { en: "Why pay monthly", pt: "Porque pagar mensalmente" })}
              </div>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-5xl">
                {t(lang, {
                  en: "Because the expensive moment is not analysis. It is the click inside the broker.",
                  pt: "Porque o momento caro nao e a analise. E o clique dentro do broker.",
                })}
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-8 text-white/66">
                {t(lang, {
                  en: "Syntrake earns its place when it makes that click calmer, more selective, and easier to audit.",
                  pt: "O Syntrake ganha lugar quando torna esse clique mais calmo, mais seletivo e mais facil de auditar.",
                })}
              </p>
            </div>
            <div className="space-y-3">
              {[
                {
                  label: "Baseline",
                  value: "PF 1.69 / 243 trades",
                  detail: t(lang, {
                    en: "Current baseline remains profitable, but still needs discipline and freshness gates.",
                    pt: "O baseline atual continua lucrativo, mas ainda precisa de disciplina e gates de frescura.",
                  }),
                },
                {
                  label: "Crisis",
                  value: "Not good enough yet",
                  detail: t(lang, {
                    en: "Crisis mode is the honest warning: reduce action when the regime is not validated.",
                    pt: "O modo crise e o aviso honesto: reduzir acao quando o regime nao esta validado.",
                  }),
                },
                {
                  label: "Execution",
                  value: "Trigger before broker",
                  detail: t(lang, {
                    en: "Every broker step should start from trigger, entry zone, invalidation, risk, and proof.",
                    pt: "Cada passo no broker deve comecar por trigger, zona de entrada, invalidation, risco e prova.",
                  }),
                },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-white/8 bg-white/[0.04] p-4 text-sm text-white/82">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100/45">{item.label}</div>
                  <div className="mt-2 text-lg font-semibold text-white">{item.value}</div>
                  <p className="mt-2 text-xs leading-5 text-white/58">{item.detail}</p>
                </div>
              ))}
              <TrackedLink
                href={link("/sign-up")}
                eventName="cta_click"
                eventData={{ location: "home_compact_value", target: "sign_up" }}
                className="mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#8b6bff,#ff5aa5)] px-6 py-4 text-base font-semibold text-white shadow-[0_22px_60px_rgba(132,89,255,0.28)] transition hover:opacity-95"
              >
                {t(lang, { en: "Start with today's plan", pt: "Comecar com o plano de hoje" })}
              </TrackedLink>
            </div>
          </div>
        </div>
      </section>

      {false ? (
        <>
      <section className="mx-auto max-w-7xl px-6 pt-16 pb-12 text-white md:pt-20">
        <div className="grid gap-12 lg:grid-cols-[1.02fr_0.98fr] lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-white/72">
              <TrustPill
                label={t(lang, {
                  en: "Investing free forever",
                  pt: "Investing gratis para sempre",
                  es: "Investing gratis para siempre",
                  fr: "Investing gratuit pour toujours",
                  de: "Investing fuer immer kostenlos",
                  it: "Investing gratis per sempre",
                })}
              />
              <TrustPill
                label={t(lang, {
                  en: "Trading discovery starts free",
                  pt: "Trading discovery comeca gratis",
                  es: "Trading discovery empieza gratis",
                  fr: "Trading decouverte commence gratuitement",
                  de: "Trading Discovery startet kostenlos",
                  it: "Trading discovery parte gratis",
                })}
              />
              <TrustPill
                label={t(lang, {
                  en: "Use your external broker",
                  pt: "Usa o teu broker externo",
                  es: "Usa tu broker externo",
                  fr: "Utilisez votre broker externe",
                  de: "Nutze deinen externen Broker",
                  it: "Usa il tuo broker esterno",
                })}
              />
            </div>

            <h1 className="mt-8 max-w-3xl text-5xl font-semibold tracking-[-0.04em] text-white md:text-7xl">
              {t(lang, {
                en: "Know today's trade, wait, or reduce-risk call before you touch the broker.",
                pt: "Sabe se hoje e para entrar, esperar ou reduzir risco antes de tocares no broker.",
                es: "Antes de abrir el broker, sabe si debes operar o esperar.",
                fr: "Avant d ouvrir le broker, sachez s il faut trader ou attendre.",
                de: "Bevor du den Broker oeffnest, weiss du ob du handeln oder warten solltest.",
                it: "Prima di aprire il broker, sai se entrare o aspettare.",
              })}
            </h1>

            <p className="mt-6 max-w-2xl text-[22px] leading-9 text-white/64">
              {t(lang, {
                en: "Syntrake turns live market data, setup quality, regime risk, and execution rules into one practical decision: act, wait, or protect capital.",
                pt: "O Syntrake transforma dados live, qualidade do setup, risco de regime e regras de execucao numa decisao pratica: agir, esperar ou proteger capital.",
                es: "Syntrake comprueba datos live, calidad del setup, riesgo de regimen y reglas de ejecucion, luego te da una checklist lista para broker o un WAIT claro.",
                fr: "Syntrake verifie les donnees live, la qualite du setup, le risque de regime et les regles d execution, puis donne une checklist broker ou un WAIT clair.",
                de: "Syntrake prueft Live-Daten, Setup-Qualitaet, Regime-Risiko und Execution-Regeln und gibt dir dann eine brokerfertige Checkliste oder ein klares WAIT.",
                it: "Syntrake controlla dati live, qualita del setup, rischio di regime e regole di esecuzione, poi offre una checklist broker-ready o un WAIT chiaro.",
              })}
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <TrackedLink
                href={link("/sign-up")}
                eventName="cta_click"
                eventData={{ location: "home_hero", target: "sign_up" }}
                className="inline-flex items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#8b6bff,#ff5aa5)] px-7 py-4 text-base font-semibold text-white shadow-[0_22px_60px_rgba(132,89,255,0.28)] transition hover:opacity-95"
              >
                {t(lang, { en: "See Today's Plan", pt: "Ver plano de hoje", es: "Ver plan de hoy", fr: "Voir le plan du jour", de: "Heutigen Plan sehen", it: "Vedi piano di oggi" })}
              </TrackedLink>
              <TrackedLink
                href={link("/how-it-works")}
                eventName="cta_click"
                eventData={{ location: "home_hero", target: "how_it_works" }}
                className="inline-flex items-center justify-center rounded-2xl border border-white/12 bg-white/[0.03] px-7 py-4 text-base font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition hover:bg-white/[0.06]"
              >
                {t(lang, {
                  en: "Inspect How It Decides",
                  pt: "Ver como decide",
                  es: "Ver precios",
                  fr: "Voir les tarifs",
                  de: "Preise ansehen",
                  it: "Vedi prezzi",
                })}
              </TrackedLink>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <HeroStatCard
                label={t(lang, { en: "Live data", pt: "Dados live", es: "Datos live", fr: "Donnees live", de: "Live-Daten", it: "Dati live" })}
                value={t(lang, { en: "Fresh or blocked", pt: "Fresco ou bloqueado", es: "Fresco o bloqueado", fr: "Frais ou bloque", de: "Frisch oder blockiert", it: "Fresco o bloccato" })}
                detail={t(lang, {
                  en: "Open markets are not treated as executable when snapshots are stale, fallback-only, or not provider-backed.",
                  pt: "Mercados abertos nao sao tratados como executaveis quando o snapshot esta stale, em fallback ou sem provider live.",
                })}
              />
              <HeroStatCard
                label={t(lang, { en: "Trading", pt: "Trading", es: "Trading", fr: "Trading", de: "Trading", it: "Trading" })}
                value={t(lang, { en: "Trade / Wait gate", pt: "Gate Trade / Wait", es: "Gate Trade / Wait", fr: "Gate Trade / Wait", de: "Trade / Wait Gate", it: "Gate Trade / Wait" })}
                detail={t(lang, {
                  en: "A good-looking setup can still become WAIT when regime, freshness, or risk quality is weak.",
                  pt: "Um setup bonito pode continuar a virar WAIT quando regime, frescura ou qualidade de risco estao fracos.",
                })}
              />
              <HeroStatCard
                label={t(lang, { en: "Execution", pt: "Execucao", es: "Ejecucion", fr: "Execution", de: "Execution", it: "Esecuzione" })}
                value={t(lang, { en: "Broker checklist", pt: "Checklist para broker", es: "Checklist para broker", fr: "Checklist broker", de: "Broker-Checkliste", it: "Checklist broker" })}
                detail={t(lang, {
                  en: "If action is allowed, the output is designed to be copied into eToro, XTB, or another broker workflow.",
                  pt: "Se a acao for permitida, o output e pensado para ser levado para eToro, XTB ou outro broker.",
                })}
              />
              <HeroStatCard
                label={t(lang, { en: "Trust", pt: "Confianca", es: "Confianza", fr: "Confiance", de: "Vertrauen", it: "Fiducia" })}
                value={t(lang, { en: "No magic claims", pt: "Sem promessas magicas", es: "Sin promesas magicas", fr: "Sans promesses magiques", de: "Keine magischen Versprechen", it: "Nessuna promessa magica" })}
                detail={t(lang, {
                  en: "The product sells process discipline, not guaranteed profit. Risk and weak conditions stay visible.",
                  pt: "O produto vende disciplina de processo, nao lucro garantido. Risco e condicoes fracas ficam visiveis.",
                })}
              />
            </div>

            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/50">
              <Link href={link("/how-it-works")} className="transition hover:text-white">
                {t(lang, { en: "How it works", pt: "Como funciona", es: "Como funciona", fr: "Comment ca marche", de: "So funktioniert es", it: "Come funziona" })}
              </Link>
              <Link href={link("/why-syntrake")} className="transition hover:text-white">
                {t(lang, { en: "Why pay monthly", pt: "Porque pagar mensalmente", es: "Por que pagar cada mes", fr: "Pourquoi payer chaque mois", de: "Warum monatlich zahlen", it: "Perche pagare ogni mese" })}
              </Link>
              <Link href={link("/pricing")} className="transition hover:text-white">
                {t(lang, { en: "Pricing", pt: "Precos", es: "Precios", fr: "Tarifs", de: "Preise", it: "Prezzi" })}
              </Link>
              <Link href={link("/trust")} className="transition hover:text-white">
                {t(lang, { en: "Trust", pt: "Confianca", es: "Confianza", fr: "Confiance", de: "Vertrauen", it: "Fiducia" })}
              </Link>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 rounded-[36px] bg-[radial-gradient(circle_at_center,rgba(98,194,255,0.2),transparent_65%)] blur-2xl" />
            <div className="relative overflow-hidden rounded-[36px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,28,72,0.96),rgba(11,20,52,0.92))] p-4 shadow-[0_40px_120px_rgba(7,15,40,0.55)]">
              <div className="mb-4 flex items-center justify-between px-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100/45">
                <span>{t(lang, { en: "Live Syntrake Workflow", pt: "Fluxo Syntrake em direto", es: "Flujo Syntrake en directo", fr: "Flux Syntrake en direct", de: "Live Syntrake Workflow", it: "Flusso Syntrake in tempo reale" })}</span>
                <span className="text-white/36">{t(lang, { en: "Daily / Advisor / Portfolio / Autonomy", pt: "Daily / Advisor / Portfolio / Autonomy", es: "Daily / Advisor / Portfolio / Autonomy", fr: "Daily / Advisor / Portfolio / Autonomy", de: "Daily / Advisor / Portfolio / Autonomy", it: "Daily / Advisor / Portfolio / Autonomy" })}</span>
              </div>
              <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#09112a]/80">
                <div className="aspect-[16/10]">
                  <LandingDailyPreview compact />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="broker-command" className="mx-auto max-w-7xl px-6 pb-12 text-white">
        <div className="grid gap-6 rounded-[34px] border border-white/10 bg-[linear-gradient(135deg,rgba(8,17,42,0.96),rgba(16,25,62,0.94))] p-6 shadow-[0_34px_110px_rgba(5,12,34,0.42)] md:p-8 lg:grid-cols-[1.08fr_0.92fr]">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-100/45">
              {t(lang, { en: "The 30-second broker check", pt: "O check de 30 segundos antes do broker" })}
            </div>
            <h2 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight text-white md:text-5xl">
              {t(lang, {
                en: "The product is not another signal feed. It is a decision gate.",
                pt: "O produto nao e mais um feed de sinais. E um gate de decisao.",
              })}
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-white/64">
              {t(lang, {
                en: "A monthly product has to earn attention every day. Syntrake does that by making the pre-broker moment brutally clear: trade, wait, or reduce risk.",
                pt: "Um produto mensal tem de merecer atencao todos os dias. O Syntrake faz isso tornando o momento antes do broker brutalmente claro: entrar, esperar ou reduzir risco.",
              })}
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {[
                {
                  command: t(lang, { en: "TRADE", pt: "ENTRAR" }),
                  tone: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
                  body: t(lang, {
                    en: "Only when live data, setup quality, risk gate, and execution rules line up.",
                    pt: "So quando dados live, qualidade do setup, gate de risco e regras de execucao alinham.",
                  }),
                },
                {
                  command: "WAIT",
                  tone: "border-cyan-300/20 bg-cyan-300/10 text-cyan-100",
                  body: t(lang, {
                    en: "No-trade is an action when conditions are stale, noisy, closed, or crisis-like.",
                    pt: "Nao operar e uma acao quando as condicoes estao stale, ruidosas, fechadas ou em crise.",
                  }),
                },
                {
                  command: t(lang, { en: "REDUCE RISK", pt: "REDUZIR RISCO" }),
                  tone: "border-amber-300/20 bg-amber-300/10 text-amber-100",
                  body: t(lang, {
                    en: "When protection has higher value than adding fresh exposure.",
                    pt: "Quando proteger tem mais valor do que adicionar nova exposicao.",
                  }),
                },
              ].map((card) => (
                <div key={card.command} className="rounded-[26px] border border-white/10 bg-white/[0.04] p-5">
                  <div className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${card.tone}`}>
                    {card.command}
                  </div>
                  <p className="mt-4 text-sm leading-6 text-white/68">{card.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[30px] border border-white/10 bg-white/[0.04] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div className="text-sm font-semibold text-white">
              {t(lang, { en: "What the customer does", pt: "O que o cliente faz" })}
            </div>
            <div className="mt-4 space-y-3">
              {[
                t(lang, { en: "Open Syntrake before the broker.", pt: "Abre o Syntrake antes do broker." }),
                t(lang, { en: "Read the command: TRADE, WAIT, or REDUCE RISK.", pt: "Le o comando: ENTRAR, WAIT ou REDUZIR RISCO." }),
                t(lang, { en: "Check freshness, invalidation, risk cap, and rationale.", pt: "Confirma frescura, invalidation, limite de risco e racional." }),
                t(lang, { en: "Execute manually in the broker only if the gate allows it.", pt: "Executa manualmente no broker so se o gate permitir." }),
                t(lang, { en: "Return to Syntrake, log proof, and keep the loop auditable.", pt: "Volta ao Syntrake, regista prova e mantem o loop auditavel." }),
              ].map((step, index) => (
                <div key={step} className="grid grid-cols-[44px_1fr] gap-3 rounded-2xl border border-white/8 bg-[#08122e]/70 p-3 text-sm leading-6 text-white/74">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-300/10 font-semibold text-cyan-100">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <div>{step}</div>
                </div>
              ))}
            </div>
            <p className="mt-4 rounded-2xl border border-white/8 bg-[#071128]/80 p-4 text-xs leading-5 text-white/48">
              {t(lang, {
                en: "Educational decision-support only. Syntrake helps structure the decision; users remain responsible for execution and risk.",
                pt: "Suporte educacional a decisao. O Syntrake ajuda a estruturar a decisao; o utilizador continua responsavel pela execucao e pelo risco.",
              })}
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-12 text-white">
        <div className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(10,21,52,0.94),rgba(8,17,42,0.92))] p-6 shadow-[0_30px_100px_rgba(5,12,34,0.36)] md:p-8">
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-100/45">
              {t(lang, {
                en: "Proof you can inspect",
                pt: "Prova que podes inspecionar",
                es: "Prueba que puedes inspeccionar",
                fr: "Preuve que vous pouvez inspecter",
                de: "Nachweis, den du pruefen kannst",
                it: "Prova che puoi ispezionare",
              })}
            </div>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white md:text-4xl">
              {t(lang, {
                en: "Trust should be visible before checkout, not hidden behind it.",
                pt: "A confianca deve ser visivel antes do checkout, nao escondida atras dele.",
                es: "La confianza debe ser visible antes del checkout, no escondida detras de el.",
                fr: "La confiance doit etre visible avant le checkout, pas cachee derriere.",
                de: "Vertrauen soll vor dem Checkout sichtbar sein, nicht dahinter versteckt.",
                it: "La fiducia deve essere visibile prima del checkout, non nascosta dietro.",
              })}
            </h2>
            <p className="mt-3 max-w-3xl text-base leading-7 text-white/64">
              {t(lang, {
                en: "Syntrake earns trust by being useful before premium, by keeping execution independent from custody, and by showing users how the decision loop works before they subscribe.",
                pt: "O Syntrake ganha confianca por ser util antes do premium, por manter a execucao independente da custodia e por mostrar como o loop de decisao funciona antes da subscricao.",
                es: "Syntrake gana confianza por ser util antes del premium, por mantener la ejecucion independiente de la custodia y por mostrar como funciona el loop de decision antes de la suscripcion.",
                fr: "Syntrake gagne la confiance en etant utile avant le premium, en gardant l execution independante de la garde, et en montrant comment la boucle de decision fonctionne avant l abonnement.",
                de: "Syntrake verdient Vertrauen, weil es schon vor Premium nuetzlich ist, Execution von Custody trennt und die Entscheidungslogik vor dem Abo sichtbar macht.",
                it: "Syntrake guadagna fiducia perche e utile prima del premium, mantiene l esecuzione indipendente dalla custodia e mostra come funziona il loop decisionale prima dell abbonamento.",
              })}
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {proofPillars.map((pillar) => (
                <ProofPillarCard
                  key={pillar.title}
                  label={pillar.label}
                  title={pillar.title}
                  body={pillar.body}
                  accentClass={pillar.accentClass}
                />
              ))}
            </div>
          </div>

          <div className="rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(9,18,47,0.98),rgba(13,23,58,0.92))] p-6 shadow-[0_30px_100px_rgba(5,12,34,0.36)] md:p-8">
            <div className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100">
              {t(lang, {
                en: "What users can verify now",
                pt: "O que o utilizador pode verificar agora",
                es: "Lo que el usuario puede verificar ahora",
                fr: "Ce que l utilisateur peut verifier maintenant",
                de: "Was Nutzer jetzt pruefen koennen",
                it: "Cio che l utente puo verificare ora",
              })}
            </div>
            <div className="mt-4 space-y-4">
              {[
                t(lang, {
                  en: "Investing stays open for free, so value shows up before subscription pressure.",
                  pt: "Investing fica aberto gratis, por isso o valor aparece antes da pressao da subscricao.",
                  es: "Investing permanece abierto gratis, por lo que el valor aparece antes de la presion de suscripcion.",
                  fr: "Investing reste ouvert gratuitement, donc la valeur apparait avant la pression d abonnement.",
                  de: "Investing bleibt kostenlos offen, sodass Wert vor Abodruck sichtbar wird.",
                  it: "Investing resta aperto gratis, quindi il valore appare prima della pressione dell abbonamento.",
                }),
                t(lang, {
                  en: "Trading Discovery lets users inspect Desk and Opportunities before paying for execution depth.",
                  pt: "Trading Discovery deixa o utilizador inspecionar Desk e Opportunities antes de pagar pela profundidade de execucao.",
                  es: "Trading Discovery permite inspeccionar Desk y Opportunities antes de pagar por profundidad de ejecucion.",
                  fr: "Trading Discovery permet d inspecter Desk et Opportunities avant de payer pour plus de profondeur d execution.",
                  de: "Trading Discovery laesst Nutzer Desk und Opportunities pruefen, bevor sie fuer Execution-Tiefe zahlen.",
                  it: "Trading Discovery permette di ispezionare Desk e Opportunities prima di pagare per maggiore profondita di esecuzione.",
                }),
                t(lang, {
                  en: "Execution happens in the user's own broker with checklists, caps, and proof capture around it.",
                  pt: "A execucao acontece no broker do proprio utilizador com checklists, limites e captura de prova a volta.",
                  es: "La ejecucion ocurre en el broker del propio usuario con checklists, limites y captura de prueba alrededor.",
                  fr: "L execution se fait dans le broker de l utilisateur avec checklists, limites et capture de preuve autour.",
                  de: "Execution passiert im Broker des Nutzers mit Checklisten, Limits und Proof-Capture darum herum.",
                  it: "L esecuzione avviene nel broker dell utente con checklist, limiti e cattura della prova attorno.",
                }),
                t(lang, {
                  en: "Trust, billing, and legal surfaces are inspectable before commitment.",
                  pt: "As superficies de trust, cobranca e legal sao inspecionaveis antes do compromisso.",
                  es: "Las superficies de trust, cobro y legal son inspeccionables antes del compromiso.",
                  fr: "Les surfaces trust, billing et legales sont inspectables avant l engagement.",
                  de: "Trust-, Billing- und Legal-Flaechen sind vor der Entscheidung pruefbar.",
                  it: "Le superfici di trust, billing e legali sono ispezionabili prima dell impegno.",
                }),
              ].map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-2xl border border-white/8 bg-white/[0.04] p-4 text-sm leading-6 text-white/72">
                  <span className="mt-2 h-2 w-2 rounded-full bg-cyan-300" />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                  {t(lang, { en: "Billing", pt: "Cobranca", es: "Cobro", fr: "Facturation", de: "Billing", it: "Billing" })}
                </div>
                <div className="mt-2 text-lg font-semibold text-white">Stripe + self-serve portal</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                  {t(lang, { en: "Auth", pt: "Auth", es: "Auth", fr: "Auth", de: "Auth", it: "Auth" })}
                </div>
                <div className="mt-2 text-lg font-semibold text-white">Clerk account protection</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                  {t(lang, { en: "Execution", pt: "Execucao", es: "Ejecucion", fr: "Execution", de: "Execution", it: "Esecuzione" })}
                </div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {t(lang, {
                    en: "External broker, no custody lock-in",
                    pt: "Broker externo, sem lock-in de custodia",
                    es: "Broker externo, sin lock-in de custodia",
                    fr: "Broker externe, sans lock-in de garde",
                    de: "Externer Broker, kein Custody-Lock-in",
                    it: "Broker esterno, nessun lock-in di custodia",
                  })}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                  {t(lang, { en: "Workflow", pt: "Workflow", es: "Workflow", fr: "Workflow", de: "Workflow", it: "Workflow" })}
                </div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {t(lang, {
                    en: "Explainable action + proof loop",
                    pt: "Acao explicavel + loop de prova",
                    es: "Accion explicable + loop de prueba",
                    fr: "Action explicable + boucle de preuve",
                    de: "Erklaerbare Aktion + Proof-Loop",
                    it: "Azione spiegabile + loop di prova",
                  })}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <TrackedLink
                href={link("/trust")}
                eventName="cta_click"
                eventData={{ location: "home_trust_proof", target: "trust_center" }}
                className="inline-flex items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#3f82ff,#5ea1ff)] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_48px_rgba(49,115,255,0.24)] transition hover:opacity-95"
              >
                {t(lang, {
                  en: "Open trust center",
                  pt: "Abrir trust center",
                  es: "Abrir trust center",
                  fr: "Ouvrir trust center",
                  de: "Trust Center oeffnen",
                  it: "Apri trust center",
                })}
              </TrackedLink>
              <TrackedLink
                href={link("/how-it-works")}
                eventName="cta_click"
                eventData={{ location: "home_trust_proof", target: "how_it_works" }}
                className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.07]"
              >
                {t(lang, {
                  en: "Inspect the workflow",
                  pt: "Inspecionar workflow",
                  es: "Inspeccionar workflow",
                  fr: "Inspecter le workflow",
                  de: "Workflow pruefen",
                  it: "Ispeziona workflow",
                })}
              </TrackedLink>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-12 text-white">
        <div className="rounded-[34px] border border-white/10 bg-[linear-gradient(135deg,rgba(9,18,47,0.98),rgba(13,23,58,0.92))] p-6 shadow-[0_34px_110px_rgba(5,12,34,0.42)] md:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-100/45">
                {t(lang, {
                  en: "Two distinct workspaces",
                  pt: "Dois workspaces distintos",
                  es: "Dos workspaces distintos",
                  fr: "Deux espaces distincts",
                  de: "Zwei klare Workspaces",
                  it: "Due workspace distinti",
                })}
              </div>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white md:text-4xl">
                {t(lang, {
                  en: "Investing and Trading now feel like two real systems, not one blurred app.",
                  pt: "Investing e Trading agora parecem dois sistemas reais, nao uma app misturada.",
                  es: "Investing y Trading ahora se sienten como dos sistemas reales, no una sola app difusa.",
                  fr: "Investing et Trading ressemblent maintenant a deux vrais systemes, pas a une seule app floue.",
                  de: "Investing und Trading fuehlen sich jetzt wie zwei echte Systeme an, nicht wie eine verschwommene App.",
                  it: "Investing e Trading ora sembrano due sistemi reali, non una sola app confusa.",
                })}
              </h2>
              <p className="mt-3 max-w-2xl text-base leading-7 text-white/64">
                {t(lang, {
                  en: "Use Investing to plan capital calmly. Use Trading to inspect flow, frame risk, and execute with more discipline when broker decisions become time-sensitive.",
                  pt: "Usa Investing para planear capital com calma. Usa Trading para ler flow, enquadrar risco e executar com mais disciplina quando as decisoes no broker ficam sensiveis ao tempo.",
                  es: "Usa Investing para planear capital con calma. Usa Trading para leer flow, enmarcar riesgo y ejecutar con mas disciplina cuando las decisiones en el broker se vuelven sensibles al tiempo.",
                  fr: "Utilisez Investing pour planifier le capital calmement. Utilisez Trading pour lire le flow, cadrer le risque et executer avec plus de discipline quand les decisions broker deviennent sensibles au temps.",
                  de: "Nutze Investing fuer ruhige Kapitalplanung. Nutze Trading fuer Flow, Risikorahmen und diszipliniertere Ausfuehrung, wenn Broker-Entscheidungen zeitkritisch werden.",
                  it: "Usa Investing per pianificare il capitale con calma. Usa Trading per leggere il flow, incorniciare il rischio ed eseguire con piu disciplina quando le decisioni broker diventano sensibili al tempo.",
                })}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <TrustPill
                label={t(lang, {
                  en: "No custody lock-in",
                  pt: "Sem lock-in de custodia",
                  es: "Sin bloqueo de custodia",
                  fr: "Pas de lock-in de garde",
                  de: "Kein Custody-Lock-in",
                  it: "Nessun lock-in di custodia",
                })}
              />
              <TrustPill
                label={t(lang, {
                  en: "One next action, not signal spam",
                  pt: "Uma proxima acao, nao spam de sinais",
                  es: "Una siguiente accion, no spam de senales",
                  fr: "Une action suivante, pas de spam de signaux",
                  de: "Eine naechste Aktion, kein Signal-Spam",
                  it: "Una prossima azione, non spam di segnali",
                })}
              />
            </div>
          </div>

          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            <WorkspaceCard
              kicker={t(lang, { en: "Investing", pt: "Investing", es: "Investing", fr: "Investing", de: "Investing", it: "Investing" })}
              title={t(lang, {
                en: "Strategic operating system for long-term capital",
                pt: "Sistema operativo estrategico para capital de longo prazo",
                es: "Sistema operativo estrategico para capital de largo plazo",
                fr: "Systeme operatif strategique pour le capital long terme",
                de: "Strategisches Betriebssystem fuer langfristiges Kapital",
                it: "Sistema operativo strategico per capitale di lungo termine",
              })}
              body={t(lang, {
                en: "Goal, allocation, portfolio integrity, next action, and risk posture in one calm surface. This is where Syntrake should feel useful before it ever asks for money.",
                pt: "Objetivo, alocacao, integridade do portfolio, proxima acao e postura de risco numa superficie calma. E aqui que o Syntrake tem de mostrar valor antes de pedir dinheiro.",
                es: "Objetivo, asignacion, integridad de cartera, siguiente accion y postura de riesgo en una superficie calmada. Aqui es donde Syntrake debe mostrar valor antes de pedir dinero.",
                fr: "Objectif, allocation, integrite du portefeuille, action suivante et posture de risque sur une surface calme. C est ici que Syntrake doit prouver sa valeur avant de demander de l argent.",
                de: "Ziel, Allokation, Portfolio-Integritaet, naechste Aktion und Risikohaltung auf einer ruhigen Flaeche. Hier muss Syntrake zuerst Wert zeigen, bevor es Geld verlangt.",
                it: "Obiettivo, allocazione, integrita del portafoglio, prossima azione e postura di rischio in una superficie calma. Qui Syntrake deve mostrare valore prima di chiedere denaro.",
              })}
              bullets={[
                t(lang, { en: "Free forever", pt: "Gratis para sempre", es: "Gratis para siempre", fr: "Gratuit pour toujours", de: "Fuer immer kostenlos", it: "Gratis per sempre" }),
                t(lang, { en: "Built for goals, drift control, and daily calm", pt: "Feito para objetivos, controlo de drift e calma diaria", es: "Hecho para objetivos, control de deriva y calma diaria", fr: "Concu pour objectifs, controle de derive et calme quotidien", de: "Fuer Ziele, Drift-Kontrolle und taegliche Ruhe", it: "Pensato per obiettivi, controllo del drift e calma quotidiana" }),
                t(lang, { en: "Best for users who want clarity before speed", pt: "Melhor para quem quer clareza antes de velocidade", es: "Mejor para quien quiere claridad antes que velocidad", fr: "Ideal pour ceux qui veulent la clarte avant la vitesse", de: "Ideal fuer Nutzer, die Klarheit vor Tempo wollen", it: "Ideale per chi vuole chiarezza prima della velocita" }),
              ]}
              ctaHref={link("/sign-up")}
              ctaLabel={t(lang, { en: "Start free in Investing", pt: "Comecar gratis em Investing", es: "Empezar gratis en Investing", fr: "Commencer gratuitement en Investing", de: "Kostenlos mit Investing starten", it: "Inizia gratis in Investing" })}
              ctaEventTarget="sign_up_investing"
              accentClass="border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
            />
            <WorkspaceCard
              kicker={t(lang, { en: "Trading", pt: "Trading", es: "Trading", fr: "Trading", de: "Trading", it: "Trading" })}
              title={t(lang, {
                en: "Execution cockpit for live opportunity flow",
                pt: "Cockpit de execucao para flow de oportunidade em tempo real",
                es: "Cockpit de ejecucion para flujo de oportunidad en tiempo real",
                fr: "Cockpit d execution pour le flow d opportunites en direct",
                de: "Execution-Cockpit fuer Live-Chancenfluss",
                it: "Cockpit di esecuzione per il flusso di opportunita live",
              })}
              body={t(lang, {
                en: "Open the desk for free, inspect the opportunity layer, and upgrade only when you want full execution, risk, journal, alerts, and deeper continuity.",
                pt: "Abre o desk gratis, observa a layer de oportunidade e faz upgrade so quando quiseres execucao completa, risco, journal, alerts e mais continuidade.",
                es: "Abre el desk gratis, inspecciona la capa de oportunidad y haz upgrade solo cuando quieras ejecucion completa, riesgo, journal, alerts y mas continuidad.",
                fr: "Ouvrez le desk gratuitement, inspectez la couche opportunite et passez a niveau seulement quand vous voulez execution complete, risque, journal, alertes et plus de continuite.",
                de: "Oeffne den Desk kostenlos, pruefe die Opportunity-Layer und upgrade erst, wenn du volle Ausfuehrung, Risiko, Journal, Alerts und mehr Kontinuitaet willst.",
                it: "Apri il desk gratis, osserva il livello opportunita e fai upgrade solo quando vuoi esecuzione completa, rischio, journal, alert e piu continuita.",
              })}
              bullets={[
                t(lang, { en: "Discovery free, execution depth paid", pt: "Discovery gratis, profundidade de execucao paga", es: "Discovery gratis, profundidad de ejecucion de pago", fr: "Decouverte gratuite, profondeur d execution payante", de: "Discovery kostenlos, Execution-Tiefe bezahlt", it: "Discovery gratis, profondita di esecuzione a pagamento" }),
                t(lang, { en: "Built for timing, invalidation, and broker-ready action", pt: "Feito para timing, invalidation e acao pronta para broker", es: "Hecho para timing, invalidation y accion lista para broker", fr: "Concu pour timing, invalidation et action prete pour broker", de: "Fuer Timing, Invalidation und brokerfertige Aktion", it: "Pensato per timing, invalidation e azione pronta per broker" }),
                t(lang, { en: "Best for users who need cleaner execution under pressure", pt: "Melhor para quem precisa de execucao mais limpa sob pressao", es: "Mejor para quien necesita ejecucion mas limpia bajo presion", fr: "Ideal pour ceux qui ont besoin d une execution plus propre sous pression", de: "Ideal fuer Nutzer, die unter Druck sauberere Ausfuehrung brauchen", it: "Ideale per chi ha bisogno di un esecuzione piu pulita sotto pressione" }),
              ]}
              ctaHref={link("/pricing")}
              ctaLabel={t(lang, { en: "See Trading Pro", pt: "Ver Trading Pro", es: "Ver Trading Pro", fr: "Voir Trading Pro", de: "Trading Pro ansehen", it: "Vedi Trading Pro" })}
              ctaEventTarget="pricing_trading"
              accentClass="border-cyan-300/20 bg-cyan-300/10 text-cyan-100"
            />
          </div>
        </div>
      </section>

      <section id="trading-workspace" className="mx-auto max-w-7xl px-6 pb-12 text-white">
        <div className="grid gap-8 rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(10,21,52,0.92),rgba(8,17,42,0.9))] p-6 shadow-[0_34px_110px_rgba(5,12,34,0.38)] md:p-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-100/45">
              {t(lang, {
                en: "Trading Desk",
                pt: "Trading Desk",
                es: "Trading Desk",
                fr: "Trading Desk",
                de: "Trading Desk",
                it: "Trading Desk",
              })}
            </div>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white md:text-4xl">
              {t(lang, {
                en: "A clearer execution cockpit, not another chart-heavy maze.",
                pt: "Um cockpit de execucao mais claro, nao mais um labirinto cheio de graficos.",
                es: "Un cockpit de ejecucion mas claro, no otro laberinto lleno de graficos.",
                fr: "Un cockpit d execution plus clair, pas un autre labyrinthe charge de graphiques.",
                de: "Ein klareres Execution-Cockpit, nicht noch ein chartlastiges Labyrinth.",
                it: "Un cockpit di esecuzione piu chiaro, non l ennesimo labirinto pieno di grafici.",
              })}
            </h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-white/64">
              {t(lang, {
                en: "Syntrake Trading should feel like a disciplined desk: opportunity stack, risk framing, invalidation, and broker-ready output on one surface.",
                pt: "Syntrake Trading deve parecer uma desk disciplinada: stack de oportunidades, enquadramento de risco, invalidation e output pronto para broker na mesma superficie.",
                es: "Syntrake Trading debe sentirse como una mesa disciplinada: stack de oportunidades, marco de riesgo, invalidation y salida lista para broker en una sola superficie.",
                fr: "Syntrake Trading doit ressembler a un desk discipline : pile d opportunites, cadrage du risque, invalidation et sortie prete pour le broker sur une seule surface.",
                de: "Syntrake Trading soll sich wie ein diszipliniertes Desk anfuehlen: Opportunity-Stack, Risikorahmen, Invalidation und brokerfertige Ausgabe auf einer Flaeche.",
                it: "Syntrake Trading deve sembrare una desk disciplinata: stack di opportunita, cornice di rischio, invalidation e output pronto per il broker sulla stessa superficie.",
              })}
            </p>
            <div className="mt-6 space-y-3">
              {[
                t(lang, {
                  en: "See the opportunity layer before paying for execution depth.",
                  pt: "Ve a camada de oportunidade antes de pagar pela profundidade de execucao.",
                  es: "Ve la capa de oportunidad antes de pagar por profundidad de ejecucion.",
                  fr: "Voyez la couche opportunite avant de payer pour plus de profondeur d execution.",
                  de: "Sieh zuerst die Opportunity-Layer, bevor du fuer mehr Execution-Tiefe zahlst.",
                  it: "Vedi il livello opportunita prima di pagare per piu profondita di esecuzione.",
                }),
                t(lang, {
                  en: "Upgrade only when timing, invalidation, and risk framing become operationally important.",
                  pt: "Faz upgrade so quando timing, invalidation e enquadramento de risco se tornam operacionalmente importantes.",
                  es: "Haz upgrade solo cuando timing, invalidation y el marco de riesgo se vuelven operativamente importantes.",
                  fr: "Passez a niveau seulement quand timing, invalidation et cadrage du risque deviennent operationnellement importants.",
                  de: "Upgrade erst, wenn Timing, Invalidation und Risikorahmen operativ wichtig werden.",
                  it: "Fai upgrade solo quando timing, invalidation e cornice di rischio diventano operativamente importanti.",
                }),
                t(lang, {
                  en: "Use your broker. Keep proof, context, and risk memory inside Syntrake.",
                  pt: "Usa o teu broker. Mantem prova, contexto e memoria de risco dentro do Syntrake.",
                  es: "Usa tu broker. Mantiene prueba, contexto y memoria de riesgo dentro de Syntrake.",
                  fr: "Utilisez votre broker. Gardez preuve, contexte et memoire du risque dans Syntrake.",
                  de: "Nutze deinen Broker. Behalte Belege, Kontext und Risikogedaechtnis in Syntrake.",
                  it: "Usa il tuo broker. Mantieni prova, contesto e memoria del rischio dentro Syntrake.",
                }),
              ].map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-3 text-sm text-white/78">
                  <span className="mt-1 h-2 w-2 rounded-full bg-cyan-300" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <TrackedLink
                href={link("/pricing")}
                eventName="cta_click"
                eventData={{ location: "home_trading_showcase", target: "pricing_trading" }}
                className="inline-flex items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#3f82ff,#5ea1ff)] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_48px_rgba(49,115,255,0.24)] transition hover:opacity-95"
              >
                {t(lang, { en: "See Trading Pro", pt: "Ver Trading Pro", es: "Ver Trading Pro", fr: "Voir Trading Pro", de: "Trading Pro ansehen", it: "Vedi Trading Pro" })}
              </TrackedLink>
              <TrackedLink
                href={link("/sign-up")}
                eventName="cta_click"
                eventData={{ location: "home_trading_showcase", target: "sign_up_trading" }}
                className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.07]"
              >
                {t(lang, { en: "Open Trading Discovery", pt: "Abrir Trading Discovery", es: "Abrir Trading Discovery", fr: "Ouvrir Trading Discovery", de: "Trading Discovery oeffnen", it: "Apri Trading Discovery" })}
              </TrackedLink>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-5 rounded-[34px] bg-[radial-gradient(circle_at_center,rgba(94,161,255,0.18),transparent_68%)] blur-2xl" />
            <div className="relative overflow-hidden rounded-[30px] border border-white/10 bg-[#09112a]/78 shadow-[0_26px_90px_rgba(5,12,34,0.4)]">
              <LandingTradingPreview />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-12 text-white">
        <div className="grid gap-6 lg:grid-cols-2">
          <ShowcaseCard
            id="daily-showcase"
            kicker={t(lang, { en: "Daily Command Center", pt: "Centro de comando diario", es: "Centro de mando diario", fr: "Centre de commande quotidien", de: "Daily Command Center", it: "Centro di comando giornaliero" })}
            title={t(lang, { en: "Daily Command Center", pt: "Centro de comando diario", es: "Centro de mando diario", fr: "Centre de commande quotidien", de: "Daily Command Center", it: "Centro di comando giornaliero" })}
            body={t(lang, {
              en: "One command, one posture, one next move. Syntrake strips the day down to the action that matters.",
              pt: "Um comando, uma postura, um proximo movimento. O Syntrake reduz o dia a acao que importa.",
              es: "Un comando, una postura, un siguiente movimiento. Syntrake reduce el dia a la accion que importa.",
              fr: "Une commande, une posture, un prochain mouvement. Syntrake reduit la journee a l action qui compte.",
              de: "Ein Command, eine Haltung, ein naechster Zug. Syntrake reduziert den Tag auf die Aktion, die zaehlt.",
              it: "Un comando, una postura, una prossima mossa. Syntrake riduce la giornata all azione che conta.",
            })}
            preview={<LandingDailyPreview />}
          />
          <ShowcaseCard
            id="advisor-showcase"
            kicker={t(lang, { en: "Strategy Advisor", pt: "Advisor estrategico", es: "Advisor estrategico", fr: "Advisor strategique", de: "Strategie Advisor", it: "Advisor strategico" })}
            title={t(lang, { en: "Strategy Advisor", pt: "Strategy Advisor", es: "Strategy Advisor", fr: "Strategy Advisor", de: "Strategy Advisor", it: "Strategy Advisor" })}
            body={t(lang, {
              en: "See capital paths, strategic blockers, and the exact next move in the same language your portfolio actually needs.",
              pt: "Ves caminhos de capital, bloqueios estrategicos e o proximo movimento exato na linguagem que o teu portfolio precisa.",
              es: "Ves caminos de capital, bloqueos estrategicos y el siguiente movimiento exacto en el lenguaje que tu cartera necesita.",
              fr: "Visualisez les trajectoires de capital, les blocages strategiques et le prochain mouvement exact dans le langage dont votre portefeuille a besoin.",
              de: "Sieh Kapitalpfade, strategische Blocker und den naechsten exakten Zug in der Sprache, die dein Portfolio braucht.",
              it: "Vedi percorsi di capitale, blocchi strategici e la prossima mossa esatta nel linguaggio di cui il tuo portafoglio ha bisogno.",
            })}
            preview={<LandingAdvisorPreview />}
          />
          <ShowcaseCard
            id="portfolio-showcase"
            kicker={t(lang, { en: "Portfolio Engine", pt: "Motor de portfolio", es: "Motor de cartera", fr: "Moteur portefeuille", de: "Portfolio Engine", it: "Motore di portafoglio" })}
            title={t(lang, { en: "Portfolio Engine", pt: "Portfolio Engine", es: "Portfolio Engine", fr: "Portfolio Engine", de: "Portfolio Engine", it: "Portfolio Engine" })}
            body={t(lang, {
              en: "Track real allocation, holdings quality, and portfolio integrity with the same discipline behind the engine.",
              pt: "Acompanha a alocacao real, qualidade dos holdings e integridade do portfolio com a mesma disciplina por tras do motor.",
              es: "Sigue la asignacion real, la calidad de holdings y la integridad de cartera con la misma disciplina del motor.",
              fr: "Suivez l allocation reelle, la qualite des positions et l integrite du portefeuille avec la meme discipline que le moteur.",
              de: "Verfolge reale Allokation, Qualitaet der Holdings und Portfolio-Integritaet mit derselben Disziplin wie die Engine.",
              it: "Monitora allocazione reale, qualita delle posizioni e integrita del portafoglio con la stessa disciplina del motore.",
            })}
            preview={<LandingPortfolioPreview />}
          />
          <ShowcaseCard
            id="autonomy-showcase"
            kicker={t(lang, { en: "Autonomy Control", pt: "Controlo de autonomia", es: "Control de autonomia", fr: "Controle de l autonomie", de: "Autonomie Kontrolle", it: "Controllo autonomia" })}
            title={t(lang, { en: "Autonomy Control", pt: "Autonomy Control", es: "Autonomy Control", fr: "Autonomy Control", de: "Autonomy Control", it: "Autonomy Control" })}
            body={t(lang, {
              en: "See the operating state, next evaluation, and automation posture before broker controls or operator actions take over.",
              pt: "Ves o estado operacional, a proxima avaliacao e a postura de automacao antes de entrares nos controlos.",
              es: "Ve el estado operativo, la siguiente evaluacion y la postura de automatizacion antes de entrar en controles.",
              fr: "Visualisez l etat operationnel, la prochaine evaluation et la posture d automatisation avant les controles.",
              de: "Sieh operativen Status, naechste Bewertung und Automationshaltung, bevor Controls uebernehmen.",
              it: "Vedi lo stato operativo, la prossima valutazione e la postura di automazione prima dei controlli.",
            })}
            preview={<LandingAutonomyPreview />}
          />
        </div>
      </section>

      <section id="planning-paths" className="mx-auto max-w-7xl px-6 pb-12 text-white">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-4xl font-semibold tracking-tight md:text-5xl">
            {t(lang, {
              en: "Stop guessing what to do with your portfolio.",
              pt: "Para de adivinhar o que fazer com o teu portfolio.",
              es: "Deja de adivinar que hacer con tu cartera.",
              fr: "Arretez de deviner quoi faire avec votre portefeuille.",
              de: "Hoer auf zu raten, was du mit deinem Portfolio tun sollst.",
              it: "Smetti di indovinare cosa fare con il tuo portafoglio.",
            })}
          </h2>
          <p className="mt-4 text-2xl font-medium tracking-tight text-white/78 md:text-3xl">
            {t(lang, {
              en: "Turn investing into a system.",
              pt: "Transforma investir num sistema.",
              es: "Convierte invertir en un sistema.",
              fr: "Transformez l investissement en systeme.",
              de: "Verwandle Investieren in ein System.",
              it: "Trasforma l investimento in un sistema.",
            })}
          </p>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <PathModeCard
            title="Investing"
            body={t(lang, {
              en: "Diversified, goal-based portfolio building with institutional risk discipline.",
              pt: "Construcao de portfolio diversificado com objetivo e disciplina de risco institucional.",
              es: "Construccion de cartera diversificada por objetivo con disciplina de riesgo institucional.",
              fr: "Construction de portefeuille diversifie par objectif avec discipline de risque institutionnelle.",
              de: "Diversifizierter, zielbasierter Portfolioaufbau mit institutioneller Risikodisziplin.",
              it: "Costruzione di portafoglio diversificato orientato a obiettivi con disciplina di rischio istituzionale.",
            })}
          />
        </div>
      </section>

      <section id="value-proof" className="mx-auto max-w-7xl px-6 py-8 text-white">
        <div className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(10,21,52,0.88),rgba(8,17,42,0.9))] p-6 shadow-[0_28px_90px_rgba(5,12,34,0.32)] backdrop-blur md:p-8">
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-100/45">
              {t(lang, {
                en: "Choose your path",
                pt: "Escolhe o teu caminho",
                es: "Elige tu camino",
                fr: "Choisissez votre voie",
                de: "Waehle deinen Weg",
                it: "Scegli il tuo percorso",
              })}
            </div>
            <h2 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
              {t(lang, {
                en: "Different entry points, same disciplined engine.",
                pt: "Entradas diferentes, o mesmo motor disciplinado.",
                es: "Entradas distintas, mismo motor disciplinado.",
                fr: "Points d entree differents, meme moteur discipline.",
                de: "Verschiedene Einstiege, dieselbe disziplinierte Engine.",
                it: "Punti di ingresso diversi, stesso motore disciplinato.",
              })}
            </h2>
            <p className="max-w-3xl text-base leading-7 text-white/64">
              {t(lang, {
                en: "Syntrake meets beginners, disciplined investors, and active operators with the same calm operating system underneath.",
                pt: "O Syntrake encontra iniciantes, investidores disciplinados e operadores ativos com o mesmo sistema operacional calmo por baixo.",
                es: "Syntrake acompana a principiantes, inversores disciplinados y operadores activos con el mismo sistema operativo calmado por debajo.",
                fr: "Syntrake accompagne debutants, investisseurs disciplines et operateurs actifs avec le meme systeme operationnel calme en dessous.",
                de: "Syntrake trifft Einsteiger, disziplinierte Investoren und aktive Operatoren mit demselben ruhigen Betriebssystem darunter.",
                it: "Syntrake accompagna principianti, investitori disciplinati e operatori attivi con lo stesso sistema operativo calmo alla base.",
              })}
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-[26px] border border-white/10 bg-white/[0.04] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="text-sm font-semibold text-white">
                {t(lang, {
                  en: "New to investing",
                  pt: "Novo a investir",
                  es: "Nuevo invirtiendo",
                  fr: "Nouveau en investissement",
                  de: "Neu beim Investieren",
                  it: "Nuovo negli investimenti",
                })}
              </div>
              <p className="mt-3 text-sm leading-6 text-white/62">
                {t(lang, {
                  en: "Calm guidance, one step at a time, no panic workflows.",
                  pt: "Guia calmo, um passo de cada vez, sem panico.",
                  es: "Guia calmada, un paso cada vez, sin panico.",
                  fr: "Guidage calme, un pas a la fois, sans panique.",
                  de: "Ruhige Anleitung, Schritt fuer Schritt, ohne Panik.",
                  it: "Guida calma, un passo alla volta, senza panico.",
                })}
              </p>
                <TrackedLink
                  href={link("/for-beginners")}
                  eventName="cta_click"
                  eventData={{ location: "home_persona", target: "for_beginners" }}
                  className="mt-5 inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/[0.08]"
                >
                  {t(lang, {
                    en: "Open beginner landing",
                  pt: "Abrir landing iniciante",
                  es: "Abrir landing principiante",
                  fr: "Ouvrir landing debutant",
                  de: "Landing fuer Einsteiger oeffnen",
                  it: "Apri landing principianti",
                })}
              </TrackedLink>
            </div>

            <div className="rounded-[26px] border border-white/10 bg-white/[0.04] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="text-sm font-semibold text-white">
                {t(lang, {
                  en: "Advanced investor",
                  pt: "Investidor avancado",
                  es: "Inversor avanzado",
                  fr: "Investisseur avance",
                  de: "Fortgeschrittener Investor",
                  it: "Investitore avanzato",
                })}
              </div>
              <p className="mt-3 text-sm leading-6 text-white/62">
                {t(lang, {
                  en: "Policy, risk controls, and explainable execution flow.",
                  pt: "Politica, controlo de risco e execucao explicavel.",
                  es: "Politica, control de riesgo y ejecucion explicable.",
                  fr: "Politique, controle du risque et execution explicable.",
                  de: "Policy, Risikokontrolle und erklaerbarer Ausfuehrungsfluss.",
                  it: "Policy, controllo del rischio e flusso di esecuzione spiegabile.",
                })}
              </p>
                <TrackedLink
                  href={link("/for-pros")}
                  eventName="cta_click"
                  eventData={{ location: "home_persona", target: "for_pros" }}
                  className="mt-5 inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/[0.08]"
                >
                  {t(lang, {
                    en: "Open pro landing",
                  pt: "Abrir landing pro",
                  es: "Abrir landing pro",
                  fr: "Ouvrir landing pro",
                  de: "Pro-Landing oeffnen",
                  it: "Apri landing pro",
                })}
              </TrackedLink>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-8 text-white">
        <div className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(10,21,52,0.88),rgba(8,17,42,0.9))] p-6 shadow-[0_28px_90px_rgba(5,12,34,0.32)] backdrop-blur md:p-8">
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-100/45">
              {t(lang, {
                en: "Value before payment",
                pt: "Valor antes de pagar",
                es: "Valor en 2 minutos",
                fr: "Valeur en 2 minutes",
                de: "Wert in 2 Minuten",
                it: "Valore in 2 minuti",
              })}
            </div>
            <h2 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
              {t(lang, {
                en: "The subscription has to be justified before checkout.",
                pt: "A subscricao tem de ser justificada antes do checkout.",
                es: "Muestra resultados rapidos con acciones, no promesas.",
                fr: "Montrez des resultats vite avec des actions, pas des promesses.",
                de: "Zeige schnelle Ergebnisse mit Aktionen, nicht mit Versprechen.",
                it: "Mostra risultati rapidi con azioni, non promesse.",
              })}
            </h2>
            <p className="max-w-3xl text-base leading-7 text-white/64">
              {t(lang, {
                en: "The fastest way to earn trust is a concrete before/after workflow: detect weak conditions, apply one safer decision, and show the impact before the broker opens.",
                pt: "A forma mais rapida de ganhar confianca e um fluxo antes/depois concreto: detetar condicoes fracas, aplicar uma decisao mais segura e mostrar impacto antes do broker abrir.",
                es: "La forma mas rapida de justificar pago es un flujo antes/despues concreto: detectar fugas, aplicar una correccion segura y medir impacto.",
                fr: "Le moyen le plus rapide de justifier le paiement est un flux concret avant/apres : detecter les fuites, appliquer une correction sure et mesurer l impact.",
                de: "Der schnellste Weg, den Preis zu rechtfertigen, ist ein konkreter Vorher/Nachher-Workflow: Lecks erkennen, eine sichere Korrektur anwenden und Wirkung messen.",
                it: "Il modo piu rapido per giustificare il pagamento e un flusso concreto prima/dopo: rilevare perdite, applicare una correzione sicura e misurare l impatto.",
              })}
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-[26px] border border-white/10 bg-white/[0.04] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100/45">{t(lang, { en: "Step 1", pt: "Passo 1", es: "Paso 1", fr: "Etape 1", de: "Schritt 1", it: "Passo 1" })}</div>
              <div className="mt-2 text-sm font-semibold text-white">
                {t(lang, {
                  en: "Instant diagnostics",
                  pt: "Diagnostico imediato",
                  es: "Diagnostico instantaneo",
                  fr: "Diagnostic instantane",
                  de: "Sofortdiagnose",
                  it: "Diagnosi istantanea",
                })}
              </div>
              <p className="mt-2 text-sm leading-6 text-white/62">
                {t(lang, {
                  en: "Import holdings and detect concentration, drift, and pricing leaks in under two minutes.",
                  pt: "Importa holdings e deteta concentracao, drift e falhas de preco em menos de dois minutos.",
                  es: "Importa holdings y detecta concentracion, deriva y fugas de precio en menos de dos minutos.",
                  fr: "Importez les positions et detectez concentration, derive et fuites de prix en moins de deux minutes.",
                  de: "Importiere Positionen und erkenne Konzentration, Drift und Preislecks in weniger als zwei Minuten.",
                  it: "Importa holdings e rileva concentrazione, deriva e perdite di prezzo in meno di due minuti.",
                })}
              </p>
            </div>

            <div className="rounded-[26px] border border-white/10 bg-white/[0.04] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100/45">{t(lang, { en: "Step 2", pt: "Passo 2", es: "Paso 2", fr: "Etape 2", de: "Schritt 2", it: "Passo 2" })}</div>
              <div className="mt-2 text-sm font-semibold text-white">
                {t(lang, {
                  en: "One clear next action",
                  pt: "Uma proxima acao clara",
                  es: "Una siguiente accion clara",
                  fr: "Une action suivante claire",
                  de: "Eine klare naechste Aktion",
                  it: "Una prossima azione chiara",
                })}
              </div>
              <p className="mt-2 text-sm leading-6 text-white/62">
                {t(lang, {
                  en: "Get one action with risk cap, plain-language rationale, and a broker-ready execution checklist (eToro/XTB/etc).",
                  pt: "Recebe uma acao com limite de risco, racional em linguagem simples e checklist pronta para broker (eToro/XTB/etc).",
                  es: "Recibe una accion con limite de riesgo, explicacion clara y checklist lista para broker (eToro/XTB/etc).",
                  fr: "Recevez une action avec limite de risque, rationale claire et checklist prete pour broker (eToro/XTB/etc).",
                  de: "Erhalte eine Aktion mit Risikolimit, klarer Begruendung und brokerfertiger Checkliste (eToro/XTB/etc).",
                  it: "Ricevi un azione con limite di rischio, razionale chiaro e checklist pronta per broker (eToro/XTB/etc).",
                })}
              </p>
            </div>

            <div className="rounded-[26px] border border-white/10 bg-white/[0.04] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100/45">{t(lang, { en: "Step 3", pt: "Passo 3", es: "Paso 3", fr: "Etape 3", de: "Schritt 3", it: "Passo 3" })}</div>
              <div className="mt-2 text-sm font-semibold text-white">
                {t(lang, {
                  en: "Before vs after proof",
                  pt: "Prova antes vs depois",
                  es: "Prueba antes vs despues",
                  fr: "Preuve avant vs apres",
                  de: "Nachweis Vorher vs Nachher",
                  it: "Prova prima vs dopo",
                })}
              </div>
              <p className="mt-2 text-sm leading-6 text-white/62">
                {t(lang, {
                  en: "See expected impact on risk posture before execution so the decision is measurable.",
                  pt: "Ves o impacto esperado na postura de risco antes de executar, para decisao mensuravel.",
                  es: "Ves el impacto esperado en postura de riesgo antes de ejecutar para una decision medible.",
                  fr: "Voyez l impact attendu sur la posture de risque avant execution pour une decision mesurable.",
                  de: "Sieh die erwartete Wirkung auf die Risikoposition vor der Ausfuehrung, damit die Entscheidung messbar ist.",
                  it: "Vedi l impatto atteso sulla postura di rischio prima dell esecuzione per una decisione misurabile.",
                })}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div className="rounded-[26px] border border-white/10 bg-white/[0.04] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="text-sm font-semibold text-white">
                {t(lang, {
                  en: "Syntrake vs typical robo flows",
                  pt: "Syntrake vs fluxos robo tipicos",
                  es: "Syntrake vs flujos robo tipicos",
                  fr: "Syntrake vs flux robo typiques",
                  de: "Syntrake vs typische Robo-Flows",
                  it: "Syntrake vs flussi robo tipici",
                })}
              </div>
              <div className="table-scroll mt-3 overflow-x-auto">
                <table className="min-w-full text-left text-xs text-white/70">
                  <thead>
                    <tr className="border-b border-white/10 text-white/42">
                      <th className="py-2 pr-3 font-semibold">{t(lang, { en: "Capability", pt: "Capacidade", es: "Capacidad", fr: "Capacite", de: "Faehigkeit", it: "Capacita" })}</th>
                      <th className="py-2 pr-3 font-semibold">Syntrake</th>
                      <th className="py-2 font-semibold">
                        {t(lang, {
                          en: "Typical robo flow",
                          pt: "Fluxo robo tipico",
                          es: "Flujo robo tipico",
                          fr: "Flux robo typique",
                          de: "Typischer Robo-Flow",
                          it: "Flusso robo tipico",
                        })}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-white/8">
                      <td className="py-2 pr-3">{t(lang, { en: "Daily action with risk cap", pt: "Acao diaria com limite de risco", es: "Accion diaria con limite de riesgo", fr: "Action quotidienne avec limite de risque", de: "Taegliche Aktion mit Risikolimit", it: "Azione giornaliera con limite di rischio" })}</td>
                      <td className="py-2 pr-3 font-semibold text-white">{t(lang, { en: "Yes", pt: "Sim", es: "Si", fr: "Oui", de: "Ja", it: "Si" })}</td>
                      <td className="py-2">{t(lang, { en: "Usually generic rebalancing only", pt: "Normalmente apenas rebalanceamento generico", es: "Normalmente solo rebalanceo generico", fr: "Souvent seulement un reequilibrage generique", de: "Meist nur generisches Rebalancing", it: "Di solito solo ribilanciamento generico" })}</td>
                    </tr>
                    <tr className="border-b border-white/8">
                      <td className="py-2 pr-3">{t(lang, { en: "Explainability before execution", pt: "Explicabilidade antes da execucao", es: "Explicabilidad antes de ejecutar", fr: "Explicabilite avant execution", de: "Erklaerbarkeit vor Ausfuehrung", it: "Spiegabilita prima dell esecuzione" })}</td>
                      <td className="py-2 pr-3 font-semibold text-white">{t(lang, { en: "Structured rationale", pt: "Racional estruturado", es: "Razonamiento estructurado", fr: "Rationale structuree", de: "Strukturierte Begruendung", it: "Razionale strutturato" })}</td>
                      <td className="py-2">{t(lang, { en: "Limited detail for action timing", pt: "Detalhe limitado para timing de acao", es: "Detalle limitado para timing de accion", fr: "Detail limite pour le timing d action", de: "Begrenzte Details zum Aktionszeitpunkt", it: "Dettaglio limitato sul timing dell azione" })}</td>
                    </tr>
                    <tr className="border-b border-white/8">
                      <td className="py-2 pr-3">{t(lang, { en: "Fix-risk-first workflow", pt: "Fluxo corrige-risco-primeiro", es: "Flujo corregir-riesgo-primero", fr: "Flux corriger-risque-d abord", de: "Risiko-zuerst-fixen Workflow", it: "Flusso correggi-rischio-prima" })}</td>
                      <td className="py-2 pr-3 font-semibold text-white">{t(lang, { en: "Built in", pt: "Integrado", es: "Integrado", fr: "Integre", de: "Integriert", it: "Integrato" })}</td>
                      <td className="py-2">{t(lang, { en: "Often optional or hidden", pt: "Muitas vezes opcional ou oculto", es: "A menudo opcional u oculto", fr: "Souvent optionnel ou cache", de: "Oft optional oder versteckt", it: "Spesso opzionale o nascosto" })}</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-3">{t(lang, { en: "External broker execution playbook", pt: "Playbook de execucao em broker externo", es: "Playbook de ejecucion en broker externo", fr: "Playbook d execution broker externe", de: "Externe Broker-Ausfuehrungsanleitung", it: "Playbook di esecuzione broker esterno" })}</td>
                      <td className="py-2 pr-3 font-semibold text-white">{t(lang, { en: "Step-by-step checklist with caps and target values", pt: "Checklist passo-a-passo com limites e valores alvo", es: "Checklist paso a paso con limites y valores objetivo", fr: "Checklist etape par etape avec limites et cibles", de: "Schritt-fuer-Schritt-Checkliste mit Limits und Zielwerten", it: "Checklist passo passo con limiti e valori target" })}</td>
                      <td className="py-2">{t(lang, { en: "Usually left to user interpretation", pt: "Normalmente deixado a interpretacao do utilizador", es: "Normalmente dejado a interpretacion del usuario", fr: "Souvent laisse a l interpretation de l utilisateur", de: "Meist der Interpretation des Nutzers ueberlassen", it: "Di solito lasciato all interpretazione dell utente" })}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-[26px] border border-white/10 bg-white/[0.04] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="text-sm font-semibold text-white">
                {t(lang, {
                  en: "What you can prove before paying",
                  pt: "O que podes comprovar antes de pagar",
                  es: "Que puedes comprobar antes de pagar",
                  fr: "Ce que vous pouvez prouver avant de payer",
                  de: "Was du vor dem Bezahlen nachweisen kannst",
                  it: "Cosa puoi dimostrare prima di pagare",
                })}
              </div>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-white/68">
                <li>- {t(lang, { en: "Detect your top leak in under 2 minutes", pt: "Deteta a tua principal falha em menos de 2 minutos", es: "Detecta tu principal fuga en menos de 2 minutos", fr: "Detectez votre fuite principale en moins de 2 minutes", de: "Erkenne dein groesstes Leck in unter 2 Minuten", it: "Rileva la tua perdita principale in meno di 2 minuti" })}</li>
                <li>- {t(lang, { en: "Apply one safe fix with guardrails", pt: "Aplica uma correcao segura com guardrails", es: "Aplica una correccion segura con guardrails", fr: "Appliquez une correction sure avec guardrails", de: "Wende eine sichere Korrektur mit Guardrails an", it: "Applica una correzione sicura con guardrail" })}</li>
                <li>- {t(lang, { en: "Execute with broker checklist (eToro/XTB/any broker)", pt: "Executa com checklist de broker (eToro/XTB/qualquer broker)", es: "Ejecuta con checklist de broker (eToro/XTB/cualquier broker)", fr: "Executez avec checklist broker (eToro/XTB/tout broker)", de: "Fuehre mit Broker-Checkliste aus (eToro/XTB/jeder Broker)", it: "Esegui con checklist broker (eToro/XTB/qualsiasi broker)" })}</li>
                <li>- {t(lang, { en: "See the projected risk change before execution", pt: "Ves a mudanca de risco projetada antes de executar", es: "Ve el cambio de riesgo proyectado antes de ejecutar", fr: "Voyez le changement de risque projete avant execution", de: "Sieh die prognostizierte Risikoveraenderung vor Ausfuehrung", it: "Vedi il cambiamento di rischio stimato prima dell esecuzione" })}</li>
              </ul>
              <div className="mt-5 flex flex-col gap-2">
                <TrackedLink
                  href={link("/sign-up")}
                  eventName="cta_click"
                  eventData={{ location: "home_value_proof", target: "sign_up" }}
                  className="inline-flex items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#7b6df5,#ff5aa5)] px-4 py-2 text-sm font-semibold text-white shadow-[0_16px_48px_rgba(132,89,255,0.22)] transition hover:opacity-95"
                >
                  {t(lang, {
                    en: "Run the 2-minute setup",
                    pt: "Executar setup de 2 minutos",
                    es: "Ejecutar setup de 2 minutos",
                    fr: "Lancer setup de 2 minutes",
                    de: "2-Minuten-Setup starten",
                    it: "Avvia setup da 2 minuti",
                  })}
                </TrackedLink>
                <TrackedLink
                  href={link("/pricing")}
                  eventName="cta_click"
                  eventData={{ location: "home_value_proof", target: "pricing" }}
                  className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
                >
                  {t(lang, {
                    en: "See full plan and pricing",
                    pt: "Ver plano completo e precos",
                    es: "Ver plan completo y precios",
                    fr: "Voir plan complet et tarifs",
                    de: "Vollen Plan und Preise ansehen",
                    it: "Vedi piano completo e prezzi",
                  })}
                </TrackedLink>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-14 text-white">
        <div className="rounded-[34px] border border-white/10 bg-[linear-gradient(135deg,rgba(10,20,52,0.96),rgba(20,18,56,0.92))] p-10 shadow-[0_38px_110px_rgba(7,15,40,0.45)]">
          <h2 className="text-4xl font-semibold tracking-tight md:text-5xl">
            {t(lang, {
              en: "Open Syntrake before the broker. Leave with a decision.",
              pt: "Abre o Syntrake antes do broker. Sai com uma decisao.",
              es: "Deja de adivinar. Empieza a ejecutar un plan.",
              fr: "Arretez de deviner. Commencez a executer un plan.",
              de: "Hoer auf zu raten. Beginne, einen Plan umzusetzen.",
              it: "Smetti di indovinare. Inizia a eseguire un piano.",
            })}
          </h2>
          <p className="mt-4 max-w-3xl text-base leading-8 text-white/74 md:text-lg">
            {t(lang, {
              en: "If the trade is clean, Syntrake prepares the checklist. If the market is not worth it, Syntrake makes WAIT feel like discipline instead of hesitation.",
              pt: "Se o trade esta limpo, o Syntrake prepara a checklist. Se o mercado nao vale a pena, o Syntrake transforma WAIT em disciplina em vez de hesitacao.",
              es: "Construye un plan por objetivo, recibe la siguiente mejor accion y mantente en calma con control de riesgo institucional.",
              fr: "Construisez un plan base sur objectif, obtenez la meilleure action suivante et restez calme dans la volatilite avec controle de risque institutionnel.",
              de: "Baue einen zielbasierten Plan, erhalte die naechste beste Aktion und bleibe bei Volatilitaet ruhig mit institutioneller Risikokontrolle.",
              it: "Costruisci un piano basato su obiettivo, ottieni la prossima migliore azione e resta calmo nella volatilita con controllo del rischio istituzionale.",
            })}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <TrackedLink
              href={link("/sign-up")}
              eventName="cta_click"
              eventData={{ location: "home_final_cta", target: "sign_up" }}
              className="inline-flex items-center justify-center rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-ink-900 transition hover:bg-white/90"
            >
              {t(lang, {
                en: "See Today's Plan",
                pt: "Ver plano de hoje",
                es: "Empezar gratis",
                fr: "Commencer gratuit",
                de: "Kostenlos starten",
                it: "Inizia gratis",
              })}
            </TrackedLink>
            <TrackedLink
              href={link("/pricing")}
              eventName="cta_click"
              eventData={{ location: "home_final_cta", target: "pricing" }}
              className="inline-flex items-center justify-center rounded-2xl border border-white/20 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
            >
              {t(lang, {
                en: "See pricing",
                pt: "Ver precos",
                es: "Ver precios",
                fr: "Voir les tarifs",
                de: "Preise ansehen",
                it: "Vedi prezzi",
              })}
            </TrackedLink>
          </div>
        </div>
      </section>

        </>
      ) : null}

      <footer className="border-t border-white/10 bg-transparent text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-8 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-white/55">
            (c) {new Date().getFullYear()} Syntrake.{" "}
            {t(lang, {
              en: "All rights reserved.",
              pt: "Todos os direitos reservados.",
              es: "Todos los derechos reservados.",
              fr: "Tous droits reserves.",
              de: "Alle Rechte vorbehalten.",
              it: "Tutti i diritti riservati.",
            })}
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <Link className="text-white/66 transition hover:text-white" href={link("/pricing")}>
              {t(lang, { en: "Pricing", pt: "Precos", es: "Precios", fr: "Tarifs", de: "Preise", it: "Prezzi" })}
            </Link>
            <Link className="text-white/66 transition hover:text-white" href={link("/why-syntrake")}>
              {t(lang, { en: "Why", pt: "Porque", es: "Por que", fr: "Pourquoi", de: "Warum", it: "Perche" })}
            </Link>
            <Link className="text-white/66 transition hover:text-white" href={link("/how-it-works")}>
              {t(lang, {
                en: "How it works",
                pt: "Como funciona",
                es: "Como funciona",
                fr: "Comment ca marche",
                de: "So funktioniert es",
                it: "Come funziona",
              })}
            </Link>
            <Link className="text-white/66 transition hover:text-white" href={link("/market-map")}>
              {t(lang, { en: "Preview", pt: "Preview", es: "Vista previa", fr: "Apercu", de: "Vorschau", it: "Anteprima" })}
            </Link>
            <Link className="text-white/66 transition hover:text-white" href={link("/trust")}>
              {t(lang, { en: "Trust", pt: "Confianca", es: "Confianza", fr: "Confiance", de: "Vertrauen", it: "Fiducia" })}
            </Link>
            <span className="text-white/18">|</span>
            <Link className="text-white/66 transition hover:text-white" href={link("/terms")}>
              {t(lang, { en: "Terms", pt: "Termos", es: "Terminos", fr: "Conditions", de: "AGB", it: "Termini" })}
            </Link>
            <Link className="text-white/66 transition hover:text-white" href={link("/privacy")}>
              {t(lang, { en: "Privacy", pt: "Privacidade", es: "Privacidad", fr: "Confidentialite", de: "Datenschutz", it: "Privacy" })}
            </Link>
            <Link className="text-white/66 transition hover:text-white" href={link("/disclaimer")}>
              {t(lang, { en: "Disclaimer", pt: "Aviso legal", es: "Aviso legal", fr: "Avertissement", de: "Hinweis", it: "Disclaimer" })}
            </Link>
          </div>
        </div>
      </footer>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#071128]/92 p-3 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-7xl gap-2">
          <TrackedLink
            href={link("/sign-up")}
            eventName="cta_click"
            eventData={{ location: "home_sticky_mobile", target: "sign_up" }}
            className="inline-flex flex-1 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#7b6df5,#ff5aa5)] px-4 py-3 text-sm font-semibold text-white"
          >
            {t(lang, {
              en: "Start free",
              pt: "Comecar gratis",
              es: "Empezar gratis",
              fr: "Commencer gratuit",
              de: "Kostenlos starten",
              it: "Inizia gratis",
            })}
          </TrackedLink>
          <TrackedLink
            href={link("/pricing")}
            eventName="cta_click"
            eventData={{ location: "home_sticky_mobile", target: "pricing" }}
            className="inline-flex flex-1 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-semibold text-white"
          >
            {t(lang, { en: "Pricing", pt: "Precos", es: "Precios", fr: "Tarifs", de: "Preise", it: "Prezzi" })}
          </TrackedLink>
        </div>
      </div>
    </main>
  );
}

