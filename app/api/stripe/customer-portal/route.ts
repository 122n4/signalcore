import Stripe from "stripe";
import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

export async function POST() {
  try {
    const a = await auth();
    const userId = a.userId;
    if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const client: any =
      typeof clerkClient === "function" ? await (clerkClient as any)() : clerkClient;

    const user = await client.users.getUser(userId);
    const md = (user.publicMetadata ?? {}) as Record<string, any>;
    const stripeCustomerId = md.stripeCustomerId as string | undefined;

    if (!stripeCustomerId) {
      return NextResponse.json(
        { error: "missing_stripe_customer_id" },
        { status: 400 }
      );
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/app`,
    });

    return NextResponse.json({ url: portal.url }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "portal_error" },
      { status: 500 }
    );
  }
}