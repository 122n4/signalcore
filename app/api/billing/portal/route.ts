import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function stripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");

  // IMPORTANT:
  // Don't pin apiVersion here, because your installed Stripe types require a different literal.
  // Let the SDK default to the version compatible with the installed package.
  return new Stripe(key);
}

async function getOrCreateCustomer(params: { userId: string; email?: string | null }) {
  const sb = supabaseAdmin();

  // You should have a table like: billing_customers(user_id text pk, stripe_customer_id text)
  // If your table name/columns differ, adjust here.
  const { data: existing } = await sb
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", params.userId)
    .maybeSingle();

  if (existing?.stripe_customer_id) return existing.stripe_customer_id;

  const s = stripe();
  const customer = await s.customers.create({
    email: params.email ?? undefined,
    metadata: { userId: params.userId },
  });

  await sb
    .from("billing_customers")
    .upsert(
      { user_id: params.userId, stripe_customer_id: customer.id },
      { onConflict: "user_id" }
    );

  return customer.id;
}

export async function POST() {
  try {
    const a = await auth();
    if (!a.userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const s = stripe();

    const sb = supabaseAdmin();
    const { data: u } = await sb
      .from("user_settings")
      .select("email")
      .eq("user_id", a.userId)
      .maybeSingle();

    const customerId = await getOrCreateCustomer({ userId: a.userId, email: u?.email ?? null });

    const origin =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.VERCEL_URL?.startsWith("http")
        ? process.env.VERCEL_URL
        : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000";

    const session = await s.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/app`,
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: "billing_portal_failed", message: e?.message ?? "Unknown" },
      { status: 500 }
    );
  }
}