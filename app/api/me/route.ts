import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({
        isAuthenticated: false,
        isPaid: false,
      });
    }

    const client: any =
      typeof clerkClient === "function" ? await (clerkClient as any)() : clerkClient;

    const user = await client.users.getUser(userId);
    const isPaid = Boolean((user.publicMetadata as any)?.isPaid);

    // ✅ nunca cache
    return NextResponse.json(
      { isAuthenticated: true, isPaid },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return NextResponse.json(
      { isAuthenticated: false, isPaid: false },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}