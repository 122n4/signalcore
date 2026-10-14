import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("server-only", () => ({}));
import { createServerDatasetMaterialProviderV1 } from "../lib/investing/research/serverDatasetMaterialProvider";

const hash = "a".repeat(64);
const ref = Object.freeze({
  hashAlgorithm: "SHA-256" as const,
  hashDomain: "SYNTRAKE:DATASET_SERIES:V1" as const,
  hashVersion: "SYNTRAKE_SHA256_V1" as const,
  hashHex: hash,
});
const folders: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
});
async function directory() {
  const folder = await mkdtemp(join(tmpdir(), "syntrake-rl10-material-"));
  folders.push(folder);
  return folder;
}
describe("RL-10 operator-owned content-addressed material loader", () => {
  it("fails closed when the operator has not configured an absolute root", () => {
    vi.stubEnv("SYNTRAKE_I5_DATASET_MATERIAL_DIRECTORY", "");
    expect(createServerDatasetMaterialProviderV1()).toBeNull();
    vi.stubEnv("SYNTRAKE_I5_DATASET_MATERIAL_DIRECTORY", "../user/path");
    expect(createServerDatasetMaterialProviderV1()).toBeNull();
  });
  it("loads only an exact series identity from the operator root", async () => {
    const folder = await directory();
    const bytes = Buffer.from('{"date":"2020-01-01","value":"1"}\n');
    await writeFile(join(folder, hash + ".jsonl"), bytes);
    vi.stubEnv("SYNTRAKE_I5_DATASET_MATERIAL_DIRECTORY", folder);
    const provider = createServerDatasetMaterialProviderV1();
    expect(provider).not.toBeNull();
    expect(await provider!.loadSeriesContent(ref)).toEqual(bytes);
    expect(await provider!.loadSeriesContent({...ref,hashHex:"b".repeat(64)})).toBeNull();
    expect(await provider!.loadSeriesContent({...ref,hashHex:"../../etc/passwd"})).toBeNull();
    expect(await provider!.loadSeriesContent({...ref,hashDomain:"SYNTRAKE:RESULT:V1"})).toBeNull();
  });
  it.skipIf(process.platform === "win32")("rejects symlink material without following it", async () => {
    const folder = await directory();
    const other = await directory();
    const target = join(other,"outside.jsonl");
    await writeFile(target, "not authorized");
    await symlink(target, join(folder,hash+".jsonl"));
    vi.stubEnv("SYNTRAKE_I5_DATASET_MATERIAL_DIRECTORY", folder);
    const provider = createServerDatasetMaterialProviderV1();
    await expect(provider!.loadSeriesContent(ref)).rejects.toThrow("DATASET_FILE_INVALID");
  });
  it("refuses an oversized file instead of allocating arbitrary memory", async () => {
    const folder = await directory();
    const file = join(folder,hash+".jsonl");
    await writeFile(file, Buffer.alloc(1));
    const { truncate } = await import("node:fs/promises");
    await truncate(file,32*1024*1024+1);
    vi.stubEnv("SYNTRAKE_I5_DATASET_MATERIAL_DIRECTORY", folder);
    await expect(createServerDatasetMaterialProviderV1()!.loadSeriesContent(ref))
      .rejects.toThrow("DATASET_FILE_INVALID");
  });
});
