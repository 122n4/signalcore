import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const rolloutRoot = path.resolve(root, "lib/investing/rollout");
const exactRolloutFiles = new Set([
  path.resolve(rolloutRoot, "gate.server.ts"),
  path.resolve(rolloutRoot, "policy.server.ts"),
]);

function files(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((entry) => {
    const target = path.resolve(directory, entry);
    return statSync(target).isDirectory() ? files(target) : [target];
  });
}

describe("FASE 5F rollout isolation", () => {
  it("uses a closed literal server-only rollout allowlist", () => {
    expect(new Set(files(rolloutRoot))).toEqual(exactRolloutFiles);
    for (const file of exactRolloutFiles) {
      expect(readFileSync(file, "utf8").startsWith('import "server-only";')).toBe(true);
    }
  });

  it("has one gate consumer and keeps neutral entrypoints server-safe", () => {
    const candidates = ["app", "components", "lib", "scripts"]
      .map((entry) => path.resolve(root, entry))
      .flatMap(files)
      .filter((file) => /\.[cm]?[jt]sx?$/u.test(file))
      .filter((file) => !exactRolloutFiles.has(path.resolve(file)));
    const consumers = candidates.filter((file) =>
      readFileSync(file, "utf8").includes("investing/rollout/gate.server"));
    expect(consumers.map((file) => path.resolve(file))).toEqual([
      path.resolve(root, "lib/investing/ui/server/loader.server.ts"),
    ]);
    for (const entrypoint of [
      path.resolve(root, "lib/investing/ui/index.ts"),
      path.resolve(root, "lib/investing/ops/index.ts"),
      path.resolve(root, "lib/investing/identity/index.ts"),
    ]) {
      expect(readFileSync(entrypoint, "utf8")).not.toMatch(/rollout|INVESTING_ROLLOUT/u);
    }
  });

  it("keeps rollout configuration out of Client Components", () => {
    const clients = ["app", "components", "lib"]
      .map((entry) => path.resolve(root, entry))
      .flatMap(files)
      .filter((file) => /\.[cm]?[jt]sx?$/u.test(file))
      .filter((file) => /^\s*["']use client["'];?/u.test(readFileSync(file, "utf8")));
    for (const client of clients) {
      expect(readFileSync(client, "utf8")).not.toMatch(
        /INVESTING_ROLLOUT|investing\/rollout|allowedUserIds|rollout_denied|feature_disabled/u,
      );
    }
  });

  it("contains no override channel, wildcard, logging, SQL or parallel runtime", () => {
    const source = [...exactRolloutFiles]
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    expect(source).not.toMatch(/headers?|cookies?|query|formData|body|localStorage/iu);
    expect(source).not.toMatch(/console\.|logger|select\s|insert\s|update\s|delete\s|new Pool/iu);
    expect(source).not.toMatch(/createProductionInvestingOpsRuntimeV1|service_role/iu);
    expect(source).not.toMatch(/includes\(|startsWith\(|RegExp\(/u);
  });

  it("adds no API, worker, queue, cron, provider or background execution", () => {
    const source = [...exactRolloutFiles]
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    expect(source).not.toMatch(
      /\b(worker|queue|cron|provider|background|shadow replay|paper|trading|telemetry)\b/iu,
    );
    expect(files(path.resolve(root, "app/investing"))
      .some((file) => /route\.[cm]?[jt]s$/u.test(file))).toBe(false);
  });
});
