// lib/signalcore/engine/confirmedMoney.ts
import type { MoneyConfirmed } from "./types";

export function computeConfirmedMoney(args: {
  rows?: Array<{ day_key: string; total_eur: number }>;
}): MoneyConfirmed {
  const rows = Array.isArray(args.rows) ? args.rows : [];
  if (!rows.length) return { today: 0, week: 0, total: 0 };

  // rows are desc (today first)
  const today = Number(rows[0]?.total_eur) || 0;
  const yesterday = Number(rows[1]?.total_eur) || today;

  const todayDiff = Math.round(today - yesterday);

  // week: nearest ~7 days back
  const weekRow = rows.length >= 8 ? rows[7] : rows[rows.length - 1];
  const weekTotal = Number(weekRow?.total_eur) || today;

  const weekDiff = Math.round(today - weekTotal);

  // total: first ever snapshot
  const last = rows[rows.length - 1];
  const firstTotal = Number(last?.total_eur) || today;
  const totalDiff = Math.round(today - firstTotal);

  return {
    today: todayDiff,
    week: weekDiff,
    total: totalDiff,
  };
}