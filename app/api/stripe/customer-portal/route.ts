// app/api/stripe/customer-portal/route.ts
import Stripe from "stripe";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ✅ Não fixes apiVersion aqui (o teu stripe SDK tipa isto como literal e rebenta no build)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST() {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Missing STRIPE_SECRET_KEY" }, { status: 500 });
    }

    const a = await auth();
    const userId = a.userId;
    if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

    // ✅ Se tiveres o STRIPE_CUSTOMER_ID guardado no Clerk publicMetadata ou no teu DB,
    // troca este lookup para ires buscar o customerId real.
    // Para já, o mais robusto é procurar por email via Clerk -> mas como não temos email aqui,
    // devolvemos erro claro para não criar portal errado.
    //
    // Se já tens customerId noutro sítio (ex: env, supabase, clerk metadata), cola-me o teu store e eu ligo já.
    const customerIdFromEnv = process.env.STRIPE_CUSTOMER_ID;

    if (!customerIdFromEnv) {
      return NextResponse.json(
        {
          error: "missing_customer",
          message:
            "Missing STRIPE_CUSTOMER_ID. Store the Stripe customer id per user (recommended) and create the portal with it.",
        },
        { status: 400 }
      );
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerIdFromEnv,
      return_url: `${appUrl}/pricing`,
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: "stripe_customer_portal_failed", message: e?.message ?? "Unknown" },
      { status: 500 }
    );
  }
}