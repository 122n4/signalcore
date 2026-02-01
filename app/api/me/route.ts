// app/api/me/route.ts
import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ isAuthenticated: false, isPaid: false });
    }

    // clerkClient pode ser função async dependendo da versão
    const client = await clerkClient();
    const user = await client.users.getUser(userId);

    const isPaid = Boolean((user.publicMetadata as Record<string, any>)?.isPaid);

    return NextResponse.json({ isAuthenticated: true, isPaid });
  } catch (err) {
    console.error("api/me error:", err);
    return NextResponse.json({ isAuthenticated: false, isPaid: false }, { status: 200 });
  }
}