import { NextResponse } from "next/server";

// ✅ Melhor usar alias em vez de "../../../"
import { MarketRegimeSchema } from "@/lib/signalcore/regime.schema";
import { regimeMock } from "@/lib/signalcore/regime.mock";

// Mantém alinhado com o teu UI / hook:
type Regime = "Risk-on" | "Risk-off" | "Transitional" | "Neutral / Range-bound";

const FALLBACK: Regime = "Neutral / Range-bound";

function normalizeRegime(input: unknown): Regime {
  const v = String(input ?? "").trim();

  if (v === "Risk-on") return "Risk-on";
  if (v === "Risk-off") return "Risk-off";
  if (v === "Transitional") return "Transitional";
  if (v === "Neutral / Range-bound") return "Neutral / Range-bound";

  // tolerância extra (caso schema/mock devolvam diferente)
  const lower = v.toLowerCase();
  if (lower.includes("risk on")) return "Risk-on";
  if (lower.includes("risk off")) return "Risk-off";
  if (lower.includes("transition")) return "Transitional";
  if (lower.includes("neutral") || lower.includes("range")) return "Neutral / Range-bound";

  return FALLBACK;
}

export async function GET() {
  const parsed = MarketRegimeSchema.safeParse(regimeMock);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid regime payload", issues: parsed.error.issues, regime: FALLBACK },
      { status: 200 } // ✅ devolve 200 com fallback (o UI não bloqueia)
    );
  }

  // ✅ Garantir sempre regime válido (nunca null)
  const regime = normalizeRegime((parsed.data as any)?.regime);

  // ✅ Mantém o payload simples e compatível com o hook: { regime: "..." }
  return NextResponse.json(
    {
      ...parsed.data,
      regime,
    },
    { status: 200 }
  );
}