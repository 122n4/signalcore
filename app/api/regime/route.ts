import { NextResponse } from "next/server";
import { MarketRegimeSchema } from "@/lib/signalcore/regime.schema";
import { regimeMock } from "@/lib/signalcore/regime.mock";

export async function GET() {
  // Aqui, no futuro, trocas "regimeMock" por:
  // - ficheiro JSON gerado pela IA
  // - BD (SQLite/Postgres)
  // - chamada a um worker
  const parsed = MarketRegimeSchema.safeParse(regimeMock);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid regime payload", issues: parsed.error.issues },
      { status: 500 }
    );
  }

  return NextResponse.json(parsed.data, { status: 200 });
}