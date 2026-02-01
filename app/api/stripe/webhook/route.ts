// app/api/stripe/webhook/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  // TODO: implementar Stripe webhook real
  return NextResponse.json({ ok: true });
}