import { dayKeyUTCFromIso } from "@/lib/signalcore/executionProof";

function normalizeDayKey(raw: unknown) {
  const value = String(raw || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export function resolveDoneToday(args: {
  serverDoneToday: boolean;
  optimisticClosedDayKey?: string | null;
  nowIso?: string | null;
}) {
  const nowIso = args.nowIso || new Date().toISOString();
  const today = dayKeyUTCFromIso(nowIso);
  const optimisticDay = normalizeDayKey(args.optimisticClosedDayKey);
  const optimisticDoneToday = Boolean(today && optimisticDay && today === optimisticDay);
  return Boolean(args.serverDoneToday) || optimisticDoneToday;
}

