import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ isPaid: false }, { status: 200 });
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);

  const meta = user.publicMetadata as Record<string, unknown>;
  const isPaid = Boolean(meta?.isPaid);

  return NextResponse.json({ isPaid }, { status: 200 });
}