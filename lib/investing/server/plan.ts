import { getInvestingSupabaseAdmin } from "@/lib/investing/repository/admin";

type SupabaseLike = ReturnType<typeof getInvestingSupabaseAdmin>;

export type PlanAvailability = "AVAILABLE" | "UNAVAILABLE";

export type CanonicalInvestingPlan = {
  id: string;
  mode: "investing";
  status: "active";
  version: number;
  label: string | null;
  intent: string | null;
  summary: string | null;
  structured: {
    availability: PlanAvailability;
    schemaVersion: number | null;
    reason: string | null;
    objective?: {
      type?: string;
      targetAmount?: { amount: number; currency: string };
      timeframeMonths?: number;
      monthlyContribution?: { amount: number; currency: string };
    };
    risk?: { profile?: "Conservative" | "Balanced" | "Aggressive" };
    guardrails?: { maxSinglePositionPct?: number; maxTop5Pct?: number };
  };
  activatedAt: string | null;
  updatedAt: string;
};

export type CanonicalInvestingPlanState = {
  availability: PlanAvailability;
  reason: string | null;
  value: CanonicalInvestingPlan | null;
};

export type CanonicalInvestingPlanReadResult = {
  state: CanonicalInvestingPlanState;
  status: number;
  error: string | null;
};

type PlanRow = {
  id?: unknown;
  user_id?: unknown;
  mode?: unknown;
  status?: unknown;
  is_active?: unknown;
  version?: unknown;
  label?: unknown;
  intent?: unknown;
  goal?: unknown;
  payload?: unknown;
  activated_at?: unknown;
  updated_at?: unknown;
  created_at?: unknown;
  archived_at?: unknown;
};

const FORBIDDEN_PAYLOAD_KEYS = new Set([
  "expectedReturn",
  "expected_return",
  "annualReturn",
  "returnAssumption",
  "return_assumption",
  "projectedReturn",
  "projectedValue",
  "goalProbability",
  "goal_probability",
  "successProbability",
  "performance",
  "alpha",
  "guaranteedReturn",
]);

const TOP_LEVEL_KEYS = new Set(["schemaVersion", "objective", "risk", "guardrails"]);
const OBJECTIVE_KEYS = new Set(["type", "targetAmount", "timeframeMonths", "monthlyContribution"]);
const AMOUNT_KEYS = new Set(["amount", "currency"]);
const RISK_KEYS = new Set(["profile"]);
const GUARDRAIL_KEYS = new Set(["maxSinglePositionPct", "maxTop5Pct"]);
const RISK_PROFILES = new Set(["Conservative", "Balanced", "Aggressive"]);
const CURRENCY = /^[A-Z]{3}$/;

function databaseOrDefault(database?: SupabaseLike) {
  return (database ?? getInvestingSupabaseAdmin()) as any;
}

function unavailable(reason: string, status = 200): CanonicalInvestingPlanReadResult {
  return {
    state: { availability: "UNAVAILABLE", reason, value: null },
    status,
    error: status >= 400 ? reason : null,
  };
}

function available(value: CanonicalInvestingPlan): CanonicalInvestingPlanReadResult {
  return {
    state: { availability: "AVAILABLE", reason: null, value },
    status: 200,
    error: null,
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function positiveInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function parseIsoString(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? value : null;
}

function optionalText(value: unknown, maxLength: number) {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > maxLength) return null;
  return text;
}

function hasForbiddenPayloadKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasForbiddenPayloadKey);
  if (!isPlainRecord(value)) return false;
  return Object.entries(value).some(([key, nested]) => FORBIDDEN_PAYLOAD_KEYS.has(key) || hasForbiddenPayloadKey(nested));
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>) {
  return Object.keys(value).every((key) => allowed.has(key));
}

function amountObject(value: unknown, allowZero: boolean) {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, AMOUNT_KEYS)) return null;
  const amount = finiteNumber(value.amount);
  const currency = typeof value.currency === "string" && CURRENCY.test(value.currency) ? value.currency : null;
  if (amount === null || !currency) return null;
  if (allowZero ? amount < 0 : amount <= 0) return null;
  return { amount, currency };
}

