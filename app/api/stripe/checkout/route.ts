// app/api/stripe/checkout/route.ts
import Stripe from "stripe";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ✅ Não fixes apiVersion aqui — a tua versão do stripe SDK tipa isto como um literal (ex: "2026-01-28.clover")
// e dá erro no build se meteres "2024-06-20".
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const userId = typeof body?.userId === "string" ? body.userId : "";
    const email = typeof body?.email === "string" ? body.email : "";

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Missing STRIPE_SECRET_KEY" }, { status: 500 });
    }

    const priceId = process.env.STRIPE_PRICE_ID;
    if (!priceId) {
      return NextResponse.json({ error: "Missing STRIPE_PRICE_ID" }, { status: 500 });
    }

    if (!userId || !email) {
      return NextResponse.json({ error: "Missing userId/email" }, { status: 400 });
    }

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email,
      success_url: `${appUrl}/pricing?success=1`,
      cancel_url: `${appUrl}/pricing?canceled=1`,
      client_reference_id: userId,
      metadata: { clerkUserId: userId },
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: "stripe_checkout_failed", message: e?.message ?? "Checkout error" },
      { status: 500 }
    );
  }
}