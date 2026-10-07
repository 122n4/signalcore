import { describe, expect, it } from "vitest";
import { classifyDependencySecurity } from "../scripts/qa/dependencySecurityGate.mjs";

const lock = JSON.stringify({
  packages: {
    "": { name: "fixture" },
    "node_modules/braces": { version: "3.0.3" },
  },
});

function prodAudit(vulnerabilities: Record<string, any> = {}) {
  return {
    auditReportVersion: 2,
    vulnerabilities,
    metadata: {
      vulnerabilities: {
        info: 0,
        low: 0,
        moderate: 0,
        high: Object.keys(vulnerabilities).length,
        critical: 0,
        total: Object.keys(vulnerabilities).length,
      },
    },
  };
}

function knownFullAudit(overrides: Record<string, any> = {}) {
  const vulnerabilities: Record<string, any> = {
    "@next/eslint-plugin-next": {
      name: "@next/eslint-plugin-next",
      severity: "high",
      isDirect: false,
      via: ["fast-glob"],
      effects: ["eslint-config-next"],
      range: ">=14.3.0-canary.0",
      nodes: ["node_modules/@next/eslint-plugin-next"],
      fixAvailable: { name: "eslint-config-next", version: "14.2.35", isSemVerMajor: true },
    },
    braces: {
      name: "braces",
      severity: "high",
      isDirect: false,
      via: [{ source: 1240992, name: "braces", dependency: "braces", url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm", severity: "high", range: "<=3.0.3" }],
      effects: ["chokidar", "micromatch"],
      range: "*",
      nodes: ["node_modules/braces"],
      fixAvailable: { name: "tailwindcss", version: "4.3.3", isSemVerMajor: true },
    },
    chokidar: {
      name: "chokidar",
      severity: "high",
      isDirect: false,
      via: ["braces"],
      effects: ["tailwindcss"],
      range: "2.0.0 - 3.6.0",
      nodes: ["node_modules/chokidar"],
      fixAvailable: { name: "tailwindcss", version: "4.3.3", isSemVerMajor: true },
    },
    "eslint-config-next": {
      name: "eslint-config-next",
      severity: "high",
      isDirect: true,
      via: ["@next/eslint-plugin-next"],
      effects: [],
      range: ">=14.3.0-canary.0",
      nodes: ["node_modules/eslint-config-next"],
      fixAvailable: { name: "eslint-config-next", version: "14.2.35", isSemVerMajor: true },
    },
    "fast-glob": {
      name: "fast-glob",
      severity: "high",
      isDirect: false,
      via: ["micromatch"],
      effects: ["@next/eslint-plugin-next"],
      range: "*",
      nodes: ["node_modules/fast-glob", "node_modules/tailwindcss/node_modules/fast-glob"],
      fixAvailable: { name: "eslint-config-next", version: "14.2.35", isSemVerMajor: true },
    },
    micromatch: {
      name: "micromatch",
      severity: "high",
      isDirect: false,
      via: ["braces"],
      effects: ["fast-glob", "tailwindcss"],
      range: ">=0.2.0",
      nodes: ["node_modules/micromatch"],
      fixAvailable: { name: "tailwindcss", version: "4.3.3", isSemVerMajor: true },
    },
    tailwindcss: {
      name: "tailwindcss",
      severity: "high",
      isDirect: true,
      via: ["chokidar", "fast-glob", "micromatch"],
      effects: [],
      range: "<=0.0.0-oxide-insiders.ff2c25f || 2.1.0-canary.1 - 3.4.19",
      nodes: ["node_modules/tailwindcss"],
      fixAvailable: { name: "tailwindcss", version: "4.3.3", isSemVerMajor: true },
    },
  };

  for (const [name, patch] of Object.entries(overrides)) {
    if (patch === null) delete vulnerabilities[name];
    else vulnerabilities[name] = { ...(vulnerabilities[name] || {}), ...patch };
  }

  return {
    auditReportVersion: 2,
    vulnerabilities,
    metadata: {
      vulnerabilities: {
        info: 0,
        low: 0,
        moderate: 0,
        high: Object.keys(vulnerabilities).length,
        critical: 0,
        total: Object.keys(vulnerabilities).length,
      },
    },
  };
}

function classify(fullAudit: any, productionAudit: any = prodAudit(), packageLockJsonText = lock, processOk = true) {
  return classifyDependencySecurity({
    fullAudit,
    productionAudit,
    packageLockJsonText,
    fullAuditProcessOk: processOk,
    productionAuditProcessOk: processOk,
  });
}

describe("dependency security gate", () => {
  it("passes when production and full audits are clean", () => {
    const result = classify(prodAudit());
    expect(result.finalGate).toBe("PASS");
  });

  it("passes the exact known dev-only residual state", () => {
    const result = classify(knownFullAudit());
    expect(result.finalGate).toBe("PASS_WITH_DEV_ONLY_UNPATCHED");
    expect(result.rootAdvisories).toHaveLength(1);
    expect(result.findings).toHaveLength(7);
  });

  it("fails unknown vulnerability", () => {
    const result = classify(knownFullAudit({ fictional: { name: "fictional", severity: "high", isDirect: false, via: [], range: "*", nodes: ["node_modules/fictional"], fixAvailable: false } }));
    expect(result.finalGate).toBe("FAIL");
  });

  it("fails critical vulnerability", () => {
    const result = classify(knownFullAudit({ braces: { severity: "critical", via: [{ source: 1240992, url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm", severity: "critical", range: "<=3.0.3" }] } }));
    expect(result.finalGate).toBe("FAIL");
  });

  it("fails production vulnerability", () => {
    const result = classify(knownFullAudit(), prodAudit({ braces: knownFullAudit().vulnerabilities.braces }));
    expect(result.finalGate).toBe("FAIL");
  });

  it("fails advisory severity drift", () => {
    const result = classify(knownFullAudit({ braces: { via: [{ source: 1240992, url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm", severity: "moderate", range: "<=3.0.3" }] } }));
    expect(result.finalGate).toBe("FAIL");
  });

  it("fails dependency path drift", () => {
    const result = classify(knownFullAudit({ micromatch: { nodes: ["node_modules/other/node_modules/micromatch"] } }));
    expect(result.finalGate).toBe("FAIL");
  });

  it("fails exact exception mismatch", () => {
    const result = classify(knownFullAudit({ tailwindcss: { range: "<4" } }));
    expect(result.finalGate).toBe("FAIL");
  });

  it("fails when a safe or unexpected remediation appears", () => {
    const result = classify(knownFullAudit({ braces: { fixAvailable: { name: "braces", version: "3.0.4", isSemVerMajor: false } } }));
    expect(result.finalGate).toBe("FAIL");
  });

  it("fails malformed audit input", () => {
    const result = classifyDependencySecurity({
      fullAudit: undefined,
      productionAudit: prodAudit(),
      packageLockJsonText: lock,
      fullAuditProcessOk: false,
      productionAuditProcessOk: true,
    });
    expect(result.finalGate).toBe("FAIL");
  });

  it("fails audit command failure", () => {
    const result = classify(knownFullAudit(), prodAudit(), lock, false);
    expect(result.finalGate).toBe("FAIL");
  });
});
