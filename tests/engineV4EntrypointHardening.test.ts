import { readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const engineV4Dir = join(process.cwd(), "lib", "engine", "v4");
const entrypointPath = join(engineV4Dir, "index.ts");

const intentionallyParkedStubModules = [
  "aggression.ts",
  "candidates.ts",
  "learning/edgeConfidence.ts",
  "learning/weights.ts",
  "portfolio/construction.ts",
  "portfolio/leaks.ts",
  "proofs/confirmedMoney.ts",
  "proofs/policy.ts",
  "regime/quality.ts",
  "regime/regime.ts",
  "risk/caps.ts",
  "risk/drawdown.ts",
  "risk/killSwitch.ts",
  "scoring.ts",
  "selector.ts",
];

function toImportPath(filePath: string) {
  return `./${filePath.replace(/\.ts$/, "").split(sep).join("/")}`;
}

describe("engine v4 entrypoint hardening", () => {
  it("does not import parked stub modules from the canonical v4 entrypoint", () => {
    const entrypoint = readFileSync(entrypointPath, "utf8");

    for (const stubFile of intentionallyParkedStubModules) {
      const importPath = toImportPath(stubFile);
      expect(entrypoint, `${relative(process.cwd(), entrypointPath)} must not import ${importPath}`).not.toContain(
        importPath,
      );
    }
  });

  it("keeps default v4 backed by implemented engine modules", () => {
    const entrypoint = readFileSync(entrypointPath, "utf8");

    for (const implementedModule of ["./loopStage", "./priority", "./governors", "./hash", "./trace", "./types"]) {
      expect(entrypoint).toContain(implementedModule);
    }
  });
});
