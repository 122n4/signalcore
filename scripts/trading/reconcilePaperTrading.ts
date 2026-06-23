import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  readPaperHistoryPayload,
} from "@/lib/trading/bot/paperRunner";

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}

async function main() {
  const userId = argValue("--user-id") || process.env.SYNTRAKE_PAPER_USER_ID || process.env.SYNTRAKE_OWNER_USER_ID;
  if (!userId) throw new Error("Missing --user-id or SYNTRAKE_PAPER_USER_ID.");

  const days = Number(argValue("--days") || 183);
  const maxSettlements = Number(argValue("--max-settlements") || 20);

  const payload = await readPaperHistoryPayload(userId, {
    days: Number.isFinite(days) ? days : 183,
    maxSettlements: Number.isFinite(maxSettlements) ? maxSettlements : 20,
  });

  const sb = getSupabaseAdmin();
  const { count, error } = await sb
    .from("paper_trades")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) throw new Error(error.message || "paper_trades_count_failed");

  console.log(JSON.stringify({
    ok: true,
    userId,
    canonicalRows: count ?? null,
    summary: payload.summary,
    observability: payload.observability,
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
