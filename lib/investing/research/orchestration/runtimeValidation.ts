import type { OrchestrationRetryPolicy } from "./types";
import { ORCHESTRATION_RETRY_POLICY_VERSION } from "./versions";

export function validateRetryPolicy(input: unknown):
  | Readonly<{ ok: true; value: OrchestrationRetryPolicy }>
  | Readonly<{ ok: false; reason: "orchestration_policy_invalid" }> {
  if (typeof input !== "object" || input === null || Array.isArray(input)
    || Object.getPrototypeOf(input) !== Object.prototype
    || Reflect.ownKeys(input).some((key) => typeof key !== "string")
    || Object.values(Object.getOwnPropertyDescriptors(input))
      .some((descriptor) => descriptor.get !== undefined || descriptor.set !== undefined
        || descriptor.enumerable !== true)
    || Reflect.ownKeys(input).length !== 6) return { ok: false, reason: "orchestration_policy_invalid" };
  const value = input as Record<string, unknown>;
  const keys = ["contractVersion","maximumAttempts","leaseSeconds","heartbeatSeconds",
    "executionTimeoutSeconds","backoffSeconds"];
  if (!keys.every((key) => Object.prototype.propertyIsEnumerable.call(value, key))
    || value.contractVersion !== ORCHESTRATION_RETRY_POLICY_VERSION
    || !Number.isInteger(value.maximumAttempts) || Number(value.maximumAttempts) < 1 || Number(value.maximumAttempts) > 10
    || !Number.isInteger(value.leaseSeconds) || Number(value.leaseSeconds) < 15 || Number(value.leaseSeconds) > 900
    || !Number.isInteger(value.heartbeatSeconds) || Number(value.heartbeatSeconds) < 5
    || Number(value.heartbeatSeconds) * 2 >= Number(value.leaseSeconds)
    || !Number.isInteger(value.executionTimeoutSeconds)
    || Number(value.executionTimeoutSeconds) < 15
    || Number(value.executionTimeoutSeconds) > 3600
    || Number(value.executionTimeoutSeconds) <= Number(value.heartbeatSeconds)
    || !Array.isArray(value.backoffSeconds) || value.backoffSeconds.length !== Number(value.maximumAttempts) - 1
    || !value.backoffSeconds.every((item, index, all) =>
      Number.isInteger(item) && item >= 0 && item <= 3600 && (index === 0 || item >= all[index - 1]))) {
    return { ok: false, reason: "orchestration_policy_invalid" };
  }
  return { ok: true, value: structuredClone(value) as OrchestrationRetryPolicy };
}
