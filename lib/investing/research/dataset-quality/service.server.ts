import "server-only";

import { createHash } from "node:crypto";
import { canonicalizeResearchContract } from "../contracts/runtimeValidation";
import type { InvestingResearchScientificScope } from "../contracts";
import { evaluateDatasetQuality } from "./gates.server";
import { deriveDatasetQualityReportIdentity } from "./identity.server";
import type { DatasetQualityRepository } from "./repository.server";
import type { DatasetQualityEvaluationInput, DatasetQualityReport, QualityEvaluationProfile, ResearchReadyDatasetVersionMaterial } from "./types";
import { RESEARCH_READY_DATASET_VERSION } from "./versions";
import { validateQualityProfile } from "./runtimeValidation";

export type DatasetQualityAuthorization = Readonly<{
  resolve(operation: "evaluate_dataset_quality" | "get_dataset_quality_report" | "list_dataset_quality_reports",
    requestedScope: unknown): Promise<InvestingResearchScientificScope>;
}>;
export type DatasetQualityEvents = Readonly<{ emit(event: Readonly<Record<string, unknown>>): void }>;
export type DatasetQualityEvidenceCollector = Readonly<{
  collect(input: Omit<DatasetQualityEvaluationInput, "evidence">): Promise<DatasetQualityEvaluationInput>;
}>;

const digest = (domain: string, material: unknown) => {
  const canonical = canonicalizeResearchContract(material);
  if (!canonical.ok) throw new Error("quality_input_invalid");
  return createHash("sha256").update(`${domain}\n${canonical.value}`, "utf8").digest("hex");
};
const sameScope = (a: InvestingResearchScientificScope, b: InvestingResearchScientificScope) =>
  a.tenantId === b.tenantId && a.ownerId === b.ownerId
  && a.portfolioId === b.portfolioId && a.accountId === b.accountId;

export class DatasetQualityService {
  constructor(
    private readonly repository: DatasetQualityRepository,
    private readonly authorization: DatasetQualityAuthorization,
    private readonly evidenceCollector: DatasetQualityEvidenceCollector,
    private readonly events: DatasetQualityEvents = { emit: () => undefined },
  ) {}

  async evaluateAndPublish(input: Readonly<{
    requestedScope: unknown;
    sourceDatasetVersionId: string;
    profile: QualityEvaluationProfile;
    evaluatedAt: string;
    correlationId: string;
  }>) {
    if (!Number.isFinite(Date.parse(input.evaluatedAt))
      || new Date(input.evaluatedAt).toISOString() !== input.evaluatedAt
      || !/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/u.test(input.correlationId)) {
      throw new Error("quality_input_invalid");
    }
    const profile = validateQualityProfile(input.profile);
    if (!profile.ok || typeof input.sourceDatasetVersionId !== "string"
      || !/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/u.test(input.sourceDatasetVersionId)) {
      throw new Error("quality_input_invalid");
    }
    const scope = await this.authorization.resolve("evaluate_dataset_quality", input.requestedScope);
    const source = await this.repository.loadEvaluationSource(scope, input.sourceDatasetVersionId);
    if (!source) throw new Error("quality_source_not_awaiting_quality");
    if (!sameScope(scope, source.source.scope)) throw new Error("quality_scope_mismatch");
    const evaluation = await this.evidenceCollector.collect({
      sourceDatasetVersionId: input.sourceDatasetVersionId,
      source: source.source,
      requirement: source.requirement,
      profile: profile.value,
    });
    const evaluated = evaluateDatasetQuality(evaluation);
    if ("issues" in evaluated) return evaluated;
    const identity = deriveDatasetQualityReportIdentity(evaluated.value);
    if ("issues" in identity) return identity;
    const report: DatasetQualityReport = {
      qualityReportId: identity.value.qualityReportId,
      reportHash: identity.value.reportHash,
      canonicalMaterial: identity.value.canonicalMaterial,
      material: evaluated.value,
      evaluatedAt: input.evaluatedAt,
      correlationId: input.correlationId,
    };
    const derived: ResearchReadyDatasetVersionMaterial | null =
      report.material.outcome === "research_ready" ? {
        ...evaluation.source,
        contractVersion: RESEARCH_READY_DATASET_VERSION,
        state: "research_ready",
        sourceDatasetVersionId: evaluation.sourceDatasetVersionId,
        qualityReportId: report.qualityReportId,
        qualifiedAt: report.material.profile.asOfExclusive,
      } : null;
    const derivedHash = derived ? digest("syntrake.investing.research-ready-dataset/v1", derived) : "";
    const lineageMaterial = derived ? {
      sourceDatasetVersionId: report.material.sourceDatasetVersionId,
      derivedDatasetVersionId: `irdsv6f_v1_${derivedHash}`,
      qualityReportId: report.qualityReportId,
    } : {};
    const lineageHash = derived ? digest("syntrake.investing.dataset-lineage/v1", lineageMaterial) : "";
    const published = await this.repository.publishOrReuse({
      report,
      derivedDatasetVersionId: derived ? `irdsv6f_v1_${derivedHash}` : "",
      derivedManifestHash: derivedHash,
      derived: derived ?? ({} as ResearchReadyDatasetVersionMaterial),
      lineageEventId: derived ? `irlineage6f_v1_${lineageHash}` : "",
      lineageEventHash: lineageHash,
    });
    this.events.emit({
      type: report.material.outcome === "research_ready" ? "dataset_research_ready_published" : "dataset_quality_evaluated",
      qualityReportId: report.qualityReportId, sourceDatasetVersionId: report.material.sourceDatasetVersionId,
      outcome: report.material.outcome, scope, correlationId: input.correlationId,
    });
    return { ok: true as const, value: published };
  }

  async getReport(requestedScope: unknown, qualityReportId: string) {
    const scope = await this.authorization.resolve("get_dataset_quality_report", requestedScope);
    return this.repository.getReport(scope, qualityReportId);
  }
  async listReports(requestedScope: unknown) {
    const scope = await this.authorization.resolve("list_dataset_quality_reports", requestedScope);
    return this.repository.listReports(scope);
  }
}
