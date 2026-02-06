// app/api/opportunities/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { demoOpportunities, demoPortfolio } from "@/lib/opportunities/demo";
import { buildOpportunitiesReal } from "@/lib/opportunities/realEngine";
import { readPortfolioSnapshotSB, readUserSettingsSB } from "@/lib/opportunities/supabaseRepo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { userId } = await auth().catch(() => ({ userId: null as any }));

    // Guest: demo (never empty)
    if (!userId) {
      return NextResponse.json(
        {
          ok: true,
          mode: "demo",
          asOf: new Date().toISOString(),
          regime: "Demo mode (connect portfolio for real)",
          portfolio: demoPortfolio(),
          opportunities: demoOpportunities(),
        },
        { status: 200 }
      );
    }

    // Logged-in: real, but safe fallback
    const settings = await readUserSettingsSB(userId).catch(() => ({} as any));
    const snapshot = await readPortfolioSnapshotSB(userId).catch(() => null);

    if (!snapshot) {
      return NextResponse.json(
        {
          ok: true,
          mode: "demo",
          asOf: new Date().toISOString(),
          regime: "No portfolio snapshot yet",
          portfolio: demoPortfolio(),
          opportunities: demoOpportunities(),
          note: "Import/connect a portfolio to unlock real sizing & guardrails.",
        },
        { status: 200 }
      );
    }

    const { regime, portfolioMini, opportunities } = buildOpportunitiesReal({
      settings,
      portfolio: snapshot,
    });

    return NextResponse.json(
      {
        ok: true,
        mode: "user",
        asOf: new Date().toISOString(),
        regime,
        portfolio: portfolioMini,
        opportunities,
      },
      { status: 200 }
    );
  } catch (e: any) {
    // Always return something usable (never blank)
    return NextResponse.json(
      {
        ok: true,
        mode: "demo",
        asOf: new Date().toISOString(),
        regime: "Fallback mode (error)",
        portfolio: demoPortfolio(),
        opportunities: demoOpportunities(),
        error: e?.message ?? "Unknown",
      },
      { status: 200 }
    );
  }
}