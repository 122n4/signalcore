import { NextResponse } from "next/server";

export async function POST(req: Request) {
  // TODO: aqui entra a validação do Stripe signature e o processamento do evento.
  // Por agora, só devolve 200 para o build não rebentar.
  await req.text();
  return NextResponse.json({ ok: true }, { status: 200 });
}