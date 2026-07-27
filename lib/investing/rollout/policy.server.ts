import "server-only";

export const INVESTING_ROLLOUT_MODE_ENV = "INVESTING_ROLLOUT_MODE";
export const INVESTING_ROLLOUT_ALLOWED_USER_IDS_ENV =
  "INVESTING_ROLLOUT_ALLOWED_USER_IDS";

export type InvestingRolloutModeV1 = "off" | "allowlist" | "on";

export type InvestingRolloutConfigV1 = Readonly<{
  mode: InvestingRolloutModeV1;
  allowedUserIds: ReadonlySet<string>;
}>;

export type InvestingRolloutRawEnvironmentV1 = Readonly<{
  mode: unknown;
  allowedUserIds: unknown;
}>;

const CLERK_USER_ID = /^user_[A-Za-z0-9_-]{1,128}$/u;
const VALID_MODES = new Set<InvestingRolloutModeV1>([
  "off",
  "allowlist",
  "on",
]);
const OFF_CONFIG: InvestingRolloutConfigV1 = Object.freeze({
  mode: "off",
  allowedUserIds: new Set<string>(),
});

export function parseInvestingRolloutConfigV1(
  raw: InvestingRolloutRawEnvironmentV1,
): InvestingRolloutConfigV1 {
  if (
    typeof raw.mode !== "string"
    || !VALID_MODES.has(raw.mode as InvestingRolloutModeV1)
    || (raw.allowedUserIds !== undefined && typeof raw.allowedUserIds !== "string")
  ) {
    return OFF_CONFIG;
  }

  const mode = raw.mode as InvestingRolloutModeV1;
  const allowedUserIds = typeof raw.allowedUserIds === "string"
    ? raw.allowedUserIds
    : "";
  const entries = allowedUserIds
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (entries.some((entry) => entry === "*" || !CLERK_USER_ID.test(entry))) {
    return OFF_CONFIG;
  }

  return Object.freeze({
    mode,
    allowedUserIds: new Set(entries),
  });
}

export function decideInvestingRolloutV1(
  config: InvestingRolloutConfigV1,
  authenticatedUserId: string | null,
): boolean {
  if (!authenticatedUserId || !CLERK_USER_ID.test(authenticatedUserId)) {
    return false;
  }
  if (config.mode === "on") return true;
  return config.mode === "allowlist"
    && config.allowedUserIds.has(authenticatedUserId);
}
