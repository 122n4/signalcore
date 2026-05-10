import type { DecisionEnvelope } from "../types";

export type LegacyDailyBundleResponseLike = {
  daily: Record<string, unknown>;
  [key: string]: unknown;
};

export function attachDecisionEnvelopeToDailyBundle<T extends LegacyDailyBundleResponseLike>(args: {
  response: T;
  envelope: DecisionEnvelope;
}): T & {
  daily: T["daily"] & {
    decisionEnvelope: DecisionEnvelope;
  };
} {
  return {
    ...args.response,
    daily: {
      ...args.response.daily,
      decisionEnvelope: args.envelope,
    },
  };
}
