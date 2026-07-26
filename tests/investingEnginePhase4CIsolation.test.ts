import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const scannerPath = path.resolve(
  process.cwd(),
  "scripts/qa/investingEnginePhase4CIntegrityScanner.ts",
);
const cliPath = path.resolve(
  process.cwd(),
  "scripts/qa/runInvestingEnginePhase4CIntegrityScan.ts",
);
const runtimeScannerPath = path.resolve(
  process.cwd(),
  "lib/investing/engine/v1/integrity/scanner.server.ts",
);

describe("FASE 4C QA isolation", () => {
  it("keeps the scanner outside product exports and operational callers", () => {
    const scanner = readFileSync(scannerPath, "utf8");
    const cli = readFileSync(cliPath, "utf8");
    const productIndex = readFileSync(
      path.resolve(process.cwd(), "lib/investing/index.ts"),
      "utf8",
    );
    const packageJson = readFileSync(path.resolve(process.cwd(), "package.json"), "utf8");

    expect(scanner).not.toContain("app/api");
    expect(scanner).not.toContain("broker");
    expect(scanner).not.toContain("provider");
    expect(scanner).not.toContain("environment: \"live\"");
    expect(cli).toContain("INVESTING_4C_TEST_DATABASE_URL");
    expect(cli).toContain("assertDestructiveInvestingQaDatabase");
    expect(productIndex).not.toContain("Phase4CIntegrity");
    expect(packageJson).not.toContain("phase4c");
  });

  it("contains no mutation statements in scanner SQL", () => {
    const scanner = readFileSync(runtimeScannerPath, "utf8").toLowerCase();
    for (const statement of ["insert into", "update public.", "delete from", "truncate ", "alter table"]) {
      expect(scanner).not.toContain(statement);
    }
    expect(scanner).toContain("repeatable read read only");
    expect(scanner).toContain("transaction_read_only");
    expect(readFileSync(scannerPath, "utf8"))
      .toContain("@/lib/investing/engine/v1/integrity/scanner.server");
  });
});
