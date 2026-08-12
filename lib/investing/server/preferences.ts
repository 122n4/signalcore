import { getInvestingSupabaseAdmin } from "@/lib/investing/repository/admin";

type SupabaseLike = ReturnType<typeof getInvestingSupabaseAdmin>;

export type InvestingUiPreferencesV1 = {
  schemaVersion: 1;
  defaultScreen: "overview" | "portfolio" | "plan" | "insights" | null;
};

type PreferencesRow = {
  user_id?: unknown;
  investing_ui_state?: unknown;
  updated_at?: unknown;
};

export class InvestingPreferencesError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.name = "InvestingPreferencesError";
    this.code = code;
    this.status = status;
  }
}

const DEFAULT_PREFERENCES: InvestingUiPreferencesV1 = {
  schemaVersion: 1,
  defaultScreen: null,
};

const ALLOWED_SCREENS = new Set(["overview", "portfolio", "plan", "insights"]);
const ALLOWED_KEYS = new Set(["schemaVersion", "defaultScreen"]);
const REJECTED_KEYS = new Set([
  "userId",
  "user_id",
  "tenantId",
  "tenant_id",
  "accountId",
  "account_id",
  "portfolioId",
  "portfolio_id",
  "environment",
  "riskProfile",
  "risk_profile",
  "goal",
  "goalAmount",
  "goal_amount",
  "monthlyContribution",
  "monthly_contribution",
  "guardrails",
  "broker",
  "broker_connection",
  "plan",
  "plan_v1",
  "expectedReturn",
  "goalProbability",
  "execution",
  "permissions",
  "role",
  "hideStaleWarnings",
  "hideEstimatedLabels",
  "treatEstimatedAsReal",
  "hideUnavailable",
  "disableProvenance",
]);

function databaseOrDefault(database?: SupabaseLike) {
  return (database ?? getInvestingSupabaseAdmin()) as any;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function parsePreferences(value: unknown, strict: boolean): InvestingUiPreferencesV1 {
  if (!isPlainRecord(value)) {
    if (strict) throw new InvestingPreferencesError("investing_preferences_invalid", 400);
    return { ...DEFAULT_PREFERENCES };
  }
  const keys = Object.keys(value);
  if (keys.some((key) => REJECTED_KEYS.has(key) || !ALLOWED_KEYS.has(key))) {
    if (strict) throw new InvestingPreferencesError("investing_preferences_invalid", 400);
    return { ...DEFAULT_PREFERENCES };
  }
  if (value.schemaVersion !== 1) {
    if (strict) throw new InvestingPreferencesError("investing_preferences_invalid", 400);
    return { ...DEFAULT_PREFERENCES };
  }
  if (value.defaultScreen !== null && (typeof value.defaultScreen !== "string" || !ALLOWED_SCREENS.has(value.defaultScreen))) {
    if (strict) throw new InvestingPreferencesError("investing_preferences_invalid", 400);
    return { ...DEFAULT_PREFERENCES };
  }
  return {
    schemaVersion: 1,
    defaultScreen: value.defaultScreen as InvestingUiPreferencesV1["defaultScreen"],
  };
}

export function validateInvestingUiPreferencesInput(value: unknown): InvestingUiPreferencesV1 {
  return parsePreferences(value, true);
}

export async function readInvestingUiPreferences(args: {
  userId: string;
  database?: SupabaseLike;
}): Promise<{ preferences: InvestingUiPreferencesV1; updatedAt: string | null }> {
  const database = databaseOrDefault(args.database);
  const result = await database
    .from("user_settings")
    .select("user_id,investing_ui_state,updated_at")
    .eq("user_id", args.userId)
    .limit(1);

  if (result.error) throw new InvestingPreferencesError("investing_preferences_unavailable", 503);
  const rows = Array.isArray(result.data) ? result.data : [];
  if (rows.length === 0) return { preferences: { ...DEFAULT_PREFERENCES }, updatedAt: null };

  const row = rows[0] as PreferencesRow;
  if (row.user_id !== args.userId) throw new InvestingPreferencesError("investing_preferences_identity_mismatch", 503);
  return {
    preferences: parsePreferences(row.investing_ui_state, false),
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

export async function writeInvestingUiPreferences(args: {
  userId: string;
  preferences: InvestingUiPreferencesV1;
  database?: SupabaseLike;
  now?: string;
}): Promise<{ preferences: InvestingUiPreferencesV1; updatedAt: string | null }> {
  const database = databaseOrDefault(args.database);
  const updatedAt = args.now ?? new Date().toISOString();
  const result = await database
    .from("user_settings")
    .upsert(
      {
        user_id: args.userId,
        investing_ui_state: args.preferences,
        updated_at: updatedAt,
      },
      { onConflict: "user_id" },
    )
    .select("user_id,investing_ui_state,updated_at")
    .limit(1);

  if (result.error) throw new InvestingPreferencesError("investing_preferences_unavailable", 503);
  const row = Array.isArray(result.data) ? result.data[0] as PreferencesRow | undefined : null;
  if (!row || row.user_id !== args.userId) throw new InvestingPreferencesError("investing_preferences_identity_mismatch", 503);
  return {
    preferences: parsePreferences(row.investing_ui_state, false),
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : updatedAt,
  };
}
