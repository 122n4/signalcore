import "server-only";

import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import type { HashRefV1 } from "./canonical";
import type { ResearchDatasetMaterialProviderV1 } from "./datasetMaterial";

// RL-10: local or mounted content-addressed scientific material, owned by
// the server operator. This is NOT a market-data feed, downloader or source
// of truth for DatasetSeries identities; the accepted execution writer checks
// canonical material bytes, content SHA-256, coverage and observation count.
const maxSeriesBytes = 32 * 1024 * 1024;
const hashHex = /^[0-9a-f]{64}$/u;
const rootVariable = "SYNTRAKE_I5_DATASET_MATERIAL_DIRECTORY";

export function createServerDatasetMaterialProviderV1(): ResearchDatasetMaterialProviderV1 | null {
  const root = process.env[rootVariable];
  // Never read a root, path, URL, provider or credential from a command.
  // Missing root disables headless execution rather than using demo data.
  if (!root || root.includes("\0") || root.length > 4096 || !isAbsolute(root)) return null;
  return {
    async loadSeriesContent(ref: HashRefV1): Promise<Buffer | null> {
      if (ref?.hashAlgorithm !== "SHA-256" ||
          ref.hashDomain !== "SYNTRAKE:DATASET_SERIES:V1" ||
          ref.hashVersion !== "SYNTRAKE_SHA256_V1" ||
          typeof ref.hashHex !== "string" || !hashHex.test(ref.hashHex)) return null;
      const directory = await lstat(root);
      if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error("DATASET_ROOT_INVALID");
      // Only exact scientific hash identities can name a file. No client path.
      const path = join(root, ref.hashHex + ".jsonl");
      let expected;
      try { expected = await lstat(path); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
      if (!expected.isFile() || expected.isSymbolicLink() ||
          expected.size === 0 || expected.size > maxSeriesBytes) throw new Error("DATASET_FILE_INVALID");
      const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      try {
        const actual = await handle.stat();
        if (!actual.isFile() || actual.size !== expected.size ||
            actual.size > maxSeriesBytes ||
            (expected.ino !== 0 && actual.ino !== expected.ino) ||
            (expected.dev !== 0 && actual.dev !== expected.dev)) throw new Error("DATASET_FILE_CHANGED");
        const bytes = await handle.readFile();
        if (bytes.length !== actual.size) throw new Error("DATASET_FILE_CHANGED");
        return bytes;
      } finally { await handle.close(); }
    },
  };
}
