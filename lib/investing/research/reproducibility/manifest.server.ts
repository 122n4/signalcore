import "server-only";

import type { RuntimeValidationResult } from "../contracts/primitives";
import type {
  ReproducibilityManifestEnvelope,
} from "./materials";
import { validateResearchArtifactIdentityIntegrity } from "./artifacts.server";
import { validateReproducibleExecutionIdentityIntegrity } from "./executionIdentity.server";
import {
  hashCanonicalResearchMaterial,
  verifyCanonicalResearchHash,
} from "./hashing.server";
import { validateScientificExperimentIdentityIntegrity } from "./scientificIdentity.server";
import {
  validateManifestOperationalMetadata,
  validateReproducibilityManifestCore,
  validateReproducibilityManifestEnvelope,
} from "./runtimeValidation";
import {
  EXECUTION_IDENTITY_DOMAIN,
  MANIFEST_IDENTITY_DOMAIN,
  REPRODUCIBILITY_MANIFEST_VERSION,
  SCIENTIFIC_IDENTITY_DOMAIN,
} from "./versions";

export function deriveReproducibilityManifest(
  core: unknown,
  metadata: unknown,
): RuntimeValidationResult<ReproducibilityManifestEnvelope> {
  const validatedMetadata = validateManifestOperationalMetadata(metadata);
  if ("issues" in validatedMetadata) {
    return { ok: false, issues: validatedMetadata.issues };
  }
  const validatedCore = validateReproducibilityManifestCore(core);
  if ("issues" in validatedCore) {
    return { ok: false, issues: validatedCore.issues };
  }
  const normalizedCore = {
    ...validatedCore.value,
    artifacts: [...validatedCore.value.artifacts].sort((left, right) =>
      left.identity.artifactId.localeCompare(right.identity.artifactId)),
  };
  const hashed = hashCanonicalResearchMaterial(
    MANIFEST_IDENTITY_DOMAIN,
    normalizedCore,
  );
  if ("issues" in hashed) return { ok: false, issues: hashed.issues };
  const envelope: ReproducibilityManifestEnvelope = {
    contractVersion: REPRODUCIBILITY_MANIFEST_VERSION,
    manifestId: `irman_v1_${hashed.value.digest}`,
    coreDigest: hashed.value.digest,
    core: normalizedCore,
    ...validatedMetadata.value,
  };
  return validateReproducibilityManifestIntegrity(envelope);
}

