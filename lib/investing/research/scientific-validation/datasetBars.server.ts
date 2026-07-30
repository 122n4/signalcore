import "server-only";
import type {ScopedSqlPool} from "../dataset-catalog/postgresRepository.server";
import {ContentAddressedDatasetStorage} from "../data-agent/storage.server";
import {
  DATASET_VERSION_MATERIAL_VERSION,
  validateDatasetVersionMaterial,
} from "../datasets";
import {RESEARCH_READY_DATASET_VERSION} from "../dataset-quality/versions";
import type {
  DatasetVersionRef,
  InvestingResearchScientificScope,
} from "../contracts";
import type {ScientificDatasetBarsPort} from "./evidenceCollector.server";

export class PostgresContentAddressedDatasetBars
implements ScientificDatasetBarsPort{
  private readonly storage:ContentAddressedDatasetStorage;
  constructor(private readonly pool:ScopedSqlPool,storageRoot:string){
    this.storage=new ContentAddressedDatasetStorage(storageRoot);
  }
  async load(scope:InvestingResearchScientificScope,dataset:DatasetVersionRef){
    const client=await this.pool.connect();
    try{
      const result=await client.query(
        `select manifest_hash,content_hash,canonical_payload
         from public.investing_research_dataset_versions
         where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4
           and dataset_version_id=$5 and quality_state='research_ready'`,
        [scope.tenantId,scope.ownerId,scope.portfolioId,scope.accountId,
          dataset.datasetVersionId]);
      if(result.rows.length!==1
        ||String(result.rows[0].manifest_hash)!==dataset.manifestHash
        ||String(result.rows[0].content_hash)!==dataset.aggregateContentHash){
        throw new Error("scientific_validation_dataset_reference_mismatch");
      }
      const payload=result.rows[0].canonical_payload;
      if(typeof payload!=="object"||payload===null||Array.isArray(payload)
        ||Object.getPrototypeOf(payload)!==Object.prototype){
        throw new Error("scientific_validation_dataset_integrity_failed");
      }
      const {
        contractVersion,state,sourceDatasetVersionId,qualityReportId,qualifiedAt,
        ...sourceMaterial
      }=payload as Record<string,unknown>;
      const material=validateDatasetVersionMaterial({
        ...sourceMaterial,contractVersion:DATASET_VERSION_MATERIAL_VERSION,
        state:"awaiting_quality",
      });
      if(contractVersion!==RESEARCH_READY_DATASET_VERSION||state!=="research_ready"
        ||typeof sourceDatasetVersionId!=="string"||sourceDatasetVersionId.length===0
        ||typeof qualityReportId!=="string"||qualityReportId.length===0
        ||typeof qualifiedAt!=="string"||!Number.isFinite(Date.parse(qualifiedAt))
        ||new Date(qualifiedAt).toISOString()!==qualifiedAt
        ||!material.ok
        ||material.value.storage.normalizedContentHash!==dataset.aggregateContentHash){
        throw new Error("scientific_validation_dataset_integrity_failed");
      }
      const stored=await this.storage.read(material.value.storage);
      if(!stored.ok)throw new Error("scientific_validation_dataset_integrity_failed");
      const lines=stored.value.toString("utf8").split(/\r?\n/u).filter(Boolean);
      return lines.map(line=>JSON.parse(line) as unknown);
    }finally{client.release?.();}
  }
}
