import "server-only";

import type { RuntimeValidationResult } from "../contracts/primitives";
import type { ExperimentIdentityMaterial } from "../contracts/experiments";
import type { ScientificExperimentIdentity } from "./materials";
import { hashCanonicalResearchMaterial } from "./hashing.server";
import {
  validateScientificExperimentIdentityEnvelope,
  validateScientificIdentityInput,
} from "./runtimeValidation";
import {
  SCIENTIFIC_IDENTITY_DOMAIN,
  SCIENTIFIC_IDENTITY_VERSION,
} from "./versions";

export function deriveScientificExperimentIdentity(
  material: unknown,
): RuntimeValidationResult<ScientificExperimentIdentity> {
  const validated = validateScientificIdentityInput(material);
  if ("issues" in validated) return { ok: false, issues: validated.issues };
  const hashed = hashCanonicalResearchMaterial(
    SCIENTIFIC_IDENTITY_DOMAIN,
    validated.value,
  );
  if ("issues" in hashed) return { ok: false, issues: hashed.issues };
  return {
    ok: true,
    value: {
      contractVersion: SCIENTIFIC_IDENTITY_VERSION,
      ...hashed.value,
      experimentId: `irexp_v1_${hashed.value.digest}`,
    },
  };
}

export function validateScientificExperimentIdentityIntegrity(
  value: unknown,
): RuntimeValidationResult<{
  identity: ScientificExperimentIdentity;
  material: ExperimentIdentityMaterial;
}> {
  const envelope = validateScientificExperimentIdentityEnvelope(value);
  if ("issues" in envelope) return { ok: false, issues: envelope.issues };
  let parsed: unknown;
  try {
    parsed = JSON.parse(envelope.value.canonicalMaterial);
  } catch {
    return {
      ok: false,
      issues: [{
        path: "scientific.canonicalMaterial",
        reasonCode: "research.contract.canonical_value_invalid",
      }],
    };
  }
  const material = validateScientificIdentityInput(parsed);
  if ("issues" in material) return { ok: false, issues: material.issues };
  const derived = deriveScientificExperimentIdentity(material.value);
  if (
    !derived.ok
    || derived.value.digest !== envelope.value.digest
    || derived.value.experimentId !== envelope.value.experimentId
    || derived.value.canonicalMaterial !== envelope.value.canonicalMaterial
  ) {
    return {
      ok: false,
      issues: [{
        path: "scientific",
        reasonCode: "research.integrity.reference_mismatch",
      }],
    };
  }
  return {
    ok: true,
    value: { identity: envelope.value, material: material.value },
  };
}

export function scientificIdentityMaterialFromValidated(
  material: ExperimentIdentityMaterial,
): ExperimentIdentityMaterial {
  return structuredClone(material);
}
