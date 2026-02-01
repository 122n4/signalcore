import Stripe from "stripe";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

export async function POST(req: Request) {
  try {
    const { userId, email } = await req.json();

    if (!userId || !email) {
      return NextResponse.json({ error: "Missing userId/email" }, { status: 400 });
    }

    const priceId = process.env.STRIPE_PRICE_ID!;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL!;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],

      // ✅ garante mapping 1:1 para o Clerk user
      client_reference_id: userId,

      // ✅ fallback caso precises (Stripe UI)
      customer_email: email,

      // ✅ também guardamos em metadata (bom para debugging)
      metadata: { clerkUserId: userId },

      // (opcional) facilita o portal / customer
      // customer_creation: "always",

      success_url: `${appUrl}/pricing?success=1`,
      cancel_url: `${appUrl}/pricing?canceled=1`,
    });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error("checkout error:", e);
    return NextResponse.json({ error: e?.message ?? "Checkout error" }, { status: 500 });
  }
}