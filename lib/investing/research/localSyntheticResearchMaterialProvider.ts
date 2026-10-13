import "server-only";
import fs from "node:fs";
import path from "node:path";
import { constants as fsConstants } from "node:fs";
import { randomUUID } from "node:crypto";
import type {
  AuthorizedResearchExecutionContext,
  AuthorizedResearchValidationChildExecutionContext,
} from "../authority/context";
import { hashRefV1 } from "./canonical";
import { canonicalDatasetSeriesHashPayloadV1, hashDatasetSeriesV1, type DatasetSeriesHashPayloadV1 } from "./executionMaterials";
import { verifyDatasetSeriesMaterialV2, type ResearchDatasetMaterialProviderV1 } from "./datasetMaterial";

type Context = AuthorizedResearchExecutionContext | AuthorizedResearchValidationChildExecutionContext;
const REFUSED = "RESEARCH_MATERIAL_ACCESS_UNPROVEN";
const MAX_BYTES = 32 * 1024 * 1024;
const FILENAME = /^[0-9A-F]{64}$/u;
const ALLOWED_OPERATIONS = new Set(["RESEARCH_EXECUTION_RUN_V1", "RESEARCH_VALIDATION_CHILD_EXECUTE_V1"]);

/**
 * REAL execution of a *fictional* frozen dataset on a local POSIX development
 * host only. No actual market/provider material, true Blind Truth holdout or
 * Production access is possible through this adapter.
 *
 * The ordinary publicly callable commands choose this provider only after
 * deriving tenant authority on the server. The explicit directory comes from
 * a server-owned environmental setting, never the client request. This is NOT
 * a trusted market provider, embargo-complete audit or Production allow path.
 */
export function createLocalSyntheticResearchMaterialProviderV1(
  context: Context,
  untrustedRoot: string | undefined,
): ResearchDatasetMaterialProviderV1 | null {
  if (!untrustedRoot) return null;
  if (process.env.NODE_ENV === "production" ||
      process.platform === "win32" ||
      typeof untrustedRoot !== "string" ||
      !path.isAbsolute(untrustedRoot) ||
      !context || context.actorKind !== "USER_PRINCIPAL" ||
      context.capability !== "RESEARCH_EXECUTE" ||
      context.operationScope !== "TENANT_SCOPE" ||
      context.sourceContext !== "PURE_RESEARCH" ||
      !ALLOWED_OPERATIONS.has(context.operation)) {
    throw Error(REFUSED);
  }

  let root: string;
  try {
    const stat = fs.lstatSync(untrustedRoot);
    root = fs.realpathSync.native(untrustedRoot);
    if (stat.isSymbolicLink() || !stat.isDirectory() ||
        (stat.mode & 0o777) !== 0o700 ||
        root !== untrustedRoot ||
        (typeof process.getuid === "function" && stat.uid !== process.getuid())) {
      throw Error(REFUSED);
    }
  } catch { throw Error(REFUSED); }

  const fixedContext = Object.freeze({
    tenantId: context.tenantId,principalId: context.principalId,
    tenantMembershipId: context.tenantMembershipId,
    researchInvestigationId: context.researchInvestigationId,
    operation:context.operation,
  });

  function audit(phase:"ATTEMPT"|"VERIFIED", seriesHashHex:string, contentSha256:string) {
    // Append/fdatasync before returning material. Local append-only is NOT
    // tamper-proof against its OS owner, and is NOT holdout non-exposure proof.
    const file = path.join(root, ".syntrake-synthetic-read-audit.jsonl");
    const fd = fs.openSync(file,
      fsConstants.O_WRONLY | fsConstants.O_APPEND | fsConstants.O_CREAT |
      fsConstants.O_NOFOLLOW, 0o600);
    try {
      const stat = fs.fstatSync(fd);
      if (!stat.isFile() || stat.nlink !== 1 ||
          (stat.mode & 0o777) !== 0o600) throw Error(REFUSED);
      const record = JSON.stringify({
        schemaVersion:"RL9_LOCAL_SYNTHETIC_MATERIAL_READ_V1",
        eventId:randomUUID(),at:new Date().toISOString(),phase,
        ...fixedContext,seriesHashHex,contentSha256,
      })+"\n";
      const bytes = Buffer.from(record,"utf8");
      if (fs.writeSync(fd,bytes,0,bytes.length,null)!==bytes.length) throw Error(REFUSED);
      fs.fsyncSync(fd);
    } finally {fs.closeSync(fd);}
  }

  return Object.freeze({
    async loadSeriesContent(rawRef, rawSeries?: DatasetSeriesHashPayloadV1):Promise<Buffer|null> {
      let series: DatasetSeriesHashPayloadV1;
      let hashHex: string;
      try {
        const ref=hashRefV1(rawRef);
        if (ref.hashDomain!=="SYNTRAKE:DATASET_SERIES:V1" || !rawSeries)
          throw Error(REFUSED);
        series = rawSeries;
        canonicalDatasetSeriesHashPayloadV1(series);
        hashHex=hashDatasetSeriesV1(series);
        if (!FILENAME.test(hashHex) || ref.hashHex!==hashHex ||
            series.providerDatasetId!=="SYNTRAKE_RL5_TEST_OHLCV" ||
            series.providerDatasetVersion!=="V20260926") throw Error(REFUSED);
        audit("ATTEMPT",hashHex,series.contentSha256);
      } catch { throw Error(REFUSED); }

      const filename = path.join(root,hashHex+".jsonl");
      let fd: number | null=null;
      try {
        fd=fs.openSync(filename,fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
        const stat=fs.fstatSync(fd);
        if (!stat.isFile() || stat.nlink!==1 ||
            (stat.mode & 0o777)!==0o600 ||
            (typeof process.getuid === "function" && stat.uid!==process.getuid()) ||
            stat.size<=0 || stat.size>MAX_BYTES) throw Error(REFUSED);
        const bytes=Buffer.alloc(stat.size);
        let offset=0;
        while(offset<bytes.length) {
          const read=fs.readSync(fd,bytes,offset,bytes.length-offset,offset);
          if(read<=0) throw Error(REFUSED);
          offset+=read;
        }
        // The existing deterministic verifier checks SHA256, canonical
        // JSONL bytes, exact observation count, coverage and OHLC semantics.
        verifyDatasetSeriesMaterialV2(series,bytes);
        audit("VERIFIED",hashHex,series.contentSha256);
        return bytes;
      } catch {throw Error(REFUSED);}
      finally {if(fd!==null)fs.closeSync(fd);}
    },
  });
}
