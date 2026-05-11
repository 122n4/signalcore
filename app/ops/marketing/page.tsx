import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";

import MarketingOpsClient from "@/components/ops/MarketingOpsClient";
import { isOwnerUserId } from "@/lib/signalcore/owner";
import { listMarketingOps } from "@/lib/marketing/marketingOps";

export const metadata: Metadata = {
  title: "Marketing Ops | Syntrake",
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function MarketingOpsPage() {
  const { userId } = await auth();

  if (!userId || !isOwnerUserId(userId)) {
    return (
      <main className="min-h-screen bg-[#07111f] px-6 py-16 text-white">
        <div className="mx-auto max-w-2xl rounded-[28px] border border-white/10 bg-white/[0.04] p-8">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-slate-500">Syntrake Marketing Ops</p>
          <h1 className="mt-3 text-3xl font-bold">Owner access required</h1>
          <p className="mt-3 text-slate-300">
            The marketing command center is limited to configured owner accounts.
          </p>
        </div>
      </main>
    );
  }

  const ops = await listMarketingOps(userId).catch((error: any) => ({
    schemaReady: false,
    content: [],
    leads: [],
    error: error?.message ?? "marketing_ops_load_failed",
  }));

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#123654_0,#07111f_36%,#030712_100%)] px-5 py-8 text-white md:px-10">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-[34px] border border-white/10 bg-slate-950/50 p-7 shadow-2xl shadow-black/30">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.34em] text-cyan-200/70">Syntrake Growth</p>
              <h1 className="mt-3 text-4xl font-black tracking-tight md:text-5xl">Marketing command center</h1>
              <p className="mt-3 max-w-3xl text-slate-300">
                Generate, review, approve and track marketing content without auto-sending emails,
                auto-DMs, false financial claims or external publishing without human approval.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/ops"
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/10"
              >
                Back to Ops
              </Link>
              <span className="rounded-2xl border border-emerald-300/35 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-100">
                Human approval required
              </span>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-4">
            {[
              ["No auto-send", "Gmail will only create drafts later."],
              ["No auto-DM", "No cold automated private outreach."],
              ["No promises", "No fake returns, win-rate or profit claims."],
              ["Approve first", "External actions stay gated by you."],
            ].map(([title, body]) => (
              <div key={title} className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                <p className="font-bold text-white">{title}</p>
                <p className="mt-1 text-sm leading-6 text-slate-400">{body}</p>
              </div>
            ))}
          </div>
        </header>

        <div className="mt-7">
          <MarketingOpsClient
            initialContent={ops.content}
            initialLeads={ops.leads}
            schemaReady={ops.schemaReady}
            schemaError={ops.error}
          />
        </div>
      </div>
    </main>
  );
}

