import { ARCHITECTURE_FLOW_VERSION } from "./versions";

export type ArchitectureFlow = Readonly<{
  id: string; name: string; version: typeof ARCHITECTURE_FLOW_VERSION; trigger: string;
  steps: readonly Readonly<{ owner: string; action: string }>[];
  input: string; output: string; scope: "resolved_scientific_scope";
  preconditions: readonly string[]; failureStates: readonly string[];
  retryBoundary: string; idempotencyBoundary: string; futureTransactionBoundary: string;
  artifacts: readonly string[]; terminalState: string; forbiddenOperations: readonly string[];
}>;

const forbidden = ["orders", "positions", "fills", "accounting", "brokers", "trading"];
function flow(name: string, owners: readonly string[], terminalState: string): ArchitectureFlow {
  return { id: `flow-${name.replaceAll("_", "-")}`, name, version: ARCHITECTURE_FLOW_VERSION, trigger: `${name}_requested`, steps: owners.map((owner, i) => ({ owner, action: `${name}_step_${i + 1}` })), input: `${name}_input`, output: `${name}_output`, scope: "resolved_scientific_scope", preconditions: ["server_resolved_scope", "supported_contract_versions"], failureStates: ["blocked", "failed_visible"], retryBoundary: name === "operational_retry" ? "new_attempt_same_scientific_identity" : "operation", idempotencyBoundary: `${name}_identity`, futureTransactionBoundary: "single_owner_write", artifacts: [`${name}_evidence`], terminalState, forbiddenOperations: forbidden };
}

export const CANONICAL_FLOWS: readonly ArchitectureFlow[] = [
  flow("hypothesis_creation", ["product-control-plane", "scientific-contracts"], "hypothesis_active"),
  flow("dataset_request", ["research-runtime", "dataset-catalog"], "acquisition_requested"),
  flow("on_demand_acquisition", ["dataset-catalog", "data-acquisition-agent"], "dataset_acquired"),
  flow("research_ready_qualification", ["data-acquisition-agent", "dataset-catalog"], "research_ready"),
  flow("experiment_creation_or_reuse", ["research-runtime", "reproducibility"], "experiment_defined"),
  flow("run_attempt_creation", ["research-runtime"], "run_defined"),
  flow("scientific_execution", ["research-runtime"], "run_completed"),
  flow("artifact_persistence", ["research-runtime", "reproducibility"], "artifacts_complete"),
  flow("validation_report", ["research-runtime", "scientific-contracts"], "report_finalized"),
  flow("scientific_decision", ["research-runtime", "scientific-contracts"], "decision_finalized"),
  flow("promotion_eligibility", ["research-runtime", "scientific-contracts"], "promotion_eligible"),
  flow("promotion_request_preparation", ["promotion-boundary"], "promotion_prepared"),
  flow("scientific_rejection", ["research-runtime", "scientific-memory"], "rejected_recorded"),
  flow("operational_cancellation", ["research-runtime"], "cancelled"),
  flow("operational_retry", ["research-runtime"], "new_attempt"),
  flow("crash_recovery", ["research-runtime"], "recovered_or_blocked"),
  flow("future_dataset_invalidation", ["dataset-catalog"], "dataset_invalidated"),
  flow("future_strategy_degradation", ["scientific-memory", "promotion-boundary"], "promotion_revoked"),
  flow("ops_read_only_observation", ["ops-observability"], "observation_complete"),
];

function safeTree(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean"
    || (typeof value === "number" && Number.isFinite(value))) return true;
  if (typeof value !== "object" || seen.has(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== Array.prototype) return false;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === "symbol") return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || descriptor.get || descriptor.set
      || (key !== "length" && !descriptor.enumerable)) return false;
    if (key !== "length" && !safeTree(descriptor.value, seen)) return false;
  }
  seen.delete(value);
  return true;
}

export function validateArchitectureFlows(flows: unknown) {
  const issue = (path: string) => ({
    ok: false as const,
    issues: [{ path, reasonCode: "research.architecture.contract_invalid" as const }],
  });
  if (!Array.isArray(flows) || Object.getPrototypeOf(flows) !== Array.prototype) {
    return issue("flows");
  }
  if (!safeTree(flows)) return issue("flows");
  const keys = ["id", "name", "version", "trigger", "steps", "input", "output", "scope", "preconditions", "failureStates", "retryBoundary", "idempotencyBoundary", "futureTransactionBoundary", "artifacts", "terminalState", "forbiddenOperations"];
  const canonical = new Map(CANONICAL_FLOWS.map((value) => [value.id, value]));
  const rebuilt: ArchitectureFlow[] = [];
  for (const [index, candidate] of flows.entries()) {
    if (typeof candidate !== "object" || candidate === null
      || Array.isArray(candidate) || Object.getPrototypeOf(candidate) !== Object.prototype
      || Reflect.ownKeys(candidate).length !== keys.length
      || Reflect.ownKeys(candidate).some((key) => {
        if (typeof key !== "string" || !keys.includes(key)) return true;
        const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
        return descriptor?.enumerable !== true
          || descriptor.get !== undefined || descriptor.set !== undefined;
      })) return issue(`flows[${index}]`);
    const expected = canonical.get(candidate.id);
    if (!expected || candidate.version !== ARCHITECTURE_FLOW_VERSION) {
      return issue(`flows[${index}]`);
    }
    // Phase 6D freezes these declarations; accepting altered policy is fail-open.
    if (JSON.stringify(candidate) !== JSON.stringify(expected)) {
      return issue(`flows[${index}]`);
    }
    rebuilt.push(structuredClone(expected));
  }
  if (rebuilt.length !== CANONICAL_FLOWS.length
    || new Set(rebuilt.map(({ id }) => id)).size !== CANONICAL_FLOWS.length) {
    return issue("flows");
  }
  return { ok: true as const, value: rebuilt };
}
