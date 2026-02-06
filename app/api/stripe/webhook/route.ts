import Stripe from "stripe";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { clerkClient } from "@clerk/nextjs/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

export async function POST(req: Request) {
  const sig = headers().get("stripe-signature");
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
    // clerkClient pode ser função async nalguns setups
    const client: any =
      typeof clerkClient === "function"
        ? await (clerkClient as any)()
        : clerkClient;

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      // ✅ Mapear user
      let userId: string | null =
        session.client_reference_id ??
        session.metadata?.userId ??
        null;

      // fallback: email (último recurso)
      const email =
        session.customer_details?.email ||
        session.customer_email ||
        null;

      if (!userId && email) {
        const users = await client.users.getUserList({ emailAddress: [email] });
        userId = users?.data?.[0]?.id ?? null;
      }

      if (!userId) {
        console.warn("⚠️ Webhook: não consegui mapear user.");
        return NextResponse.json({ received: true });
      }

      const customerId =
        typeof session.customer === "string" ? session.customer : null;

      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : null;

      await client.users.updateUser(userId, {
        publicMetadata: {
          isPaid: true,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
        },
      });

      console.log("✅ isPaid=true for", userId, "customer:", customerId);
      return NextResponse.json({ received: true });
    }

    // (opcional) downgrade automático — só se tiveres DB/lookup robusto
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("❌ Webhook handler error:", err);
    return NextResponse.json({ received: true });
  }
}