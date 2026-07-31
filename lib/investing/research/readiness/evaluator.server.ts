import "server-only";

import { createHash } from "node:crypto";

import { canonicalizeResearchContract } from "../contracts";
import {
  BETA_READINESS_GATE_IDS,
  BETA_READINESS_MANIFEST_VERSION,
  BETA_READINESS_REPORT_VERSION,
  type BetaReadinessEvidence,
  type BetaReadinessGateId,
  type BetaReadinessGateResult,
  type BetaReadinessManifest,
  type BetaReadinessReason,
  type BetaReadinessResult,
} from "./types";

const SHA = /^[a-f0-9]{40,64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,511}$/u;
const GATES = new Set<string>(BETA_READINESS_GATE_IDS);

function plain(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  if (Object.getPrototypeOf(value) !== Object.prototype) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(value).every((key) =>
    typeof key === "string"
    && descriptors[key]?.enumerable === true
    && descriptors[key]?.get === undefined
    && descriptors[key]?.set === undefined);
}

function exact(value: Record<string, unknown>, keys: readonly string[]) {
  return Reflect.ownKeys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function instant(value: unknown): value is string {
  return typeof value === "string"
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function evidence(value: unknown): value is BetaReadinessEvidence {
  return plain(value)
    && exact(value, ["gateId", "state", "checkpoint", "observedAt", "validUntil", "reference"])
    && typeof value.gateId === "string"
    && GATES.has(value.gateId)
    && ["passed", "failed", "unavailable"].includes(String(value.state))
    && typeof value.checkpoint === "string"
    && SHA.test(value.checkpoint)
    && instant(value.observedAt)
    && instant(value.validUntil)
    && Date.parse(value.observedAt) <= Date.parse(value.validUntil)
    && typeof value.reference === "string"
    && REFERENCE.test(value.reference);
}

function parseManifest(value: unknown): BetaReadinessManifest | null {
  if (!plain(value)
    || !exact(value, ["contractVersion", "checkpoint", "evaluatedAt", "profile", "evidence"])
    || value.contractVersion !== BETA_READINESS_MANIFEST_VERSION
    || typeof value.checkpoint !== "string"
    || !SHA.test(value.checkpoint)
    || !instant(value.evaluatedAt)
    || !plain(value.profile)
    || !exact(value.profile, ["id", "version"])
    || typeof value.profile.id !== "string"
    || !ID.test(value.profile.id)
    || typeof value.profile.version !== "string"
    || !ID.test(value.profile.version)
    || !Array.isArray(value.evidence)
    || value.evidence.length !== BETA_READINESS_GATE_IDS.length
    || !value.evidence.every(evidence)) return null;

  const gateIds = value.evidence.map((item) => item.gateId);
  if (new Set(gateIds).size !== BETA_READINESS_GATE_IDS.length
    || BETA_READINESS_GATE_IDS.some((gateId) => !gateIds.includes(gateId))) return null;

  return structuredClone(value) as BetaReadinessManifest;
}

function blockReason(
  item: BetaReadinessEvidence,
  manifest: BetaReadinessManifest,
): BetaReadinessReason | null {
  if (item.checkpoint !== manifest.checkpoint) return "evidence_checkpoint_mismatch";
  if (Date.parse(item.validUntil) < Date.parse(manifest.evaluatedAt)) return "evidence_stale";
  if (item.state === "unavailable") return "evidence_unavailable";
  if (item.state === "failed") return "evidence_failed";
  return null;
}

function gateResult(
  gateId: BetaReadinessGateId,
  manifest: BetaReadinessManifest,
): BetaReadinessGateResult {
  const item = manifest.evidence.find((candidate) => candidate.gateId === gateId)!;
  const reason = blockReason(item, manifest);
  return {
    gateId,
    state: reason === null ? "passed" : "blocked",
    reason,
    reference: item.reference,
  };
}

export function evaluateBetaReadiness(value: unknown): BetaReadinessResult {
  try {
    const manifest = parseManifest(value);
    if (manifest === null) return { ok: false, reason: "beta_readiness_manifest_invalid" };
    const gates = BETA_READINESS_GATE_IDS.map((gateId) => gateResult(gateId, manifest));
    const material = {
      contractVersion: BETA_READINESS_REPORT_VERSION,
      checkpoint: manifest.checkpoint,
      evaluatedAt: manifest.evaluatedAt,
      profile: manifest.profile,
      state: gates.every((gate) => gate.state === "passed") ? "beta_ready" : "blocked",
      gates,
    } as const;
    const canonical = canonicalizeResearchContract(material);
    if (!canonical.ok) return { ok: false, reason: "beta_readiness_manifest_invalid" };
    const reportHash = createHash("sha256")
      .update(`investing-beta-readiness-report/v1\n${canonical.value}`, "utf8")
      .digest("hex");
    return { ok: true, value: { ...material, reportHash } };
  } catch {
    return { ok: false, reason: "beta_readiness_manifest_invalid" };
  }
}
