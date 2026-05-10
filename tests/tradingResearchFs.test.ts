import path from "node:path";

import { describe, expect, it } from "vitest";

import { readJsonFile, writeJsonAtomic } from "@/lib/trading/research";

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
});
