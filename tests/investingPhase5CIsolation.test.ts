import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const callerRoot = path.join(root, "lib", "investing", "paper-caller");

function files(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((entry) => {
    const target = path.join(directory, entry);
    return statSync(target).isDirectory() ? files(target) : [target];
  });
}

describe("Investing FASE 5C Paper caller isolation", () => {
  it("keeps the neutral entrypoint contracts-only and browser-safe", () => {
    const index = readFileSync(path.join(callerRoot, "index.ts"), "utf8");
    expect(index).toContain("paper-caller/contracts");
    expect(index).not.toMatch(/\/server|factory|\/ports|\/errors/u);
    const closure = ["index.ts", "contracts.ts"]
      .map((name) => readFileSync(path.join(callerRoot, name), "utf8"))
      .join("\n");
    expect(closure).not.toMatch(
      /server-only|process\.env|node:|persistence|postgres|application\/server/u,
    );
  });

  it("marks every implementation entrypoint server-only", () => {
    for (const name of ["server.ts", "factory.server.ts", "caller.server.ts"]) {
      expect(
        readFileSync(path.join(callerRoot, name), "utf8")
          .startsWith('import "server-only";'),
      ).toBe(true);
    }
  });

  it("contains no SQL, environment access or alternate engine machinery", () => {
    const implementation = files(callerRoot)
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    expect(implementation).not.toMatch(
      /\b(select|insert|update|delete)\s+(?:from|into|public\.)|process\.env|new Pool|createClient/u,
    );
    expect(implementation).not.toMatch(
      /new InvestingEngine|PostgresInvesting|canonicalize|VerifierV1|ReplayServiceV1/u,
    );
  });

  it("has no public, UI, script, cron, queue, worker or Trading Paper caller", () => {
    const allowed = new Set(files(callerRoot).map((file) => path.resolve(file)));
    const candidates = ["app", "components", "lib", "scripts"]
      .map((entry) => path.join(root, entry))
      .flatMap(files)
      .filter((file) => /\.[cm]?[jt]sx?$/u.test(file))
      .filter((file) => !allowed.has(path.resolve(file)));
    const callers = candidates.filter((file) => {
      const source = readFileSync(file, "utf8");
      return source.includes("investing/paper-caller")
        || source.includes("createInvestingPaperCallerV1");
    });
    expect(callers).toEqual([]);
    expect(files(callerRoot).join("\n")).not.toMatch(/[\\/]trading[\\/]/iu);
  });

  it("has no Client Component path to the Paper caller server", () => {
    const clients = ["app", "components", "lib"]
      .map((entry) => path.join(root, entry))
      .flatMap(files)
      .filter((file) => /\.[jt]sx?$/u.test(file))
      .filter((file) => /^\s*["']use client["'];?/u.test(readFileSync(file, "utf8")));
    for (const file of clients) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toContain("investing/paper-caller/server");
      expect(source).not.toContain("investing/paper-caller/factory.server");
      expect(source).not.toContain("investing/paper-caller/caller.server");
    }
  });
});
