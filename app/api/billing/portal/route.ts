import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  return new Stripe(key, { apiVersion: "2024-06-20" });
}

async function getOrCreateCustomer(params: {
  userId: string;
  email?: string | null;
}) {
  const stripe = getStripe();

  // 1) tenta encontrar customer pelo metadata (mais robusto)
  const search = await stripe.customers.search({
    query: `metadata['clerk_user_id']:'${params.userId}'`,
    limit: 1,
  });

  if (search.data[0]) return search.data[0];

  // 2) fallback: cria novo customer (guarda clerk_user_id)
  const customer = await stripe.customers.create({
    email: params.email ?? undefined,
    metadata: { clerk_user_id: params.userId },
  });

  return customer;
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const user = await currentUser();
    const email = user?.emailAddresses?.[0]?.emailAddress ?? null;

    const stripe = getStripe();

    const customer = await getOrCreateCustomer({ userId, email });

    const origin =
      req.headers.get("origin") ??
      process.env.NEXT_PUBLIC_APP_URL ??
      "http://localhost:3000";

    const returnUrl =
      process.env.STRIPE_PORTAL_RETURN_URL ?? `${origin}/app`;

    const session = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: returnUrl,
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err: any) {
    console.error("billing/portal error:", err);
    return NextResponse.json(
      { error: "billing_portal_failed", message: err?.message ?? "Unknown" },
      { status: 500 }
    );
  }
}