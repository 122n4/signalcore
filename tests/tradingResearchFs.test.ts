import path from "node:path";
import { utimes, writeFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { ensureDirectory, fileExists, readJsonFile, writeJsonAtomic } from "@/lib/trading/research";

import { createResearchTempDir } from "./helpers/tradingResearchFixtures";

describe("trading research fs", () => {
  it("keeps json writes valid under repeated replacements of the same file", async () => {
    const rootDir = await createResearchTempDir();
    const targetPath = path.join(rootDir, "queue", "research-lock.json");

    await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        writeJsonAtomic(targetPath, {
          index,
          updated_at: `2026-03-21T12:00:0${index}.000Z`,
        }),
      ),
    );

    const saved = await readJsonFile<{ index: number; updated_at: string }>(targetPath);
    expect(saved.updated_at.startsWith("2026-03-21T12:00:0")).toBe(true);
    expect(Number.isInteger(saved.index)).toBe(true);
  });

  it("removes only stale atomic temp files for the same target before writing", async () => {
    const rootDir = await createResearchTempDir();
    const queueDir = path.join(rootDir, "queue");
    const targetPath = path.join(queueDir, "research-lock.json");
    const staleTempPath = `${targetPath}.111.1710000000000.stale.tmp`;
    const freshTempPath = `${targetPath}.222.1710000000001.fresh.tmp`;

    await ensureDirectory(queueDir);
    await writeFile(staleTempPath, '{"stale":true}\n', "utf8");
    await writeFile(freshTempPath, '{"fresh":true}\n', "utf8");

    const staleDate = new Date(Date.now() - 5 * 60_000);
    await utimes(staleTempPath, staleDate, staleDate);

    await writeJsonAtomic(targetPath, {
      status: "healthy",
      updated_at: "2026-07-02T04:30:00.000Z",
    });

    expect(await fileExists(staleTempPath)).toBe(false);
    expect(await fileExists(freshTempPath)).toBe(true);

    const saved = await readJsonFile<{ status: string }>(targetPath);
    expect(saved.status).toBe("healthy");
  });
});
