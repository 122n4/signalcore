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
    // ✅ user logado
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const priceId = process.env.STRIPE_PRICE_ID!;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL!; // deve ser https://signalcore.vercel.app na Vercel

    // ✅ ir buscar email do utilizador no Clerk
    const client: any =
      typeof clerkClient === "function" ? await (clerkClient as any)() : clerkClient;

    const user = await client.users.getUser(userId);
    const email =
      user.emailAddresses?.[0]?.emailAddress ||
      user.primaryEmailAddress?.emailAddress;

    if (!email) {
      return NextResponse.json({ error: "Missing email" }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email,

      // ✅ IMPORTANTÍSSIMO: dá ao webhook um ID certo
      client_reference_id: userId,
      metadata: { clerkUserId: userId },

      success_url: `${appUrl}/pricing?success=1`,
      cancel_url: `${appUrl}/pricing?canceled=1`,
    });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error("checkout error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Checkout error" },
      { status: 500 }
    );
  }
}