export function validateReproducibilityManifestIntegrity(
  value: unknown,
): RuntimeValidationResult<ReproducibilityManifestEnvelope> {
  const validated = validateReproducibilityManifestEnvelope(value);
  if ("issues" in validated) return validated;
  const scientific = verifyCanonicalResearchHash(
    SCIENTIFIC_IDENTITY_DOMAIN,
    validated.value.core.scientificIdentity.canonicalMaterial,
    validated.value.core.scientificIdentity.digest,
  );
  const execution = verifyCanonicalResearchHash(
    EXECUTION_IDENTITY_DOMAIN,
    validated.value.core.executionIdentity.canonicalMaterial,
    validated.value.core.executionIdentity.digest,
  );
  const scientificIntegrity = validateScientificExperimentIdentityIntegrity(
    validated.value.core.scientificIdentity,
  );
  const executionIntegrity = validateReproducibleExecutionIdentityIntegrity(
    validated.value.core.executionIdentity,
  );
  const manifest = hashCanonicalResearchMaterial(
    MANIFEST_IDENTITY_DOMAIN,
    validated.value.core,
  );
  const issues = [
    ...("issues" in scientific ? scientific.issues : []),
    ...("issues" in execution ? execution.issues : []),
    ...("issues" in scientificIntegrity ? scientificIntegrity.issues : []),
    ...("issues" in executionIntegrity ? executionIntegrity.issues : []),
    ...("issues" in manifest ? manifest.issues : []),
  ];
  const artifactIds = validated.value.core.artifacts.map(
    (artifact) => artifact.identity.artifactId,
  );
  const sortedArtifactIds = [...artifactIds].sort((left, right) =>
    left.localeCompare(right));
  if (artifactIds.some((id, index) => id !== sortedArtifactIds[index])) {
    issues.push({
      path: "manifest.core.artifacts",
      reasonCode: "research.contract.invalid",
    });
  }
  if (
    scientificIntegrity.ok
    && executionIntegrity.ok
    && (
      executionIntegrity.value.material.scientificExperimentId
        !== scientificIntegrity.value.identity.experimentId
      || executionIntegrity.value.material.scientificExperimentDigest
        !== scientificIntegrity.value.identity.digest
    )
  ) {
    issues.push({
      path: "manifest.core.executionIdentity",
      reasonCode: "research.integrity.reference_mismatch",
    });
  }
  if (scientificIntegrity.ok) {
    const material = scientificIntegrity.value.material;
    const core = validated.value.core;
    if (
      material.datasetVersionId !== core.dataset.datasetVersionId
      || material.datasetManifestHash !== core.dataset.manifestHash
      || material.datasetContentHash !== core.dataset.aggregateContentHash
      || material.hypothesisId !== core.hypothesis.id
      || material.hypothesisVersion !== core.hypothesis.version
      || material.candidateId !== core.candidate.id
      || material.candidateVersion !== core.candidate.version
    ) {
      issues.push({
        path: "manifest.core.scientificIdentity",
        reasonCode: "research.integrity.reference_mismatch",
      });
    }
  }
  for (const [index, artifact] of validated.value.core.artifacts.entries()) {
    const integrity = validateResearchArtifactIdentityIntegrity(artifact.identity);
    if ("issues" in integrity) {
      issues.push(...integrity.issues);
      continue;
    }
    const projection = integrity.value.projection;
    if (
      artifact.scientificExperimentId
        !== validated.value.core.scientificIdentity.experimentId
      || artifact.reproducibleExecutionId
        !== validated.value.core.executionIdentity.executionId
      || projection.scientificExperimentId !== artifact.scientificExperimentId
      || projection.reproducibleExecutionId !== artifact.reproducibleExecutionId
      || projection.contentHash !== artifact.contentHash
      || projection.kind !== artifact.kind
      || projection.mediaType !== artifact.mediaType
      || projection.schemaVersion !== artifact.schemaVersion
      || projection.logicalRole !== artifact.logicalRole
    ) {
      issues.push({
        path: `manifest.core.artifacts[${index}]`,
        reasonCode: "research.integrity.reference_mismatch",
      });
    }
  }
  for (const [index, expectation] of validated.value.core.artifactExpectations.entries()) {
    const matchingArtifacts = validated.value.core.artifacts.filter((artifact) =>
      artifact.kind === expectation.kind
      && artifact.logicalRole === expectation.logicalRole
      && artifact.mediaType === expectation.mediaType
      && artifact.schemaVersion === expectation.schemaVersion);
    if (
      matchingArtifacts.length > 1
      || (expectation.required && matchingArtifacts.length !== 1)
    ) {
      issues.push({
        path: `manifest.core.artifactExpectations[${index}]`,
        reasonCode: "research.integrity.reference_mismatch",
      });
    }
  }
  for (const [index, artifact] of validated.value.core.artifacts.entries()) {
    const matches = validated.value.core.artifactExpectations.filter(
      (expectation) =>
        artifact.kind === expectation.kind
        && artifact.logicalRole === expectation.logicalRole
        && artifact.mediaType === expectation.mediaType
        && artifact.schemaVersion === expectation.schemaVersion,
    );
    if (matches.length !== 1) {
      issues.push({
        path: `manifest.core.artifacts[${index}]`,
        reasonCode: "research.integrity.reference_mismatch",
      });
    }
  }
  if (
    !("issues" in manifest)
    && (
      manifest.value.digest !== validated.value.coreDigest
      || `irman_v1_${manifest.value.digest}` !== validated.value.manifestId
    )
  ) {
    issues.push({
      path: "manifest.coreDigest",
      reasonCode: "research.integrity.reference_mismatch",
    });
  }
  return issues.length > 0
    ? { ok: false, issues }
    : validated;
}
