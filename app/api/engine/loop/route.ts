import { NextResponse } from "next/server";
import { runEngineLoop } from "@/lib/engine/loop";
import { isEngineLoopAuthorized } from "@/lib/engine/loopAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseBool(v: string | null | undefined) {
  if (!v) return false;
  const x = String(v).toLowerCase().trim();
  return x === "1" || x === "true" || x === "yes" || x === "on";
}

function isAuthorized(req: Request) {
  return isEngineLoopAuthorized({ headers: req.headers, env: process.env });
}

function parseQuery(req: Request) {
  const url = new URL(req.url);
  return {
    limit: Number(url.searchParams.get("limit") || "25"),
    userId: url.searchParams.get("userId"),
    mode: url.searchParams.get("mode"),
    dryRun: parseBool(url.searchParams.get("dryRun")),
    force: parseBool(url.searchParams.get("force")),
  };
}

async function parseBody(req: Request) {
  const body = await req.json().catch(() => ({}));
  return {
    limit: Number((body as { limit: number }).limit ?? 25),
    userId: ((body as { userId: string }).userId || null) as string | null,
    mode: ((body as { mode: string }).mode || null) as string | null,
    dryRun: Boolean((body as { dryRun: boolean }).dryRun),
    force: Boolean((body as { force: boolean }).force),
  };
}

function ensureLoopEnabled() {
  const v = String(process.env.ENGINE_LOOP_ENABLED || "1").toLowerCase().trim();
  return !(v === "0" || v === "false" || v === "off" || v === "no");
}

async function handleRun(req: Request, source: "get" | "post") {
  if (!ensureLoopEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        error: "engine_loop_disabled",
        message: "Set ENGINE_LOOP_ENABLED=1 to enable the server loop.",
      },
      { status: 503 }
    );
  }

  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const args = source === "post" ? await parseBody(req) : parseQuery(req);
    const result = await runEngineLoop({
      limit: args.limit,
      userId: args.userId,
      mode: args.mode,
      dryRun: args.dryRun,
      force: args.force,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "engine_loop_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handleRun(req, "get");
}

export async function POST(req: Request) {
  return handleRun(req, "post");
}
