import { randomUUID } from "node:crypto";

import { toMoney } from "@/lib/investing/money/decimal";
import { getInvestingSupabaseAdmin } from "@/lib/investing/repository/admin";
import { readInvestingPaperConfig } from "@/lib/investing/server/config";

export const INVESTING_CORPORATE_ACTION_MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const ISO_WITH_EXPLICIT_ZONE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/;

function resultOrThrow(result: { data?: unknown; error?: { message?: string } | null }, fallback: string) {
  if (result.error) throw new Error(String(result.error.message || fallback).split("\n", 1)[0]);
  return result.data;
}

export function validateInvestingCorporateActionEffectiveAt(value: unknown, nowMs = Date.now()) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { ok: false as const, error: "investing_corporate_action_effective_at_required" };
  }
  const raw = value.trim();
  const match = ISO_WITH_EXPLICIT_ZONE.exec(raw);
  if (!match) {
    return { ok: false as const, error: "investing_corporate_action_effective_at_invalid" };
  }
  const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw, secondRaw, , zoneRaw] = match;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  const second = Number(secondRaw);
  const offsetHour = zoneRaw === "Z" ? 0 : Number(zoneRaw.slice(1, 3));
  const offsetMinute = zoneRaw === "Z" ? 0 : Number(zoneRaw.slice(4, 6));
  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
  if (
    month < 1 || month > 12
    || day < 1 || day > daysInMonth
    || hour > 23
    || minute > 59
    || second > 59
    || offsetHour > 23
    || offsetMinute > 59
  ) {
    return { ok: false as const, error: "investing_corporate_action_effective_at_invalid" };
  }
  const parsedMs = Date.parse(raw);
  if (!Number.isFinite(parsedMs)) {
    return { ok: false as const, error: "investing_corporate_action_effective_at_invalid" };
  }
  if (parsedMs > nowMs + INVESTING_CORPORATE_ACTION_MAX_FUTURE_SKEW_MS) {
    return { ok: false as const, error: "investing_corporate_action_effective_at_future" };
  }
  return { ok: true as const, effectiveAt: new Date(parsedMs).toISOString() };
}

export async function recordPersistentPaperCashMovement(args: {
  userId: string;
  accountId: string;
  action: "deposit" | "withdrawal" | "dividend";
  amount: string;
  currency: string;
  symbol?: string | null;
  clientRequestId: string;
}) {
  readInvestingPaperConfig();
  const database = getInvestingSupabaseAdmin() as any;
  return resultOrThrow(await database.rpc("investing_record_cash_movement_v2", {
    p_actor_user_id: args.userId,
    p_account_id: args.accountId,
    p_movement_type: args.action,
    p_amount: toMoney(args.amount, 8),
    p_currency: args.currency.toUpperCase(),
    p_symbol: args.symbol?.trim().toUpperCase() || null,
    p_idempotency_key: args.clientRequestId,
    p_correlation_id: `investing_cash_${randomUUID()}`,
  }), "investing_cash_movement_failed");
}

export async function reversePersistentPaperCashMovement(args: {
  userId: string;
  accountId: string;
  movementId: string;
  clientRequestId: string;
  reason: string;
}) {
  readInvestingPaperConfig();
  const database = getInvestingSupabaseAdmin() as any;
  return resultOrThrow(await database.rpc("investing_reverse_cash_movement_v2", {
    p_actor_user_id: args.userId,
    p_account_id: args.accountId,
    p_original_movement_id: args.movementId,
    p_idempotency_key: args.clientRequestId,
    p_correlation_id: `investing_reversal_${randomUUID()}`,
    p_reason: args.reason,
  }), "investing_cash_reversal_failed");
}

export async function applyPersistentPaperSplit(args: {
  userId: string;
  accountId: string;
  symbol: string;
  ratio: string;
  action: "split" | "reverse_split";
  clientRequestId: string;
  effectiveAt: string;
}) {
  readInvestingPaperConfig();
  const effectiveAt = validateInvestingCorporateActionEffectiveAt(args.effectiveAt);
  if (!effectiveAt.ok) throw new Error(effectiveAt.error);
  const database = getInvestingSupabaseAdmin() as any;
  return resultOrThrow(await database.rpc("investing_apply_split_v2", {
    p_actor_user_id: args.userId,
    p_account_id: args.accountId,
    p_symbol: args.symbol.trim().toUpperCase(),
    p_ratio: toMoney(args.ratio, 12),
    p_action_type: args.action,
    p_idempotency_key: args.clientRequestId,
    p_correlation_id: `investing_corporate_action_${randomUUID()}`,
    p_effective_at: effectiveAt.effectiveAt,
  }), "investing_corporate_action_failed");
}