function parseStructuredPayload(payload: unknown): CanonicalInvestingPlan["structured"] {
  const value = payload == null ? {} : payload;
  if (!isPlainRecord(value)) return { availability: "UNAVAILABLE", schemaVersion: null, reason: "structured_plan_invalid" };
  if (hasForbiddenPayloadKey(value)) {
    return { availability: "UNAVAILABLE", schemaVersion: null, reason: "forbidden_modelling_field" };
  }
  if (Object.keys(value).length === 0) {
    return { availability: "UNAVAILABLE", schemaVersion: null, reason: "structured_plan_missing" };
  }
  if (!hasOnlyKeys(value, TOP_LEVEL_KEYS) || value.schemaVersion !== 1) {
    return { availability: "UNAVAILABLE", schemaVersion: null, reason: "structured_plan_invalid" };
  }

  const structured: CanonicalInvestingPlan["structured"] = {
    availability: "AVAILABLE",
    schemaVersion: 1,
    reason: null,
  };

  if (value.objective !== undefined) {
    if (!isPlainRecord(value.objective) || !hasOnlyKeys(value.objective, OBJECTIVE_KEYS)) {
      return { availability: "UNAVAILABLE", schemaVersion: 1, reason: "structured_plan_invalid" };
    }
    const objective: NonNullable<CanonicalInvestingPlan["structured"]["objective"]> = {};
    if (value.objective.type !== undefined) {
      const type = optionalText(value.objective.type, 80);
      if (!type) return { availability: "UNAVAILABLE", schemaVersion: 1, reason: "structured_plan_invalid" };
      objective.type = type;
    }
    if (value.objective.targetAmount !== undefined) {
      const targetAmount = amountObject(value.objective.targetAmount, false);
      if (!targetAmount) return { availability: "UNAVAILABLE", schemaVersion: 1, reason: "structured_plan_invalid" };
      objective.targetAmount = targetAmount;
    }
    if (value.objective.timeframeMonths !== undefined) {
      const timeframeMonths = positiveInteger(value.objective.timeframeMonths);
      if (!timeframeMonths) return { availability: "UNAVAILABLE", schemaVersion: 1, reason: "structured_plan_invalid" };
      objective.timeframeMonths = timeframeMonths;
    }
    if (value.objective.monthlyContribution !== undefined) {
      const monthlyContribution = amountObject(value.objective.monthlyContribution, true);
      if (!monthlyContribution) return { availability: "UNAVAILABLE", schemaVersion: 1, reason: "structured_plan_invalid" };
      objective.monthlyContribution = monthlyContribution;
    }
    if (Object.keys(objective).length > 0) structured.objective = objective;
  }

  if (value.risk !== undefined) {
    if (!isPlainRecord(value.risk) || !hasOnlyKeys(value.risk, RISK_KEYS)) {
      return { availability: "UNAVAILABLE", schemaVersion: 1, reason: "structured_plan_invalid" };
    }
    if (value.risk.profile !== undefined) {
      if (typeof value.risk.profile !== "string" || !RISK_PROFILES.has(value.risk.profile)) {
        return { availability: "UNAVAILABLE", schemaVersion: 1, reason: "structured_plan_invalid" };
      }
      structured.risk = { profile: value.risk.profile as "Conservative" | "Balanced" | "Aggressive" };
    }
  }

  if (value.guardrails !== undefined) {
    if (!isPlainRecord(value.guardrails) || !hasOnlyKeys(value.guardrails, GUARDRAIL_KEYS)) {
      return { availability: "UNAVAILABLE", schemaVersion: 1, reason: "structured_plan_invalid" };
    }
    const guardrails: NonNullable<CanonicalInvestingPlan["structured"]["guardrails"]> = {};
    if (value.guardrails.maxSinglePositionPct !== undefined) {
      const maxSingle = finiteNumber(value.guardrails.maxSinglePositionPct);
      if (maxSingle === null || maxSingle < 0 || maxSingle > 100) {
        return { availability: "UNAVAILABLE", schemaVersion: 1, reason: "structured_plan_invalid" };
      }
      guardrails.maxSinglePositionPct = maxSingle;
    }
    if (value.guardrails.maxTop5Pct !== undefined) {
      const maxTop5 = finiteNumber(value.guardrails.maxTop5Pct);
      if (maxTop5 === null || maxTop5 < 0 || maxTop5 > 100) {
        return { availability: "UNAVAILABLE", schemaVersion: 1, reason: "structured_plan_invalid" };
      }
      guardrails.maxTop5Pct = maxTop5;
    }
    if (
      guardrails.maxSinglePositionPct !== undefined
      && guardrails.maxTop5Pct !== undefined
      && guardrails.maxSinglePositionPct > guardrails.maxTop5Pct
    ) {
      return { availability: "UNAVAILABLE", schemaVersion: 1, reason: "structured_plan_invalid" };
    }
    if (Object.keys(guardrails).length > 0) structured.guardrails = guardrails;
  }

  if (!structured.objective && !structured.risk && !structured.guardrails) {
    return { availability: "UNAVAILABLE", schemaVersion: 1, reason: "structured_plan_missing" };
  }
  return structured;
}

function projectPlan(row: PlanRow, userId: string): CanonicalInvestingPlanReadResult {
  const id = optionalText(row.id, 128);
  const version = positiveInteger(row.version);
  const updatedAt = parseIsoString(row.updated_at);
  const activatedAt = row.activated_at == null ? null : parseIsoString(row.activated_at);
  const createdAt = parseIsoString(row.created_at);
  const archivedAt = row.archived_at == null ? null : parseIsoString(row.archived_at);

  if (!id) return unavailable("investing_plan_invalid", 503);
  if (row.user_id !== userId) return unavailable("investing_plan_identity_mismatch", 503);
  if (row.mode !== "investing" || row.status !== "active" || row.is_active !== true) {
    return unavailable("investing_plan_not_canonical_active", 503);
  }
  if (!version || !updatedAt || !createdAt || (row.activated_at != null && !activatedAt) || (row.archived_at != null && !archivedAt)) {
    return unavailable("investing_plan_invalid", 503);
  }
  if (row.payload != null && !isPlainRecord(row.payload)) {
    return unavailable("investing_plan_invalid", 503);
  }

  return available({
    id,
    mode: "investing",
    status: "active",
    version,
    label: optionalText(row.label, 160),
    intent: optionalText(row.intent, 240),
    summary: optionalText(row.goal, 1000),
    structured: parseStructuredPayload(row.payload),
    activatedAt,
    updatedAt,
  });
}

export async function readCanonicalInvestingPlanForUser(args: {
  userId: string;
  database?: SupabaseLike;
}): Promise<CanonicalInvestingPlanReadResult> {
  const database = databaseOrDefault(args.database);
  const result = await database
    .from("plans")
    .select("id,user_id,mode,status,is_active,version,label,intent,goal,payload,activated_at,updated_at,created_at,archived_at")
    .eq("user_id", args.userId)
    .eq("mode", "investing")
    .eq("status", "active")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(2);

  if (result.error) return unavailable("investing_plan_read_failed", 503);

  const rows = Array.isArray(result.data) ? result.data : [];
  if (rows.length === 0) return unavailable("plan_missing");
  if (rows.length > 1) return unavailable("investing_plan_ambiguous", 409);
  return projectPlan(rows[0] as PlanRow, args.userId);
}
