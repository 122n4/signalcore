import { auth } from "@clerk/nextjs/server";
import Link from "next/link";

import BotPageClient from "./BotPageClient";
import { isLocalQaUserId } from "@/lib/auth/localQaAuth";
import { isOwnerUserId } from "@/lib/signalcore/owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function BotPage() {
  const { userId } = await auth();
  const allowed = isOwnerUserId(userId) || isLocalQaUserId(userId);

  if (!userId) {
    return (
      <main className="min-h-screen bg-[#07111f] px-6 py-16 text-white">
        <section className="mx-auto max-w-2xl rounded-[28px] border border-white/10 bg-white/[0.04] p-8">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-slate-500">Syntrake Bot</p>
          <h1 className="mt-3 text-3xl font-black">Login required</h1>
          <p className="mt-3 text-slate-300">Sign in first to open your private bot cockpit.</p>
          <Link
            href={`/sign-in?redirect_url=${encodeURIComponent("/app/bot")}`}
            className="mt-6 inline-flex rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950"
          >
            Sign in
          </Link>
        </section>
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="min-h-screen bg-[#07111f] px-6 py-16 text-white">
        <section className="mx-auto max-w-2xl rounded-[28px] border border-white/10 bg-white/[0.04] p-8">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-slate-500">Syntrake Bot</p>
          <h1 className="mt-3 text-3xl font-black">Owner access required</h1>
          <p className="mt-3 text-slate-300">
            This autonomous bot cockpit is private and limited to configured owner accounts.
          </p>
          <Link
            href="/app?mode=trading&tab=trading"
            className="mt-6 inline-flex rounded-2xl border border-white/10 px-5 py-3 text-sm font-bold text-white"
          >
            Back to trading desk
          </Link>
        </section>
      </main>
    );
  }

  return <BotPageClient userId={userId} />;
}
