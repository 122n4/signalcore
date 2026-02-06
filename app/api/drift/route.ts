import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

function stableJson(value: unknown) {
  // JSON estável: ordena chaves recursivamente (simples e seguro)
  const seen = new WeakSet<object>();

  const sorter = (v: any): any => {
    if (v && typeof v === "object") {
      if (seen.has(v)) return null;
      seen.add(v);

      if (Array.isArray(v)) return v.map(sorter);

      const out: Record<string, any> = {};
      for (const k of Object.keys(v).sort()) out[k] = sorter(v[k]);
      return out;
    }
    return v;
  };

  return JSON.stringify(sorter(value));
}

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function driftStatus(delta: number) {
  const a = Math.abs(delta);
  if (a >= 12) return "major";
  if (a >= 6) return "moderate";
  if (a >= 2) return "minor";
  return "stable";
}

export async function POST(req: Request) {
  try {
    const a = await auth();
    const userId = a.userId;
    if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));

    // payload esperado
    const regime = body?.regime ?? null;
    const horizon = body?.horizon ?? null;
    const risk = body?.risk ?? null;

    const goal = body?.goal ?? null;
    const portfolio = Array.isArray(body?.portfolio) ? body.portfolio : [];

    // Engine output (v2) — guarda o que quiseres mostrar mais tarde
    const coherence_overall =
      typeof body?.coherence_overall === "number" ? Math.round(body.coherence_overall) : null;

    const coherence_breakdown = body?.coherence_breakdown ?? null;
    const engine_output = body?.engine_output ?? null;

    // hash do portfolio+goal para detectar mudanças “reais”
    const portfolio_hash = sha256(stableJson({ goal, portfolio }));

    const sb = supabaseAdmin();

    // último snapshot para calcular delta
    const { data: last, error: lastErr } = await sb
      .from("sc_decision_snapshots")
      .select("coherence_overall, portfolio_hash, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastErr) {
      return NextResponse.json(
        { error: "supabase_select_failed", message: lastErr.message },
        { status: 500 }
      );
    }

    const prevScore = typeof last?.coherence_overall === "number" ? last.coherence_overall : null;
    const nextScore = typeof coherence_overall === "number" ? coherence_overall : null;

    let delta: number | null = null;
    let status: string | null = null;

    if (prevScore != null && nextScore != null) {
      delta = clamp(nextScore - prevScore, -100, 100);
      status = driftStatus(delta);
    } else {
      delta = 0;
      status = "stable";
    }

    // evitar spam: se o hash for igual ao último, não cria snapshot novo
    if (last?.portfolio_hash && last.portfolio_hash === portfolio_hash) {
      return NextResponse.json(
        {
          ok: true,
          skipped: true,
          reason: "no_change",
          drift: { delta, status },
        },
        { status: 200 }
      );
    }

    const { error: insErr } = await sb.from("sc_decision_snapshots").insert({
      user_id: userId,
      regime,
      horizon,
      risk,
      goal,
      portfolio_hash,
      coherence_overall: nextScore,
      coherence_breakdown,
      engine_output,
      drift_delta: delta,
      drift_status: status,
    });

    if (insErr) {
      return NextResponse.json(
        { error: "supabase_insert_failed", message: insErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        skipped: false,
        drift: { delta, status },
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: "snapshot_failed", message: err?.message ?? "Unknown" },
      { status: 500 }
    );
  }
}