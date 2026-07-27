import "server-only";

import type { RuntimeValidationResult } from "../contracts/primitives";
import type {
  ReproducibleExecutionIdentity,
  ReproducibleExecutionIdentityMaterial,
} from "./materials";
import { hashCanonicalResearchMaterial } from "./hashing.server";
import {
  validateReproducibleExecutionIdentityEnvelope,
  validateReproducibleExecutionIdentityMaterial,
} from "./runtimeValidation";
import {
  EXECUTION_IDENTITY_DOMAIN,
  REPRODUCIBLE_EXECUTION_IDENTITY_VERSION,
} from "./versions";

export function deriveReproducibleExecutionIdentity(
  material: unknown,
): RuntimeValidationResult<ReproducibleExecutionIdentity> {
  const validated = validateReproducibleExecutionIdentityMaterial(material);
  if ("issues" in validated) return { ok: false, issues: validated.issues };
  const hashed = hashCanonicalResearchMaterial(
    EXECUTION_IDENTITY_DOMAIN,
    validated.value,
  );
  if ("issues" in hashed) return { ok: false, issues: hashed.issues };
  return {
    ok: true,
    value: {
      contractVersion: REPRODUCIBLE_EXECUTION_IDENTITY_VERSION,
      ...hashed.value,
      executionId: `irexec_v1_${hashed.value.digest}`,
    },
  };
}

export function validateReproducibleExecutionIdentityIntegrity(
  value: unknown,
): RuntimeValidationResult<{
  identity: ReproducibleExecutionIdentity;
  material: ReproducibleExecutionIdentityMaterial;
}> {
  const envelope = validateReproducibleExecutionIdentityEnvelope(value);
  if ("issues" in envelope) return { ok: false, issues: envelope.issues };
  let parsed: unknown;
  try {
    parsed = JSON.parse(envelope.value.canonicalMaterial);
  } catch {
    return {
      ok: false,
      issues: [{
        path: "execution.canonicalMaterial",
        reasonCode: "research.contract.canonical_value_invalid",
      }],
    };
  }
  const material = validateReproducibleExecutionIdentityMaterial(parsed);
  if ("issues" in material) return { ok: false, issues: material.issues };
  const derived = deriveReproducibleExecutionIdentity(material.value);
  if (
    !derived.ok
    || derived.value.digest !== envelope.value.digest
    || derived.value.executionId !== envelope.value.executionId
    || derived.value.canonicalMaterial !== envelope.value.canonicalMaterial
  ) {
    return {
      ok: false,
      issues: [{
        path: "execution",
        reasonCode: "research.integrity.reference_mismatch",
      }],
    };
  }
  return {
    ok: true,
    value: { identity: envelope.value, material: material.value },
  };
}

export function reproducibleExecutionMaterialFromValidated(
  material: ReproducibleExecutionIdentityMaterial,
): ReproducibleExecutionIdentityMaterial {
  return structuredClone(material);
}
