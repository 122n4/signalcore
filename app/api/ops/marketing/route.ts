import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import {
  attachMarketingAsset,
  createMarketingContent,
  createMarketingLead,
  listMarketingOps,
  publishMarketingContent,
  refreshMarketingCreative,
  requestMarketingCreative,
  updateMarketingContent,
} from "@/lib/marketing/marketingOps";
import { isLocalQaUserId } from "@/lib/auth/localQaAuth";
import { isOwnerUserId } from "@/lib/signalcore/owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireOwner() {
  const { userId } = await auth();
  if (!userId || (!isOwnerUserId(userId) && !isLocalQaUserId(userId))) {
    return { ok: false as const, userId: null };
  }
  return { ok: true as const, userId };
}

async function readBody(req: Request) {
  return (await req.json().catch(() => ({}))) as Record<string, any>;
}

export async function GET() {
  const owner = await requireOwner();
  if (!owner.ok) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  try {
    const data = await listMarketingOps(owner.userId);
    return NextResponse.json({ ok: true, ...data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: "marketing_ops_read_failed", message: error?.message ?? "Unknown" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(req: Request) {
  const owner = await requireOwner();
  if (!owner.ok) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  try {
    const body = await readBody(req);
    const action = String(body.action || "generate").trim();

    if (action === "generate") {
      const item = await createMarketingContent({
        ownerUserId: owner.userId,
        title: body.title,
        campaign: body.campaign,
        channel: body.channel,
        audience: body.audience,
        objective: body.objective,
        body: body.body,
        notes: body.notes,
      });
      return NextResponse.json({ ok: true, item }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "update") {
      const item = await updateMarketingContent({
        ownerUserId: owner.userId,
        id: body.id,
        status: body.status,
        scheduledFor: body.scheduledFor,
        notes: body.notes,
        body: body.body,
        metrics: body.metrics,
      });
      return NextResponse.json({ ok: true, item }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "lead") {
      const lead = await createMarketingLead({
        ownerUserId: owner.userId,
        name: body.name,
        email: body.email,
        source: body.source,
        notes: body.notes,
      });
      return NextResponse.json({ ok: true, lead }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "creative") {
      const item = await requestMarketingCreative({
        ownerUserId: owner.userId,
        id: body.id,
        kind: body.kind,
      });
      return NextResponse.json({ ok: true, item }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "creative-status") {
      const item = await refreshMarketingCreative({
        ownerUserId: owner.userId,
        id: body.id,
      });
      return NextResponse.json({ ok: true, item }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "asset") {
      const item = await attachMarketingAsset({
        ownerUserId: owner.userId,
        id: body.id,
        kind: body.kind,
        assetUrl: body.assetUrl,
        thumbnailUrl: body.thumbnailUrl,
      });
      return NextResponse.json({ ok: true, item }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "publish") {
      const item = await publishMarketingContent({
        ownerUserId: owner.userId,
        id: body.id,
        provider: body.provider,
        publishNow: body.publishNow,
      });
      return NextResponse.json({ ok: true, item }, { headers: { "Cache-Control": "no-store" } });
    }

    return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: "marketing_ops_write_failed", message: error?.message ?? "Unknown" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
