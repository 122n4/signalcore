import Stripe from "stripe";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { clerkClient } from "@clerk/nextjs/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  const sig = headers().get("stripe-signature"); // ✅ sem await
  const whsec = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !whsec) {
    return NextResponse.json(
      { error: "Missing Stripe signature or webhook secret" },
      { status: 400 }
    );
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, whsec);
  } catch (err: any) {
    console.error("❌ Stripe signature verify failed:", err?.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      // ✅ 1) principal: client_reference_id (definimos no checkout)
      let clerkUserId: string | null = session.client_reference_id ?? null;

      // ✅ 2) fallback: metadata (também definimos no checkout)
      if (!clerkUserId && session.metadata?.clerkUserId) {
        clerkUserId = session.metadata.clerkUserId;
      }

      // ✅ 3) fallback final: email
      const email =
        session.customer_details?.email ||
        session.customer_email ||
        null;

      const customerId =
        typeof session.customer === "string" ? session.customer : null;

      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : null;

      // clerkClient pode ser função async nalguns setups
      const client: any =
        typeof clerkClient === "function" ? await (clerkClient as any)() : clerkClient;

      // se não tiver userId, tenta resolver por email
      if (!clerkUserId && email) {
        const users = await client.users.getUserList({ emailAddress: [email] });
        clerkUserId = users?.data?.[0]?.id ?? null;
      }

      if (!clerkUserId) {
        console.warn("⚠️ Não consegui mapear user (sem client_reference_id/metadata/email).");
        return NextResponse.json({ received: true });
      }

      await client.users.updateUser(clerkUserId, {
        publicMetadata: {
          isPaid: true,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
        },
      });

      console.log("✅ Marked isPaid=true for", clerkUserId);
      return NextResponse.json({ received: true });
    }

    // (opcional) se quiseres “desativar” quando cancelam:
    if (event.type === "customer.subscription.deleted") {
      // Aqui só dá para fazer bem se tiveres uma DB/lookup pelo stripeCustomerId.
      // Por agora, deixa como no-op.
      return NextResponse.json({ received: true });
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("❌ Webhook handler error:", err);
    // Mantemos 200 para o Stripe não ficar a repetir indefinidamente
    return NextResponse.json({ received: true });
  }
}