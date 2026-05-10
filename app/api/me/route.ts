import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { getRequestUserId } from "@/lib/auth/requestUser";
import { isLocalQaUserId } from "@/lib/auth/localQaAuth";
import { hasProAccessFromMetadata } from "@/lib/signalcore/trial";
import { isOwnerUserId } from "@/lib/signalcore/owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isDevForceProEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.SC_FORCE_PRO === "1";
}

export async function GET(req: Request) {
  try {
    const userId = await getRequestUserId(req);

    if (!userId) {
      return NextResponse.json({
        isAuthenticated: false,
        isPaid: false,
        hasProAccess: false,
        planStatus: "free",
        trial: {
          active: false,
          started: false,
          expired: false,
          startedAt: null,
          endsAt: null,
          remainingDays: 0,
          days: 0,
        },
      });
    }

    if (isDevForceProEnabled() || isOwnerUserId(userId) || isLocalQaUserId(userId)) {
      return NextResponse.json(
        {
          isAuthenticated: true,
          isPaid: true,
          hasProAccess: true,
          planStatus: "paid",
          trial: {
            active: false,
            started: false,
            expired: false,
            startedAt: null,
            endsAt: null,
            remainingDays: 0,
            days: 0,
          },
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const client: any =
      typeof clerkClient === "function" ? await (clerkClient as any)() : clerkClient;

    const user = await client.users.getUser(userId);
    const access = hasProAccessFromMetadata(user.publicMetadata as any);
    const planStatus = access.isPaid ? "paid" : access.trial.isActive ? "trial" : "free";

    return NextResponse.json(
      {
        isAuthenticated: true,
        isPaid: access.isPaid,
        hasProAccess: access.hasProAccess,
        planStatus,
        trial: {
          active: access.trial.isActive,
          started: access.trial.hasStarted,
          expired: access.trial.isExpired,
          startedAt: access.trial.startedAt,
          endsAt: access.trial.endsAt,
          remainingDays: access.trial.remainingDays,
          days: access.trial.days,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      {
        isAuthenticated: false,
        isPaid: false,
        hasProAccess: false,
        planStatus: "free",
        trial: {
          active: false,
          started: false,
          expired: false,
          startedAt: null,
          endsAt: null,
          remainingDays: 0,
          days: 0,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
