import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ isPaid: false });

  const user = await clerkClient.users.getUser(userId);
  const isPaid = Boolean((user.publicMetadata as any)?.isPaid);

  return NextResponse.json({ isPaid });
}