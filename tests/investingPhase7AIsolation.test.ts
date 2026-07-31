import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.join(process.cwd(), "lib/investing/research/readiness");

describe("Phase 7A isolation", () => {
  it("has no browser, broker, execution, trading, database or mutation dependency", () => {
    const source = fs.readdirSync(root)
      .filter((name) => ["types.ts", "evaluator.server.ts", "index.ts"].includes(name))
      .map((name) => fs.readFileSync(path.join(root, name), "utf8"))
      .join("\n");
    expect(source).not.toMatch(/from\s+["'][^"']*(?:broker|trading|execution|postgres|supabase)/u);
    expect(source).not.toMatch(/\b(?:fetch|window|document|localStorage)\b/u);
    expect(source).not.toMatch(/\b(?:query|insert|upsert|delete|submit|promote)\s*\(/iu);
  });

  it("keeps node crypto behind the server-only boundary", () => {
    const evaluator = fs.readFileSync(path.join(root, "evaluator.server.ts"), "utf8");
    const publicIndex = fs.readFileSync(path.join(root, "index.ts"), "utf8");
    expect(evaluator).toMatch(/^import "server-only";/u);
    expect(evaluator).toContain('from "node:crypto"');
    expect(publicIndex).not.toContain("evaluator.server");
  });
});
