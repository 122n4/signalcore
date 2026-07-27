import "server-only";

import { createHash } from "node:crypto";

import type {
  RuntimeValidationResult,
  ValidationIssue,
} from "../contracts/primitives";
import { canonicalizeResearchContract } from "../contracts/runtimeValidation";
import {
  ARTIFACT_IDENTITY_DOMAIN,
  EXECUTION_IDENTITY_DOMAIN,
  MANIFEST_IDENTITY_DOMAIN,
  RESEARCH_CANONICALIZATION_VERSION,
  RESEARCH_HASH_ALGORITHM,
  SCIENTIFIC_IDENTITY_DOMAIN,
} from "./versions";

export type ResearchHashDomain =
  | typeof SCIENTIFIC_IDENTITY_DOMAIN
  | typeof EXECUTION_IDENTITY_DOMAIN
  | typeof MANIFEST_IDENTITY_DOMAIN
  | typeof ARTIFACT_IDENTITY_DOMAIN;

export type DomainSeparatedHash = Readonly<{
  hashAlgorithm: typeof RESEARCH_HASH_ALGORITHM;
  canonicalizationVersion: typeof RESEARCH_CANONICALIZATION_VERSION;
  domain: ResearchHashDomain;
  canonicalMaterial: string;
  digest: string;
}>;

const ALLOWED_DOMAINS = new Set<ResearchHashDomain>([
  SCIENTIFIC_IDENTITY_DOMAIN,
  EXECUTION_IDENTITY_DOMAIN,
  MANIFEST_IDENTITY_DOMAIN,
  ARTIFACT_IDENTITY_DOMAIN,
]);

export function hashCanonicalResearchMaterial(
  domain: ResearchHashDomain,
  material: unknown,
): RuntimeValidationResult<DomainSeparatedHash> {
  if (!ALLOWED_DOMAINS.has(domain)) {
    const issues: readonly ValidationIssue[] = [{
      path: "hash.domain",
      reasonCode: "research.contract.invalid",
    }];
    return { ok: false, issues };
  }
  const canonical = canonicalizeResearchContract(material);
  if ("issues" in canonical) return { ok: false, issues: canonical.issues };
  const digest = createHash(RESEARCH_HASH_ALGORITHM)
    .update(`${domain}\n${canonical.value}`, "utf8")
    .digest("hex");
  return {
    ok: true,
    value: {
      hashAlgorithm: RESEARCH_HASH_ALGORITHM,
      canonicalizationVersion: RESEARCH_CANONICALIZATION_VERSION,
      domain,
      canonicalMaterial: canonical.value,
      digest,
    },
  };
}

export function verifyCanonicalResearchHash(
  domain: ResearchHashDomain,
  canonicalMaterial: unknown,
  expectedDigest: unknown,
): RuntimeValidationResult<DomainSeparatedHash> {
  if (typeof canonicalMaterial !== "string" || typeof expectedDigest !== "string") {
    return {
      ok: false,
      issues: [{ path: "hash", reasonCode: "research.contract.invalid" }],
    };
  }
  let material: unknown;
  try {
    material = JSON.parse(canonicalMaterial);
  } catch {
    return {
      ok: false,
      issues: [{
        path: "hash.canonicalMaterial",
        reasonCode: "research.contract.canonical_value_invalid",
      }],
    };
  }
  const calculated = hashCanonicalResearchMaterial(domain, material);
  if ("issues" in calculated) return calculated;
  if (
    calculated.value.canonicalMaterial !== canonicalMaterial
    || calculated.value.digest !== expectedDigest
  ) {
    return {
      ok: false,
      issues: [{
        path: "hash.digest",
        reasonCode: "research.integrity.reference_mismatch",
      }],
    };
  }
  return calculated;
}
