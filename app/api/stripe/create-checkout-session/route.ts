import { POST as checkoutPost } from "@/app/api/stripe/checkout/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return checkoutPost(req);
}
