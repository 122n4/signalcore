import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  datasetCompositionConsumerPath,
  datasetCompositionIdentityImportsAccepted,
} from "./support/investingIdentityImportPolicy";

const root = process.cwd();
const identityRoot = path.join(root, "lib", "investing", "identity");

function files(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((entry) => {
    const target = path.join(directory, entry);
    return statSync(target).isDirectory() ? files(target) : [target];
  });
}

describe("Investing FASE 5B server-only isolation", () => {
  const infrastructureRoot = path.join(identityRoot, "infrastructure");
  const approvedInfrastructure = new Set([
    "clerkSession.server.ts",
    "factory.server.ts",
    "postgresDirectory.server.ts",
    "server.ts",
  ].map((name) => path.resolve(infrastructureRoot, name)));
  const approvedInfrastructureWithSqlOrEnvironment = new Set([
    "factory.server.ts",
    "postgresDirectory.server.ts",
    "server.ts",
  ].map((name) => path.resolve(infrastructureRoot, name)));

  it("keeps the neutral entrypoint limited to contracts and errors", () => {
    const index = readFileSync(path.join(identityRoot, "index.ts"), "utf8");
    expect(index).toContain("identity/contracts");
    expect(index).toContain("identity/errors");
    expect(index).not.toMatch(/server|resolver|gateway|factory|ports/u);

    const neutralClosure = ["index.ts", "contracts.ts", "errors.ts"]
      .map((name) => readFileSync(path.join(identityRoot, name), "utf8"))
      .join("\n");
    expect(neutralClosure).not.toMatch(
      /server-only|process\.env|node:|persistence|postgres|application\/server/u,
    );
  });

  it("marks every real identity and authorization module server-only", () => {
    for (const name of [
      "server.ts",
      "factory.server.ts",
      "resolver.server.ts",
      "gateway.server.ts",
    ]) {
      const source = readFileSync(path.join(identityRoot, name), "utf8");
      expect(source.startsWith('import "server-only";')).toBe(true);
    }
  });

  it("has no Client Component path to identity, application or persistence", () => {
    const sourceRoots = ["app", "components", "lib"]
      .map((entry) => path.join(root, entry))
      .flatMap(files)
      .filter((file) => /\.[jt]sx?$/u.test(file));
    const clients = sourceRoots.filter((file) =>
      /^\s*["']use client["'];?/u.test(readFileSync(file, "utf8")));
    const forbidden = [
      "investing/identity/server",
      "investing/identity/factory.server",
      "investing/identity/resolver.server",
      "investing/identity/gateway.server",
      "investing/identity/infrastructure",
      "investing/application/server",
      "investing/engine/v1/persistence",
    ];
    for (const file of clients) {
      const source = readFileSync(file, "utf8");
      forbidden.forEach((entry) => expect(source).not.toContain(entry));
    }
  });

  it("allows only the controlled internal Phase 5C and 5D consumers", () => {
    const paperCallerRoot = path.join(root, "lib", "investing", "paper-caller");
    const identityFiles = new Set(files(identityRoot).map((file) => path.resolve(file)));
    const allowed = new Set([
      ...files(paperCallerRoot).map((file) => path.resolve(file)),
      ...[
        "adapter.server.ts",
        "contracts.ts",
        "factory.server.ts",
        "ports.ts",
        "service.server.ts",
      ].map((name) => path.resolve(root, "lib", "investing", "ops", name)),
      path.resolve(root, "lib", "investing", "ops", "infrastructure", "factory.server.ts"),
      path.resolve(root, "lib", "investing", "ops", "infrastructure", "postgresReadModel.server.ts"),
      path.resolve(root, "lib", "investing", "ops", "infrastructure", "projections.server.ts"),
      datasetCompositionConsumerPath(root),
      path.resolve(root, "lib", "investing", "research", "dataset-quality", "composition.server.ts"),
      path.resolve(root, "lib", "investing", "research", "hypotheses", "composition.server.ts"),
      path.resolve(root, "lib", "investing", "research", "backtesting", "composition.server.ts"),
    ]);
    const candidates = ["app", "components", "lib", "scripts"]
      .map((entry) => path.join(root, entry))
      .flatMap(files)
      .filter((file) => /\.[cm]?[jt]sx?$/u.test(file))
      .filter((file) => !identityFiles.has(path.resolve(file)));
    const callers = candidates.filter((file) => {
      const source = readFileSync(file, "utf8");
      return source.includes("investing/identity")
        || source.includes("createInvestingIdentityGatewayV1");
    });
    expect(callers.length).toBeGreaterThan(0);
    callers.forEach((file) => {
      const resolved = path.resolve(file);
      expect(allowed.has(resolved)).toBe(true);
      if (resolved === datasetCompositionConsumerPath(root)) {
        expect(datasetCompositionIdentityImportsAccepted({
          root,
          consumerPath: resolved,
          source: readFileSync(file, "utf8"),
        })).toBe(true);
      }
    });
    const datasetComposition = datasetCompositionConsumerPath(root);
    if (existsSync(datasetComposition)) {
      expect(datasetCompositionIdentityImportsAccepted({
        root,
        consumerPath: datasetComposition,
        source: readFileSync(datasetComposition, "utf8"),
      })).toBe(true);
    }
  });

  it("contains no SQL, environment access or alternate engine service", () => {
    const infrastructureFiles = files(infrastructureRoot)
      .map((file) => path.resolve(file));
    expect(new Set(infrastructureFiles)).toEqual(approvedInfrastructure);

    const implementation = files(identityRoot)
      .filter((file) =>
        !approvedInfrastructureWithSqlOrEnvironment.has(path.resolve(file)))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    expect(implementation).not.toMatch(
      /\b(select|insert|update|delete)\s+(?:from|into|public\.)|process\.env|new Pool|createClient/u,
    );
    expect(implementation).not.toMatch(
      /new InvestingEngine|PostgresInvesting|canonicalize|VerifierV1|ReplayServiceV1/u,
    );

    for (const file of infrastructureFiles) {
      expect(readFileSync(file, "utf8").startsWith('import "server-only";'))
        .toBe(true);
    }
  });
});
