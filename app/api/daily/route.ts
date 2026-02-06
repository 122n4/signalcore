import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      note:
        "Daily endpoint stub. Wire to your real Daily engine when ready. This exists to avoid 404 spam while iterating.",
    },
    { status: 200 }
  );
}