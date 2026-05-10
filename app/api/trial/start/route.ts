import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getTrialDaysConfig, hasProAccessFromMetadata, resolveTrialState } from "@/lib/signalcore/trial";
import { logConversionEvent } from "@/lib/signalcore/conversion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, body: unknown) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) return json(401, { ok: false, error: "unauthorized" });

    const client: any =
      typeof clerkClient === "function" ? await (clerkClient as any)() : clerkClient;

    const user = await client.users.getUser(userId);
    const currentMeta =
      user.publicMetadata && typeof user.publicMetadata === "object"
        ? (user.publicMetadata as Record<string, unknown>)
        : {};

    const access = hasProAccessFromMetadata(currentMeta);
    if (access.isPaid) {
      void logConversionEvent({
        userId,
        event: "trial_start_blocked_paid",
        source: "trial_start_api",
        details: { reason: "already_paid" },
      });
      return json(200, {
        ok: true,
        started: false,
        hasProAccess: true,
        reason: "already_paid",
        trial: {
          active: false,
          started: access.trial.hasStarted,
          expired: access.trial.isExpired,
          startedAt: access.trial.startedAt,
          endsAt: access.trial.endsAt,
          remainingDays: access.trial.remainingDays,
          days: access.trial.days,
        },
      });
    }

    if (access.trial.isActive) {
      void logConversionEvent({
        userId,
        event: "trial_start_already_active",
        source: "trial_start_api",
        details: { reason: "trial_already_active" },
      });
      return json(200, {
        ok: true,
        started: false,
        hasProAccess: true,
        reason: "trial_already_active",
        trial: {
          active: true,
          started: true,
          expired: false,
          startedAt: access.trial.startedAt,
          endsAt: access.trial.endsAt,
          remainingDays: access.trial.remainingDays,
          days: access.trial.days,
        },
      });
    }

    if (access.trial.hasStarted && access.trial.isExpired) {
      void logConversionEvent({
        userId,
        event: "trial_blocked_used",
        source: "trial_start_api",
        details: { reason: "trial_already_used" },
      });
      return json(409, {
        ok: false,
        error: "trial_already_used",
        hasProAccess: false,
        trial: {
          active: false,
          started: true,
          expired: true,
          startedAt: access.trial.startedAt,
          endsAt: access.trial.endsAt,
          remainingDays: 0,
          days: access.trial.days,
        },
      });
    }

    const nowIso = new Date().toISOString();
    const trialDays = getTrialDaysConfig();
    const endIso = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString();

    const nextMeta: Record<string, unknown> = {
      ...currentMeta,
      trialStartedAt: nowIso,
      trialEndsAt: endIso,
      trialDays,
      trialSource: "self_serve",
      trialActivatedAt: nowIso,
    };

    await client.users.updateUser(userId, { publicMetadata: nextMeta });
    void logConversionEvent({
      userId,
      event: "trial_started",
      source: "trial_start_api",
      details: { trialDays, endsAt: endIso },
    });

    const trial = resolveTrialState(nextMeta);

    return json(200, {
      ok: true,
      started: true,
      hasProAccess: true,
      reason: "trial_started",
      trial: {
        active: trial.isActive,
        started: trial.hasStarted,
        expired: trial.isExpired,
        startedAt: trial.startedAt,
        endsAt: trial.endsAt,
        remainingDays: trial.remainingDays,
        days: trial.days,
      },
    });
  } catch (e: any) {
    return json(500, {
      ok: false,
      error: "trial_start_failed",
      message: e.message || "Unknown",
    });
  }
}
