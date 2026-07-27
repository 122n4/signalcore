import "server-only";

import { getRequestUserId } from "@/lib/auth/requestUser";
import {
  decideInvestingRolloutV1,
  INVESTING_ROLLOUT_ALLOWED_USER_IDS_ENV,
  INVESTING_ROLLOUT_MODE_ENV,
  parseInvestingRolloutConfigV1,
  type InvestingRolloutRawEnvironmentV1,
} from "@/lib/investing/rollout/policy.server";

export type InvestingRolloutGateOverridesV1 = Readonly<{
  readEnvironment?: () => InvestingRolloutRawEnvironmentV1;
  readUser?: () => Promise<string | null>;
}>;

export type InvestingRolloutGateResultV1 =
  | Readonly<{ allowed: false }>
  | Readonly<{ allowed: true; authenticatedUserId: string }>;

function readProcessEnvironment(): InvestingRolloutRawEnvironmentV1 {
  return {
    mode: process.env[INVESTING_ROLLOUT_MODE_ENV],
    allowedUserIds: process.env[INVESTING_ROLLOUT_ALLOWED_USER_IDS_ENV],
  };
}

export async function evaluateInvestingRolloutGateV1(
  overrides: InvestingRolloutGateOverridesV1 = {},
): Promise<InvestingRolloutGateResultV1> {
  try {
    const config = parseInvestingRolloutConfigV1(
      (overrides.readEnvironment ?? readProcessEnvironment)(),
    );
    const authenticatedUserId = await (overrides.readUser ?? getRequestUserId)();
    return decideInvestingRolloutV1(config, authenticatedUserId)
      ? { allowed: true, authenticatedUserId: authenticatedUserId! }
      : { allowed: false };
  } catch {
    return { allowed: false };
  }
}
