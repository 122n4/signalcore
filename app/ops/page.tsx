import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";

import { buildPremiumAuditReport } from "@/lib/billing/premiumAuditService";
import { isOwnerUserId } from "@/lib/signalcore/owner";
import { buildResearchRuntimeHealth } from "@/lib/trading/research/runtimeHealth";

export const metadata: Metadata = {
  title: "Ops | Syntrake",
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Settled<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

async function settle<T>(task: Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await task };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function statusTone(severity: string | null | undefined) {
  if (severity === "fail" || severity === "error") return "border-red-400/40 bg-red-500/10 text-red-100";
  if (severity === "warn") return "border-amber-300/40 bg-amber-400/10 text-amber-100";
  return "border-emerald-300/40 bg-emerald-400/10 text-emerald-100";
}

function settledError<T>(result: Settled<T>) {
  return result.ok ? null : (result as { ok: false; error: string }).error;
}

function Card({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20">
      <p className="text-xs font-bold uppercase tracking-[0.28em] text-slate-500">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-bold text-white">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <div className="mt-2 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function sourceTone(source: string) {
  if (source === "stripe") return "border-emerald-300/40 bg-emerald-400/10 text-emerald-100";
  if (source === "owner_override" || source === "local_qa") return "border-blue-300/40 bg-blue-400/10 text-blue-100";
  if (source === "manual_metadata") return "border-amber-300/40 bg-amber-400/10 text-amber-100";
  if (source === "trial") return "border-cyan-300/40 bg-cyan-400/10 text-cyan-100";
  return "border-slate-500/40 bg-slate-900/70 text-slate-200";
}

function maskStripeId(value: string | null | undefined) {
  if (!value) return "none";
  if (value.length <= 10) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export default async function OpsPage() {
  const { userId } = await auth();
  if (!userId || !isOwnerUserId(userId)) {
    return (
      <main className="min-h-screen bg-[#07111f] px-6 py-16 text-white">
        <div className="mx-auto max-w-2xl rounded-[28px] border border-white/10 bg-white/[0.04] p-8">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-slate-500">Syntrake Ops</p>
          <h1 className="mt-3 text-3xl font-bold">Owner access required</h1>
          <p className="mt-3 text-slate-300">
            This internal cockpit is limited to configured owner accounts.
          </p>
        </div>
      </main>
    );
  }

  const [research, billing] = await Promise.all([
    settle(buildResearchRuntimeHealth()),
    settle(buildPremiumAuditReport({ limit: 1000 })),
  ]);

  const researchValue = research.ok ? research.value : null;
  const researchError = settledError(research);
  const billingValue = billing.ok ? billing.value : null;
  const billingError = settledError(billing);
  const billingWarnings = billingValue?.summary.warn ?? 0;
  const billingFailures = billingValue?.summary.fail ?? 0;
  const entitlementUsers = (billingValue?.users ?? [])
    .slice()
    .sort((a, b) => {
      const score = (user: typeof a) =>
        (user.issues.length > 0 ? 100 : 0) +
        (user.effectivePremium ? 20 : 0) +
        (user.source === "manual_metadata" ? 10 : 0);
      return score(b) - score(a);
    })
    .slice(0, 16);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#123654_0,#07111f_36%,#030712_100%)] px-5 py-8 text-white md:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-5 rounded-[32px] border border-white/10 bg-slate-950/50 p-7 shadow-2xl shadow-black/30 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.34em] text-cyan-200/70">Syntrake Ops</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight md:text-5xl">Production cockpit</h1>
            <p className="mt-3 max-w-2xl text-slate-300">
              Internal view for the things that decide whether Syntrake is safe to sell: lab health,
              data backfill and premium entitlement integrity.
            </p>
          </div>
          <span className={`rounded-full border px-4 py-2 text-sm font-bold ${statusTone(
            billingFailures > 0 || researchValue?.severity === "error"
              ? "fail"
              : billingWarnings > 0 || researchValue?.severity === "warn"
                ? "warn"
                : "ok",
          )}`}>
            {billingFailures > 0 || researchValue?.severity === "error"
              ? "Action needed"
              : billingWarnings > 0 || researchValue?.severity === "warn"
                ? "Watch"
                : "Healthy"}
          </span>
        </header>

        <div className="mt-7 grid gap-6 lg:grid-cols-2">
          <Card eyebrow="Lab" title="Research runtime">
            {researchValue ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Metric label="Severity" value={researchValue.severity} />
                <Metric label="Active run" value={researchValue.queue.activeRunId ? "running" : "idle"} />
                <Metric label="Stage" value={researchValue.activeRun?.stage ?? "none"} />
                <Metric label="Stage health" value={researchValue.activeRun?.stageHealth ?? "unknown"} />
                <Metric label="Backfill existing" value={researchValue.backfill?.existing ?? "n/a"} />
                <Metric label="Downloadable gaps" value={researchValue.backfill?.missingDownloadable ?? "n/a"} />
              </div>
            ) : (
              <p className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-red-100">
                {researchError}
              </p>
            )}
            {researchValue?.alerts?.length ? (
              <div className="mt-4 space-y-2">
                {researchValue.alerts.map((alert) => (
                  <p key={alert.id} className={`rounded-2xl border p-3 text-sm ${statusTone(alert.severity)}`}>
                    {alert.message}
                  </p>
                ))}
              </div>
            ) : null}
          </Card>

          <Card eyebrow="Billing" title="Premium integrity">
            {billingValue ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Metric label="Checked users" value={billingValue.summary.checked} />
                <Metric label="Premium users" value={billingValue.summary.premium} />
                <Metric label="Warnings" value={billingWarnings} />
                <Metric label="Failures" value={billingFailures} />
                <Metric label="Stripe premium" value={billingValue.summary.stripePremium} />
                <Metric label="Manual premium" value={billingValue.summary.manualMetadataPremium} />
              </div>
            ) : (
              <p className="rounded-2xl border border-amber-300/30 bg-amber-400/10 p-4 text-amber-100">
                {billingError}
              </p>
            )}

            {billingValue?.users.some((user) => user.issues.length > 0) ? (
              <div className="mt-4 space-y-2">
                {billingValue.users
                  .filter((user) => user.issues.length > 0)
                  .slice(0, 8)
                  .map((user) => (
                    <div key={user.userId} className="rounded-2xl border border-amber-300/25 bg-amber-400/10 p-3 text-sm text-amber-50">
                      <p className="font-bold">{user.email ?? user.userId}</p>
                      <p className="text-amber-100/80">{user.issues.map((issue) => issue.code).join(", ")}</p>
                    </div>
                  ))}
              </div>
            ) : null}
          </Card>
        </div>

        <div className="mt-6">
          <Card eyebrow="Entitlements" title="User access audit">
            {billingValue ? (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Metric
                    label="Generated"
                    value={new Date(billingValue.generatedAt).toLocaleString("en-GB", { timeZone: "UTC" })}
                  />
                  <Metric label="Stripe linked" value={billingValue.users.filter((user) => user.stripeCustomerId || user.stripeSubscriptionId).length} />
                  <Metric label="Issue users" value={billingValue.users.filter((user) => user.issues.length > 0).length} />
                </div>

                <div className="mt-5 overflow-x-auto rounded-3xl border border-white/10">
                  <div className="grid min-w-[840px] grid-cols-[minmax(180px,1.2fr)_110px_120px_140px_minmax(180px,1fr)] gap-3 bg-slate-950/70 px-4 py-3 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                    <span>User</span>
                    <span>Access</span>
                    <span>Source</span>
                    <span>Stripe</span>
                    <span>Issues</span>
                  </div>
                  <div className="divide-y divide-white/10">
                    {entitlementUsers.map((user) => (
                      <div
                        key={user.userId}
                        className="grid min-w-[840px] grid-cols-[minmax(180px,1.2fr)_110px_120px_140px_minmax(180px,1fr)] gap-3 px-4 py-4 text-sm text-slate-200"
                      >
                        <div>
                          <p className="font-semibold text-white">{user.email ?? "No email"}</p>
                          <p className="mt-1 break-all text-xs text-slate-500">{user.userId}</p>
                        </div>
                        <span className={user.effectivePremium ? "font-bold text-emerald-200" : "text-slate-400"}>
                          {user.effectivePremium ? "Premium" : "Free"}
                        </span>
                        <span className={`h-fit w-fit rounded-full border px-2.5 py-1 text-xs font-bold ${sourceTone(user.source)}`}>
                          {user.source}
                        </span>
                        <div className="text-xs text-slate-400">
                          <p>{user.stripeStatus ?? "no status"}</p>
                          <p>{maskStripeId(user.stripeSubscriptionId ?? user.stripeCustomerId)}</p>
                        </div>
                        <div className="space-y-1">
                          {user.issues.length > 0 ? (
                            user.issues.map((issue) => (
                              <p
                                key={`${user.userId}-${issue.code}`}
                                className={`rounded-xl border px-2 py-1 text-xs ${statusTone(issue.severity)}`}
                              >
                                {issue.code}
                              </p>
                            ))
                          ) : (
                            <span className="text-slate-500">clear</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <p className="rounded-2xl border border-amber-300/30 bg-amber-400/10 p-4 text-amber-100">
                {billingError}
              </p>
            )}
          </Card>
        </div>
      </div>
    </main>
  );
}
