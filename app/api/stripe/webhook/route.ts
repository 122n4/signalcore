// app/api/stripe/webhook/route.ts
import Stripe from "stripe";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ✅ Não fixes apiVersion (está a rebentar o build por typing literal)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

function json(status: number, body: any) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Stripe webhooks precisam do body "raw"
export async function POST(req: Request) {
  try {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    const key = process.env.STRIPE_SECRET_KEY;

    if (!key) return json(500, { error: "missing_STRIPE_SECRET_KEY" });
    if (!secret) return json(500, { error: "missing_STRIPE_WEBHOOK_SECRET" });

    const sig = req.headers.get("stripe-signature");
    if (!sig) return json(400, { error: "missing_stripe_signature" });

    const rawBody = await req.text();

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, secret);
    } catch (err: any) {
      return json(400, { error: "invalid_signature", message: err?.message ?? "Unknown" });
    }

    // ✅ Aqui: trata os eventos que te interessam.
    // Mantém minimalista para não quebrares deploy.
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        // Tip: tens `session.client_reference_id` e/ou `session.metadata?.clerkUserId`
        // para mapear ao userId do Clerk.
        // Ex:
        // const userId = session.client_reference_id || session.metadata?.clerkUserId;

        // TODO: atualizar o teu paid state / subscription no Supabase/Clerk.
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        // TODO: atualizar status/renovações/cancelamentos no teu store.
        break;
      }

      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        // TODO: marcar paid/unpaid, etc.
        break;
      }

      default:
        // deixa passar
        break;
    }

    // Stripe exige 2xx rápido
    return json(200, { received: true });
  } catch (e: any) {
    return json(500, { error: "stripe_webhook_failed", message: e?.message ?? "Unknown" });
  }
}