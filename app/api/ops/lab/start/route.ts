import { spawn } from "node:child_process";

import { NextResponse } from "next/server";

import { getRequestUserId } from "@/lib/auth/requestUser";
import { isLocalQaUserId } from "@/lib/auth/localQaAuth";
import { isOwnerUserId } from "@/lib/signalcore/owner";
import { loadResearchConfig } from "@/lib/trading/research/config";
import { buildResearchRuntimeHealth } from "@/lib/trading/research/runtimeHealth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isLabOperator(userId: string) {
  return isOwnerUserId(userId) || isLocalQaUserId(userId);
}

function startSupervisorOnce() {
  const child = spawn(
    process.execPath,
    [
      "-r",
      "./scripts/register-alias.cjs",
      "./node_modules/jiti/bin/jiti.js",
      "scripts/trading/runResearchSupervisor.ts",
    ],
    {
      cwd: process.cwd(),
      detached: true,
      env: {
        ...process.env,
        RESEARCH_MAX_CYCLES: "1",
      },
      stdio: "ignore",
    },
  );
  child.unref();
  return child.pid ?? null;
}

export async function POST(req: Request) {
  const userId = await getRequestUserId(req);
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!isLabOperator(userId)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  try {
    const config = await loadResearchConfig();
    const before = await buildResearchRuntimeHealth({ config });
    const workerPid = startSupervisorOnce();
    const after = await buildResearchRuntimeHealth({ config });

    return NextResponse.json(
      {
        ok: true,
        generatedAt: new Date().toISOString(),
        message:
          "Research lab supervisor was started in the background for one repair/worker cycle. Refresh the lab page shortly to see progress.",
        before,
        result: {
          workerPid,
          started: true,
          maxCycles: 1,
          note: "For true 24/7 operation keep the local scheduled task or daemon enabled.",
        },
        after,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        generatedAt: new Date().toISOString(),
        error: error?.message || "research_lab_start_failed",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
