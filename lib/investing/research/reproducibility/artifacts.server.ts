import "server-only";

import type { RuntimeValidationResult } from "../contracts/primitives";
import type {
  ArtifactIdentity,
  ArtifactIdentityMaterial,
  ArtifactIdentityProjection,
} from "./materials";
import { hashCanonicalResearchMaterial } from "./hashing.server";
import {
  deriveReproducibleExecutionIdentity,
  validateReproducibleExecutionIdentityIntegrity,
} from "./executionIdentity.server";
import { validateScientificExperimentIdentityIntegrity } from "./scientificIdentity.server";
import {
  validateArtifactIdentityEnvelope,
  validateArtifactIdentityMaterial,
  validateArtifactIdentityProjection,
} from "./runtimeValidation";
import {
  ARTIFACT_IDENTITY_DOMAIN,
  ARTIFACT_IDENTITY_VERSION,
} from "./versions";

export function deriveResearchArtifactIdentity(
  material: unknown,
): RuntimeValidationResult<ArtifactIdentity> {
  const validated = validateArtifactIdentityMaterial(material);
  if ("issues" in validated) return { ok: false, issues: validated.issues };
  const scientific = validateScientificExperimentIdentityIntegrity(
    validated.value.scientificIdentity,
  );
  const execution = validateReproducibleExecutionIdentityIntegrity(
    validated.value.executionIdentity,
  );
  const suppliedExecution = deriveReproducibleExecutionIdentity(
    validated.value.executionMaterial,
  );
  const issues = [
    ...("issues" in scientific ? scientific.issues : []),
    ...("issues" in execution ? execution.issues : []),
    ...("issues" in suppliedExecution ? suppliedExecution.issues : []),
  ];
  if (
    scientific.ok
    && execution.ok
    && suppliedExecution.ok
    && (
      execution.value.material.scientificExperimentId
        !== scientific.value.identity.experimentId
      || execution.value.material.scientificExperimentDigest
        !== scientific.value.identity.digest
      || validated.value.executionMaterial.scientificExperimentId
        !== scientific.value.identity.experimentId
      || validated.value.executionMaterial.scientificExperimentDigest
        !== scientific.value.identity.digest
      || suppliedExecution.value.executionId
        !== execution.value.identity.executionId
    )
  ) {
    issues.push({
      path: "artifactMaterial.executionIdentity",
      reasonCode: "research.integrity.reference_mismatch",
    });
  }
  if (issues.length > 0) return { ok: false, issues };
  const hashed = hashCanonicalResearchMaterial(
    ARTIFACT_IDENTITY_DOMAIN,
    {
      contractVersion: validated.value.contractVersion,
      scientificExperimentId: validated.value.scientificIdentity.experimentId,
      reproducibleExecutionId: validated.value.executionIdentity.executionId,
      contentHash: validated.value.artifact.contentHash,
      kind: validated.value.artifact.kind,
      mediaType: validated.value.artifact.mediaType,
      schemaVersion: validated.value.artifact.schemaVersion,
      logicalRole: validated.value.artifact.logicalRole,
    },
  );
  if ("issues" in hashed) return { ok: false, issues: hashed.issues };
  return {
    ok: true,
    value: {
      contractVersion: ARTIFACT_IDENTITY_VERSION,
      ...hashed.value,
      artifactId: `irart_v1_${hashed.value.digest}`,
    },
  };
}

export function validateResearchArtifactIdentityIntegrity(
  value: unknown,
): RuntimeValidationResult<{
  identity: ArtifactIdentity;
  projection: ArtifactIdentityProjection;
}> {
  const envelope = validateArtifactIdentityEnvelope(value);
  if ("issues" in envelope) return { ok: false, issues: envelope.issues };
  let parsed: unknown;
  try {
    parsed = JSON.parse(envelope.value.canonicalMaterial);
  } catch {
    return {
      ok: false,
      issues: [{
        path: "artifact.canonicalMaterial",
        reasonCode: "research.contract.canonical_value_invalid",
      }],
    };
  }
  const projection = validateArtifactIdentityProjection(parsed);
  if ("issues" in projection) {
    return { ok: false, issues: projection.issues };
  }
  const hashed = hashCanonicalResearchMaterial(
    ARTIFACT_IDENTITY_DOMAIN,
    projection.value,
  );
  if (
    !hashed.ok
    || hashed.value.digest !== envelope.value.digest
    || hashed.value.canonicalMaterial !== envelope.value.canonicalMaterial
    || `irart_v1_${hashed.value.digest}` !== envelope.value.artifactId
  ) {
    return {
      ok: false,
      issues: [{
        path: "artifact",
        reasonCode: "research.integrity.reference_mismatch",
      }],
    };
  }
  return {
    ok: true,
    value: {
      identity: envelope.value,
      projection: projection.value,
    },
  };
}

export function artifactIdentityMaterialFromValidated(
  material: ArtifactIdentityMaterial,
): ArtifactIdentityMaterial {
  return structuredClone(material);
}
