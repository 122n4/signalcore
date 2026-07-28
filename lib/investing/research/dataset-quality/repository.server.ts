import "server-only";

import type { InvestingResearchScientificScope } from "../contracts";
import type { DatasetQualityReport, ResearchReadyDatasetVersionMaterial } from "./types";
import type { DatasetRequirementMaterial, DatasetVersionMaterial } from "../datasets";

export type QualityPublication = Readonly<{
  report: DatasetQualityReport;
  derivedDatasetVersionId: string;
  derivedManifestHash: string;
  derived: ResearchReadyDatasetVersionMaterial;
  lineageEventId: string;
  lineageEventHash: string;
}>;

export interface DatasetQualityRepository {
  loadEvaluationSource(scope: InvestingResearchScientificScope, sourceDatasetVersionId: string): Promise<Readonly<{
    source: DatasetVersionMaterial;
    requirement: DatasetRequirementMaterial;
  }> | null>;
  publishOrReuse(input: QualityPublication): Promise<Readonly<{
    qualityReportId: string;
    datasetVersionId: string | null;
    reused: boolean;
  }>>;
  getReport(scope: InvestingResearchScientificScope, qualityReportId: string): Promise<DatasetQualityReport | null>;
  listReports(scope: InvestingResearchScientificScope): Promise<readonly DatasetQualityReport[]>;
}
