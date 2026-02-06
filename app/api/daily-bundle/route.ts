// app/api/daily-bundle/route.ts

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { buildDailyBundle } from "@/lib/signalcore/dailyBundle";
import {
  planFromSettings,
  readPortfolioSnapshot,
  readUserSettings,
} from "@/lib/signalcore/supabaseRepo";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function dateKeyUTC(ts = Date.now()) {
  const d = new Date(ts);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const settings = await readUserSettings(userId);
    const plan = planFromSettings(settings);

    const portfolio =
      (await readPortfolioSnapshot(userId)) ??
      ({
        baseCurrency: settings?.goal_currency ?? "EUR",
        asOf: Date.now(),
        cashBase: 0,
        holdings: [],
      } as any);

    const bundle = buildDailyBundle({ portfolio, plan });

    // store daily snapshot
    const sb = supabaseAdmin();
    const key = dateKeyUTC(bundle.asOf);

    await sb.from("daily_snapshots").upsert(
      {
        user_id: userId,
        date_key: key,
        bundle,
        created_at: new Date().toISOString(),
      },
      { onConflict: "user_id,date_key" }
    );

    // IMPORTANT:
    // Return the FULL bundle including plan + portfolio + derived.
    return NextResponse.json(bundle, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: "daily_bundle_failed", message: e?.message ?? "Unknown" },
      { status: 500 }
    );
  }
}