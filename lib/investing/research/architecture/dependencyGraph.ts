import {
  MASTER_ARCHITECTURE_VERSION,
} from "./versions";
import type {
  ArchitectureComponent,
  ArchitecturePlane,
  ArchitectureStatus,
} from "./contexts";

export type ArchitectureReasonCode =
  | "research.architecture.contract_invalid"
  | "research.architecture.dependency_forbidden"
  | "research.architecture.cycle_detected"
  | "research.promotion.scope_mismatch"
  | "research.promotion.identity_mismatch"
  | "research.promotion.manifest_invalid"
  | "research.promotion.report_incomplete"
  | "research.promotion.decision_not_eligible"
  | "research.promotion.target_forbidden"
  | "research.promotion.integrity_blocked"
  | "research.promotion.contract_version_unsupported";

export type ArchitectureIssue = Readonly<{
  path: string;
  reasonCode: ArchitectureReasonCode;
}>;
export type ArchitectureValidationResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; issues: readonly ArchitectureIssue[] }>;

type UnknownRecord = Record<string, unknown>;
const ID = /^[a-z][a-z0-9-]{1,127}$/u;
const PLANES = new Set<ArchitecturePlane>([
  "neutral_contract", "control_plane", "scientific_core", "data_plane",
  "execution_plane", "persistence_plan", "promotion_plane", "observability",
]);
const STATUSES = new Set<ArchitectureStatus>([
  "implemented", "contracted", "planned", "forbidden",
]);
const KEYS = [
  "id", "contractVersion", "context", "responsibility", "trustZone", "plane",
  "dependencies", "writesAllowed", "writesForbidden", "consumes", "produces",
  "runtimeOwner", "status",
] as const;
const FINANCIAL_WRITES = new Set([
  "orders", "positions", "fills", "accounting", "accounting-writer",
]);

function plainRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}
function closed(value: unknown, keys: readonly string[]): value is UnknownRecord {
  if (!plainRecord(value)) return false;
  const allowed = new Set(keys);
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length) return false;
  return own.every((key) => {
    if (typeof key !== "string" || !allowed.has(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor?.enumerable === true
      && descriptor.get === undefined && descriptor.set === undefined;
  });
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512;
}
function stringArray(value: unknown): value is string[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
  const own = Reflect.ownKeys(value);
  if (own.some((key) => typeof key === "symbol"
    || (key !== "length" && !/^(0|[1-9]\d*)$/u.test(key)))) return false;
  if (Object.keys(value).length !== value.length) return false;
  return value.every(text) && new Set(value).size === value.length;
}
function parseComponent(
  value: unknown,
  path: string,
  issues: ArchitectureIssue[],
): ArchitectureComponent | null {
  if (!closed(value, KEYS)) {
    issues.push({ path, reasonCode: "research.architecture.contract_invalid" });
    return null;
  }
  if (!text(value.id) || !ID.test(value.id)
    || value.contractVersion !== MASTER_ARCHITECTURE_VERSION
    || !text(value.context) || !text(value.responsibility)
    || !text(value.trustZone) || !PLANES.has(value.plane as ArchitecturePlane)
    || !stringArray(value.dependencies) || !stringArray(value.writesAllowed)
    || !stringArray(value.writesForbidden) || !stringArray(value.consumes)
    || !stringArray(value.produces) || !text(value.runtimeOwner)
    || !STATUSES.has(value.status as ArchitectureStatus)) {
    issues.push({ path, reasonCode: "research.architecture.contract_invalid" });
    return null;
  }
  return {
    id: value.id,
    contractVersion: MASTER_ARCHITECTURE_VERSION,
    context: value.context,
    responsibility: value.responsibility,
    trustZone: value.trustZone,
    plane: value.plane as ArchitecturePlane,
    dependencies: [...value.dependencies],
    writesAllowed: [...value.writesAllowed],
    writesForbidden: [...value.writesForbidden],
    consumes: [...value.consumes],
    produces: [...value.produces],
    runtimeOwner: value.runtimeOwner,
    status: value.status as ArchitectureStatus,
  };
}
function research(component: ArchitectureComponent): boolean {
  return component.id === "research-runtime"
    || component.context.includes("research")
    || component.plane === "scientific_core";
}
function provider(component: ArchitectureComponent): boolean {
  return component.id.includes("provider") || component.plane === "data_plane";
}
function broker(component: ArchitectureComponent): boolean {
  return component.id.includes("broker") || component.context.includes("broker");
}

export function validateArchitectureGraph(
  input: unknown,
): ArchitectureValidationResult<readonly ArchitectureComponent[]> {
  const issues: ArchitectureIssue[] = [];
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) {
    return { ok: false, issues: [{ path: "components", reasonCode: "research.architecture.contract_invalid" }] };
  }
  const components = input.map((value, index) =>
    parseComponent(value, `components[${index}]`, issues));
  if (components.some((value) => value === null)) return { ok: false, issues };
  const parsed = components as ArchitectureComponent[];
  const byId = new Map<string, ArchitectureComponent>();
  for (const [index, component] of parsed.entries()) {
    if (byId.has(component.id)) issues.push({ path: `components[${index}].id`, reasonCode: "research.architecture.contract_invalid" });
    byId.set(component.id, component);
  }
  for (const [index, component] of parsed.entries()) {
    if (research(component) && component.writesAllowed.some((write) => FINANCIAL_WRITES.has(write))) {
      issues.push({ path: `components[${index}].writesAllowed`, reasonCode: "research.architecture.dependency_forbidden" });
    }
    if (component.plane === "observability"
      && component.writesAllowed.some((write) => write.includes("decision"))) {
      issues.push({ path: `components[${index}].writesAllowed`, reasonCode: "research.architecture.dependency_forbidden" });
    }
    if (provider(component)
      && component.writesAllowed.some((write) => write.includes("decision"))) {
      issues.push({ path: `components[${index}].writesAllowed`, reasonCode: "research.architecture.dependency_forbidden" });
    }
    for (const dependencyId of component.dependencies) {
      const dependency = byId.get(dependencyId);
      if (!dependency) {
        issues.push({ path: `components[${index}].dependencies`, reasonCode: "research.architecture.contract_invalid" });
        continue;
      }
      const forbidden = dependency.status === "forbidden"
        || dependency.id.includes("trading") || dependency.context.includes("trading")
        || (component.id === "research-runtime"
          && (dependency.id === "investing-engine" || broker(dependency)
            || (dependency.plane === "execution_plane"
              && dependency.id !== "research-runtime")))
        || (component.id === "data-acquisition-agent"
          && (dependency.id === "promotion-boundary"
            || dependency.id === "investing-engine" || broker(dependency)))
        || (component.plane === "control_plane" && provider(dependency))
        || (component.id === "promotion-boundary" && broker(dependency));
      if (forbidden) issues.push({ path: `components[${index}].dependencies`, reasonCode: "research.architecture.dependency_forbidden" });
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(id: string): boolean {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dependency of byId.get(id)?.dependencies ?? []) {
      if (visit(dependency)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  }
  for (const id of byId.keys()) {
    if (visit(id)) {
      issues.push({ path: "components", reasonCode: "research.architecture.cycle_detected" });
      break;
    }
  }
  // "Does not reach" policies are transitive. Promotion is the sole Engine edge.
  function reaches(start: string, predicate: (c: ArchitectureComponent) => boolean): boolean {
    const seen = new Set<string>();
    const pending = [...(byId.get(start)?.dependencies ?? [])];
    while (pending.length) {
      const id = pending.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const candidate = byId.get(id);
      if (!candidate) continue;
      if (predicate(candidate)) return true;
      pending.push(...candidate.dependencies);
    }
    return false;
  }
  for (const component of parsed) {
    if (component.id === "research-runtime"
      && (reaches(component.id, broker)
        || reaches(component.id, (candidate) =>
          candidate.id === "investing-engine"))) {
      issues.push({ path: "components.research-runtime.dependencies", reasonCode: "research.architecture.dependency_forbidden" });
    }
    if (component.id === "data-acquisition-agent"
      && reaches(component.id, (candidate) =>
        candidate.id === "promotion-boundary"
        || candidate.id === "investing-engine" || broker(candidate))) {
      issues.push({ path: "components.data-acquisition-agent.dependencies", reasonCode: "research.architecture.dependency_forbidden" });
    }
  }
  return issues.length
    ? { ok: false, issues }
    : { ok: true, value: parsed };
}
