import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function files(root: string): string[] {
  return readdirSync(root)
    .flatMap((entry) => {
      const candidate = path.join(root, entry);
      return statSync(candidate).isDirectory() ? files(candidate) : [candidate];
    });
}

const repositoryRoot = process.cwd();
const applicationRoot = path.join(repositoryRoot, "lib", "investing", "application");
const applicationFiles = files(applicationRoot);
const phase5BInternalConsumers = new Set([
  path.join(repositoryRoot, "lib", "investing", "identity", "contracts.ts"),
  path.join(repositoryRoot, "lib", "investing", "identity", "gateway.server.ts"),
  path.join(repositoryRoot, "lib", "investing", "identity", "ports.ts"),
  path.join(repositoryRoot, "lib", "investing", "paper-caller", "caller.server.ts"),
  path.join(repositoryRoot, "lib", "investing", "paper-caller", "contracts.ts"),
]);
const applicationSource = applicationFiles
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");

function applicationDependencies(file: string): string[] {
  const source = readFileSync(file, "utf8");
  return [...source.matchAll(
    /(?:from\s+|import\s+)["']@\/lib\/investing\/application\/([^"']+)["']/gu,
  )]
    .map((match) => path.join(applicationRoot, `${match[1]}.ts`))
    .filter((candidate) => applicationFiles.includes(candidate));
}

function dependencyClosure(entrypoint: string): string[] {
  const visited = new Set<string>();
  const visit = (file: string) => {
    if (visited.has(file)) return;
    visited.add(file);
    applicationDependencies(file).forEach(visit);
  };
  visit(entrypoint);
  return [...visited];
}

describe("FASE 5A application boundary isolation", () => {
  it("keeps the public contracts free of engine and PostgreSQL internals", () => {
    const contracts = readFileSync(
      path.join(applicationRoot, "contracts.ts"),
      "utf8",
    );
    const publicIndex = readFileSync(path.join(applicationRoot, "index.ts"), "utf8");
    expect(contracts).not.toContain("engine/v1");
    expect(contracts).not.toContain("Pool");
    expect(contracts).not.toContain("connectionString");
    expect(contracts).not.toContain("serviceRole");
    expect(contracts).not.toContain("canonicalPayload");
    expect(publicIndex).not.toContain("ports");
    expect(publicIndex).not.toContain("factory");
    expect(publicIndex).not.toContain("boundary");
  });

  it("marks every real server implementation and exposes one official server entrypoint", () => {
    const server = readFileSync(path.join(applicationRoot, "server.ts"), "utf8");
    const factoryPath = path.join(applicationRoot, "factory.server.ts");
    const factory = readFileSync(factoryPath, "utf8");
    const implementationFiles = applicationFiles.filter((file) => {
      const source = readFileSync(file, "utf8");
      return source.includes("@/lib/investing/engine/v1/persistence")
        && !source.includes("import type { InvestingEnginePersistenceInputV1 }");
    });
    expect(implementationFiles.map((file) => path.basename(file)).sort()).toEqual([
      "boundary.ts",
      "factory.server.ts",
    ]);
    for (const implementationFile of implementationFiles) {
      expect(readFileSync(implementationFile, "utf8").startsWith('import "server-only";'))
        .toBe(true);
    }
    expect(server).toContain('import "server-only"');
    expect(server).toContain("@/lib/investing/application/factory.server");
    expect(statSync(factoryPath).isFile()).toBe(true);
    expect(() => statSync(path.join(applicationRoot, "factory.ts"))).toThrow();
    expect(factory).not.toContain("new Pool");
    expect(factory).not.toContain("process.env");
    expect(factory).not.toContain("connectionString");
    expect(factory).not.toContain("singleton");
    expect(factory).not.toContain("typeof window");
  });

  it("keeps the neutral barrel transitively free of server implementations", () => {
    const publicIndexPath = path.join(applicationRoot, "index.ts");
    const closure = dependencyClosure(publicIndexPath)
      .map((file) => path.basename(file))
      .sort();
    expect(closure).toEqual(["contracts.ts", "errors.ts", "index.ts"]);
    const neutralSource = dependencyClosure(publicIndexPath)
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    for (const forbidden of [
      "server-only",
      "factory.server",
      "application/server",
      "engine/v1/persistence",
      "postgres",
      "process.env",
      "node:",
    ]) {
      expect(neutralSource).not.toContain(forbidden);
    }
  });

  it("has no client component path to the server-only application graph", () => {
    const sourceRoots = ["app", "components", "lib"]
      .map((root) => path.join(repositoryRoot, root))
      .filter((root) => statSync(root).isDirectory());
    const clientViolations = sourceRoots
      .flatMap(files)
      .filter((file) => /\.(?:ts|tsx|js|mjs|cjs)$/u.test(file))
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        const isClient = /^\s*["']use client["'];/u.test(source);
        return isClient && (
          source.includes("@/lib/investing/application/server")
          || source.includes("@/lib/investing/application/factory.server")
          || source.includes("@/lib/investing/application/boundary")
        );
      })
      .map((file) => path.relative(repositoryRoot, file));
    expect(clientViolations).toEqual([]);
  });

  it("uses the official server entrypoint in PostgreSQL coverage", () => {
    const postgresTest = readFileSync(
      path.join(repositoryRoot, "tests", "investingPhase5AApplicationBoundaryPostgres.integration.test.ts"),
      "utf8",
    );
    expect(postgresTest).toContain('from "@/lib/investing/application/server"');
    expect(postgresTest).not.toContain('from "@/lib/investing/application/factory');
  });

  it("contains no SQL mutation, canonical hash construction or alternative manifest", () => {
    const normalized = applicationSource.toLowerCase();
    for (const forbidden of [
      "insert into",
      "update public.",
      "delete from",
      "truncate ",
      "create table",
      "canonicalpersistencesha256",
      "buildinvestingenginepersistencemanifest",
    ]) {
      expect(normalized).not.toContain(forbidden);
    }
    expect(applicationSource).toContain("InvestingEnginePersistenceServiceV1");
    expect(applicationSource).toContain("InvestingEngineReplayServiceV1");
  });

  it("has only the approved 5B and controlled 5C internal callers", () => {
    const roots = ["app", "components", "lib", "scripts"]
      .map((root) => path.join(repositoryRoot, root))
      .filter((root) => {
        try {
          return statSync(root).isDirectory();
        } catch {
          return false;
        }
      });
    const callers = roots
      .flatMap(files)
      .filter((file) => !file.startsWith(applicationRoot))
      .filter((file) => !phase5BInternalConsumers.has(file))
      .filter((file) => /\.(?:ts|tsx|js|mjs|cjs)$/u.test(file))
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return source.includes("@/lib/investing/application")
          || source.includes("lib/investing/application");
      })
      .map((file) => path.relative(repositoryRoot, file));
    expect(callers).toEqual([]);
    const productIndex = readFileSync(
      path.join(repositoryRoot, "lib", "investing", "index.ts"),
      "utf8",
    );
    expect(productIndex).not.toContain("investing/application");
  });

  it("exposes no Paper or Live execution operation", () => {
    const contracts = readFileSync(
      path.join(applicationRoot, "contracts.ts"),
      "utf8",
    );
    expect(contracts).not.toContain("submit_order");
    expect(contracts).not.toContain("place_trade");
    expect(contracts).not.toContain("broker_execution");
    expect(contracts).not.toContain('"live"');
    expect(contracts).not.toContain('"paper"');
    expect(applicationSource).not.toContain("@/lib/trading");
    expect(applicationSource).not.toContain("@/lib/investing/broker");
  });
});
