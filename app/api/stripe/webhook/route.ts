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
  const sig = (await headers()).get("stripe-signature");
  const whsec = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !whsec) {
    return NextResponse.json({ error: "Missing Stripe signature or webhook secret" }, { status: 400 });
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
    // ✅ Caso principal: checkout concluído
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      // 1) Melhor: client_reference_id (mete isto ao criar a session)
      const clerkUserId = session.client_reference_id || null;

      // 2) Fallback: email do checkout
      const email =
        session.customer_details?.email ||
        session.customer_email ||
        null;

      const customerId =
        typeof session.customer === "string" ? session.customer : null;

      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : null;

      // obter clerk client (compatível com setups onde clerkClient é função)
      const client: any =
        typeof clerkClient === "function" ? await (clerkClient as any)() : clerkClient;

      let userIdToUpdate: string | null = clerkUserId;

      // Se não tiver userId, tenta pelo email
      if (!userIdToUpdate && email) {
        const users = await client.users.getUserList({ emailAddress: [email] });
        userIdToUpdate = users?.data?.[0]?.id ?? null;
      }

      if (!userIdToUpdate) {
        console.warn("⚠️ Não consegui mapear o utilizador (sem client_reference_id e sem email).");
        return NextResponse.json({ received: true });
      }

      await client.users.updateUser(userIdToUpdate, {
        publicMetadata: {
          isPaid: true,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
        },
      });

      console.log("✅ Marked isPaid=true for", userIdToUpdate);
      return NextResponse.json({ received: true });
    }

    // ✅ Se cancelarem subscription (opcional)
    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === "string" ? sub.customer : null;

      if (customerId) {
        const client: any =
          typeof clerkClient === "function" ? await (clerkClient as any)() : clerkClient;

        // procura user pelo stripeCustomerId guardado no publicMetadata
        // (Clerk não tem “query por metadata” direto, por isso aqui normalmente guardas isso num DB.
        // Para já, ignora este bloco se não tiveres DB.)
      }
      return NextResponse.json({ received: true });
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("❌ Webhook handler error:", err);
    // Stripe considera OK se devolveres 200; mas nós queremos ver o erro.
    return NextResponse.json({ received: true });
  }
}