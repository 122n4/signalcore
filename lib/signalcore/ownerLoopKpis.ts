const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export type OwnerConversionEventRow = {
  user_id?: string | null;
  title?: string | null;
  details?: Record<string, unknown> | null;
  created_at?: string | null;
};

export type OwnerDailySnapshotRow = {
  user_id?: string | null;
  day_key?: string | null;
  created_at?: string | null;
  mode?: string | null;
};

export type OwnerLoopKpiMetric = {
  label: string;
  rate: number;
  numerator: number;
  denominator: number;
  definition: string;
};

export type OwnerLoopKpisPayload = {
  days: number;
  kpis: {
    activationD1: OwnerLoopKpiMetric;
    retentionD7: OwnerLoopKpiMetric;
    trialToPaid: OwnerLoopKpiMetric;
    weeklyLoopCompletion: OwnerLoopKpiMetric;
  };
  meta: {
    uniqueUsers: number;
    eventRows: number;
    snapshotRows: number;
    updatedAt: string;
  };
};

function pct(numerator: number, denominator: number) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  const raw = (numerator / denominator) * 100;
  return Math.max(0, Math.min(100, Math.round(raw * 10) / 10));
}

function parseMs(v: string | null | undefined) {
  if (!v) return null;
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function dayKeyUTCFromIso(v: string | null | undefined) {
  if (!v) return null;
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return null;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseDayKeyMs(dayKey: string | null | undefined) {
  if (!dayKey) return null;
  const ms = new Date(`${dayKey}T00:00:00.000Z`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function addDays(dayKey: string, days: number) {
  const base = parseDayKeyMs(dayKey);
  if (base == null) return null;
  return dayKeyUTCFromIso(new Date(base + Math.round(days) * ONE_DAY_MS).toISOString());
}

function weekKeyUTC(dayKey: string) {
  const d = new Date(`${dayKey}T00:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) return null;
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const diff = d.getTime() - firstThursday.getTime();
  const week = 1 + Math.round(diff / (7 * ONE_DAY_MS));
  return `${d.getUTCFullYear()}-W${String(Math.max(1, week)).padStart(2, "0")}`;
}

function normalizeUserId(v: unknown) {
  return String(v || "").trim();
}

function eventFromRow(row: OwnerConversionEventRow) {
  const details = row?.details && typeof row.details === "object" ? row.details : {};
  const detailEvent = String((details as any)?.event || "")
    .toLowerCase()
    .trim();
  if (detailEvent) return detailEvent;
  const title = String(row?.title || "")
    .toLowerCase()
    .trim();
  if (title.startsWith("conversion:")) return title.replace("conversion:", "").trim();
  return "";
}

type ComputeArgs = {
  days: number;
  nowMs?: number;
  conversionEvents: OwnerConversionEventRow[];
  dailySnapshots: OwnerDailySnapshotRow[];
};

export function computeOwnerLoopKpis(args: ComputeArgs): OwnerLoopKpisPayload {
  const nowMs = Number.isFinite(Number(args.nowMs)) ? Number(args.nowMs) : Date.now();
  const eventRows = Array.isArray(args.conversionEvents) ? args.conversionEvents : [];
  const snapshotRows = Array.isArray(args.dailySnapshots) ? args.dailySnapshots : [];

  const users = new Set<string>();

  const firstEventAtByUser = new Map<string, number>();
  const trialStartAtByUser = new Map<string, number>();
  const paidAtByUser = new Map<string, number>();
  for (const row of eventRows) {
    const uid = normalizeUserId(row?.user_id);
    const atMs = parseMs(row?.created_at);
    if (!uid || atMs == null) continue;
    users.add(uid);
    const prev = firstEventAtByUser.get(uid);
    if (prev == null || atMs < prev) firstEventAtByUser.set(uid, atMs);

    const event = eventFromRow(row);
    if (event === "trial_started") {
      const prevTrial = trialStartAtByUser.get(uid);
      if (prevTrial == null || atMs < prevTrial) trialStartAtByUser.set(uid, atMs);
    } else if (event === "paid_activated") {
      const prevPaid = paidAtByUser.get(uid);
      if (prevPaid == null || atMs < prevPaid) paidAtByUser.set(uid, atMs);
    }
  }

  const firstSnapshotAtByUser = new Map<string, number>();
  const daySetByUser = new Map<string, Set<string>>();
  const firstDayByUser = new Map<string, string>();
  const weekDaysByUserWeek = new Map<string, Set<string>>();

  for (const row of snapshotRows) {
    const uid = normalizeUserId(row?.user_id);
    if (!uid) continue;
    users.add(uid);

    const atMs = parseMs(row?.created_at);
    if (atMs != null) {
      const prev = firstSnapshotAtByUser.get(uid);
      if (prev == null || atMs < prev) firstSnapshotAtByUser.set(uid, atMs);
    }

    const dayKey = String(row?.day_key || "").trim() || dayKeyUTCFromIso(row?.created_at || null) || "";
    if (!dayKey) continue;

    const userDays = daySetByUser.get(uid) || new Set<string>();
    userDays.add(dayKey);
    daySetByUser.set(uid, userDays);

    const firstDay = firstDayByUser.get(uid);
    if (!firstDay || dayKey < firstDay) firstDayByUser.set(uid, dayKey);

    const weekKey = weekKeyUTC(dayKey);
    if (weekKey) {
      const userWeekKey = `${uid}|${weekKey}`;
      const weekDays = weekDaysByUserWeek.get(userWeekKey) || new Set<string>();
      weekDays.add(dayKey);
      weekDaysByUserWeek.set(userWeekKey, weekDays);
    }
  }

  let activationDen = 0;
  let activationNum = 0;
  for (const [uid, firstEventAt] of firstEventAtByUser.entries()) {
    if (firstEventAt + ONE_DAY_MS > nowMs) continue; // exclude incomplete D1 windows
    activationDen += 1;
    const firstSnapAt = firstSnapshotAtByUser.get(uid);
    if (firstSnapAt != null && firstSnapAt >= firstEventAt && firstSnapAt <= firstEventAt + ONE_DAY_MS) {
      activationNum += 1;
    }
  }

  let retentionDen = 0;
  let retentionNum = 0;
  for (const [uid, firstDay] of firstDayByUser.entries()) {
    const firstDayMs = parseDayKeyMs(firstDay);
    if (firstDayMs == null) continue;
    if (firstDayMs + 7 * ONE_DAY_MS > nowMs) continue; // exclude incomplete D7 windows
    const d7 = addDays(firstDay, 7);
    retentionDen += 1;
    if (d7 && daySetByUser.get(uid)?.has(d7)) retentionNum += 1;
  }

  let trialPaidDen = 0;
  let trialPaidNum = 0;
  for (const [uid, trialAt] of trialStartAtByUser.entries()) {
    trialPaidDen += 1;
    const paidAt = paidAtByUser.get(uid);
    if (paidAt != null && paidAt >= trialAt) trialPaidNum += 1;
  }

  const weeklyDen = weekDaysByUserWeek.size;
  let weeklyNum = 0;
  for (const days of weekDaysByUserWeek.values()) {
    if (days.size >= 5) weeklyNum += 1;
  }

  const updatedAt = new Date(nowMs).toISOString();
  return {
    days: Math.max(1, Math.round(Number(args.days || 30))),
    kpis: {
      activationD1: {
        label: "Activation D1",
        rate: pct(activationNum, activationDen),
        numerator: activationNum,
        denominator: activationDen,
        definition: "Users with first daily close within 24h after first conversion event.",
      },
      retentionD7: {
        label: "Retention D7",
        rate: pct(retentionNum, retentionDen),
        numerator: retentionNum,
        denominator: retentionDen,
        definition: "Users with a closed loop again exactly on day 7 after first recorded close.",
      },
      trialToPaid: {
        label: "Trial -> Paid",
        rate: pct(trialPaidNum, trialPaidDen),
        numerator: trialPaidNum,
        denominator: trialPaidDen,
        definition: "Users with paid activation after trial start.",
      },
      weeklyLoopCompletion: {
        label: "Weekly Loop Completion",
        rate: pct(weeklyNum, weeklyDen),
        numerator: weeklyNum,
        denominator: weeklyDen,
        definition: "User-weeks with 5 or more closed daily loops.",
      },
    },
    meta: {
      uniqueUsers: users.size,
      eventRows: eventRows.length,
      snapshotRows: snapshotRows.length,
      updatedAt,
    },
  };
}
