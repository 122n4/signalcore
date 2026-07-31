export const BETA_READINESS_MANIFEST_VERSION =
  "investing-beta-readiness-manifest/v1" as const;
export const BETA_READINESS_REPORT_VERSION =
  "investing-beta-readiness-report/v1" as const;

export const BETA_READINESS_GATE_IDS = [
  "source_integrity",
  "deterministic_tests",
  "postgresql_validation",
  "migration_reproducibility",
  "static_analysis",
  "production_build",
  "dependency_security",
  "ci_verification",
  "operational_containment",
] as const;

export type BetaReadinessGateId = typeof BETA_READINESS_GATE_IDS[number];
export type BetaReadinessEvidenceState = "passed" | "failed" | "unavailable";

export type BetaReadinessEvidence = Readonly<{
  gateId: BetaReadinessGateId;
  state: BetaReadinessEvidenceState;
  checkpoint: string;
  observedAt: string;
  validUntil: string;
  reference: string;
}>;

export type BetaReadinessManifest = Readonly<{
  contractVersion: typeof BETA_READINESS_MANIFEST_VERSION;
  checkpoint: string;
  evaluatedAt: string;
  profile: Readonly<{
    id: string;
    version: string;
  }>;
  evidence: readonly BetaReadinessEvidence[];
}>;

export type BetaReadinessReason =
  | "evidence_failed"
  | "evidence_unavailable"
  | "evidence_stale"
  | "evidence_checkpoint_mismatch";

export type BetaReadinessGateResult = Readonly<{
  gateId: BetaReadinessGateId;
  state: "passed" | "blocked";
  reason: BetaReadinessReason | null;
  reference: string;
}>;

export type BetaReadinessReport = Readonly<{
  contractVersion: typeof BETA_READINESS_REPORT_VERSION;
  checkpoint: string;
  evaluatedAt: string;
  profile: Readonly<{
    id: string;
    version: string;
  }>;
  state: "beta_ready" | "blocked";
  gates: readonly BetaReadinessGateResult[];
  reportHash: string;
}>;

export type BetaReadinessResult =
  | Readonly<{ ok: true; value: BetaReadinessReport }>
  | Readonly<{ ok: false; reason: "beta_readiness_manifest_invalid" }>;
