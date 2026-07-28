import "server-only";
import { createHash } from "node:crypto";
import { link, mkdir, open, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { DatasetResult, DatasetStorageReference } from "../datasets";
import { DATASET_STORAGE_REFERENCE_VERSION } from "../datasets";

const HASH = /^[a-f0-9]{64}$/u;

export class ContentAddressedDatasetStorage {
  private readonly root: string;
  constructor(root: string) {
    if (!path.isAbsolute(root)) throw new Error("dataset_storage_root_must_be_absolute");
    this.root = path.resolve(root);
  }

  async publish(input: Readonly<{ normalized: string; normalizedHash: string; rawHash: string; schemaVersion: string }>): Promise<DatasetResult<DatasetStorageReference>> {
    const actual = createHash("sha256").update(input.normalized).digest("hex");
    if (!HASH.test(input.normalizedHash) || !HASH.test(input.rawHash) || actual !== input.normalizedHash) return { ok: false, issues: [{ path: "storage.hash", reasonCode: "dataset_storage_integrity_failed" }] };
    const key = `sha256/${actual.slice(0, 2)}/${actual}.ndjson`;
    const destination = path.resolve(this.root, ...key.split("/"));
    if (!destination.startsWith(`${this.root}${path.sep}`)) return { ok: false, issues: [{ path: "storage.key", reasonCode: "dataset_storage_integrity_failed" }] };
    await mkdir(path.dirname(destination), { recursive: true });
    const temp = `${destination}.${crypto.randomUUID()}.tmp`;
    try {
      const handle = await open(temp, "wx");
      try { await handle.writeFile(input.normalized, "utf8"); await handle.sync(); } finally { await handle.close(); }
      try { await link(temp, destination); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const existing = await readFile(destination);
        if (createHash("sha256").update(existing).digest("hex") !== actual) return { ok: false, issues: [{ path: "storage.collision", reasonCode: "dataset_content_mismatch" }] };
      }
      const info = await stat(destination);
      return { ok: true, value: { contractVersion: DATASET_STORAGE_REFERENCE_VERSION, key, rawContentHash: input.rawHash, normalizedContentHash: actual, mediaType: "application/x-ndjson", schemaVersion: input.schemaVersion, byteSize: info.size, integrityState: "verified" } };
    } finally { await rm(temp, { force: true }); }
  }

  async read(reference: DatasetStorageReference): Promise<DatasetResult<Buffer>> {
    const destination = path.resolve(this.root, ...reference.key.split("/"));
    if (!destination.startsWith(`${this.root}${path.sep}`)) return { ok: false, issues: [{ path: "storage.key", reasonCode: "dataset_storage_integrity_failed" }] };
    try {
      const data = await readFile(destination);
      return createHash("sha256").update(data).digest("hex") === reference.normalizedContentHash
        ? { ok: true, value: data }
        : { ok: false, issues: [{ path: "storage.hash", reasonCode: "dataset_storage_integrity_failed" }] };
    } catch { return { ok: false, issues: [{ path: "storage.read", reasonCode: "dataset_storage_integrity_failed" }] }; }
  }
}
