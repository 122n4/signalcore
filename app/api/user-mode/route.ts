import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { getRequestUserId } from "@/lib/auth/requestUser";
import { isLocalQaUserId } from "@/lib/auth/localQaAuth";
import { normalizeMode, type AutopilotMode } from "@/lib/signalcore/modes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = await getRequestUserId(req);
  if (!userId) return NextResponse.json({ mode: "investing" });
  if (isLocalQaUserId(userId)) return NextResponse.json({ mode: "trading" });

  const client: any =
    typeof clerkClient === "function" ? await (clerkClient as any)() : clerkClient;

  const user = await client.users.getUser(userId);
  const mode = normalizeMode((user.publicMetadata as any)?.mode || "investing");

  return NextResponse.json({
    mode,
  });
}

export async function POST(req: Request) {
  const userId = await getRequestUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const mode: AutopilotMode = normalizeMode((body as any)?.mode || "investing");
  if (isLocalQaUserId(userId)) return NextResponse.json({ ok: true, mode });

  const client: any =
    typeof clerkClient === "function" ? await (clerkClient as any)() : clerkClient;

  await client.users.updateUser(userId, {
    publicMetadata: {
      ...(await safeGetPublicMetadata(client, userId)),
      mode,
    },
  });

  return NextResponse.json({ ok: true, mode });
}

async function safeGetPublicMetadata(client: any, userId: string) {
  try {
    const u = await client.users.getUser(userId);
    return (u.publicMetadata as any) ?? {};
  } catch {
    return {};
  }
}
