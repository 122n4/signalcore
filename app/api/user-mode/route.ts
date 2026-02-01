import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UserMode = "investing" | "trading";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ mode: "investing" });

  const client: any =
    typeof clerkClient === "function" ? await (clerkClient as any)() : clerkClient;

  const user = await client.users.getUser(userId);
  const mode = (user.publicMetadata as any)?.mode;

  return NextResponse.json({
    mode: mode === "trading" ? "trading" : "investing",
  });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const mode: UserMode = body?.mode === "trading" ? "trading" : "investing";

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