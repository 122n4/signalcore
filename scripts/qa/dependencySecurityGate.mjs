#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const SEVERITIES = new Set(["info", "low", "moderate", "high", "critical"]);

export const KNOWN_DEV_ONLY_EXCEPTIONS = [
  {
    id: "GHSA-vfj7-8cjw-p6xm",
    vulnerablePackage: "braces",
    expectedRootAdvisories: [
      {
        source: 1240992,
        url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm",
        package: "braces",
        dependency: "braces",
        severity: "high",
        range: "<=3.0.3",
      },
    ],
    expectedFindings: {
      "@next/eslint-plugin-next": {
        severity: "high",
        isDirect: false,
        range: ">=14.3.0-canary.0",
        nodes: { "node_modules/@next/eslint-plugin-next": "16.2.6" },
        fixAvailable: {
          name: "eslint-config-next",
          version: "14.2.35",
          isSemVerMajor: true,
          classification: "NON_ACTIONABLE",
          reason: "npm proposes a major downgrade from eslint-config-next 16.x to 14.x, which regresses the framework lint stack and is not a safe forward remediation.",
        },
      },
      braces: {
        severity: "high",
        isDirect: false,
        range: "*",
        nodes: { "node_modules/braces": "3.0.3" },
        fixAvailable: {
          name: "tailwindcss",
          version: "4.3.3",
          isSemVerMajor: true,
          classification: "NON_ACTIONABLE",
          reason: "npm proposes Tailwind 3 to Tailwind 4, which was tested separately and does not eliminate the eslint-config-next path to braces; it is not a safe remediation for the root advisory in this repository.",
        },
      },
      chokidar: {
        severity: "high",
        isDirect: false,
        range: "2.0.0 - 3.6.0",
        nodes: { "node_modules/chokidar": "3.6.0" },
        fixAvailable: {
          name: "tailwindcss",
          version: "4.3.3",
          isSemVerMajor: true,
          classification: "NON_ACTIONABLE",
          reason: "npm proposes Tailwind 3 to Tailwind 4 solely for this advisory; that migration is not authorized in this policy slice and does not clear all braces reachability.",
        },
      },
      "eslint-config-next": {
        severity: "high",
        isDirect: true,
        range: ">=14.3.0-canary.0",
        nodes: { "node_modules/eslint-config-next": "16.2.6" },
        fixAvailable: {
          name: "eslint-config-next",
          version: "14.2.35",
          isSemVerMajor: true,
          classification: "NON_ACTIONABLE",
          reason: "npm proposes a major downgrade from eslint-config-next 16.x to 14.x, which is not a safe forward remediation.",
        },
      },
      "fast-glob": {
        severity: "high",
        isDirect: false,
        range: "*",
        nodes: {
          "node_modules/fast-glob": "3.3.1",
          "node_modules/tailwindcss/node_modules/fast-glob": "3.3.3",
        },
        fixAvailable: {
          name: "eslint-config-next",
          version: "14.2.35",
          isSemVerMajor: true,
          classification: "NON_ACTIONABLE",
          reason: "npm proposes a major downgrade of eslint-config-next for one path; the other path is Tailwind 3. This is not one coherent safe remediation.",
        },
      },
      micromatch: {
        severity: "high",
        isDirect: false,
        range: ">=0.2.0",
        nodes: { "node_modules/micromatch": "4.0.8" },
        fixAvailable: {
          name: "tailwindcss",
          version: "4.3.3",
          isSemVerMajor: true,
          classification: "NON_ACTIONABLE",
          reason: "npm proposes Tailwind 3 to Tailwind 4, which is a major tooling migration and is not a safe actionable remediation for this policy slice.",
        },
      },
      tailwindcss: {
        severity: "high",
        isDirect: true,
        range: "<=0.0.0-oxide-insiders.ff2c25f || 2.1.0-canary.1 - 3.4.19",
        nodes: { "node_modules/tailwindcss": "3.4.17" },
        fixAvailable: {
          name: "tailwindcss",
          version: "4.3.3",
          isSemVerMajor: true,
          classification: "NON_ACTIONABLE",
          reason: "Tailwind 4 migration was tested as an experiment and did not eliminate the remaining braces advisory path through eslint-config-next.",
        },
      },
    },
  },
];

function stableArray(value) {
  return Array.isArray(value) ? [...value].sort() : [];
}

function sameArray(a, b) {
  const left = stableArray(a);
  const right = stableArray(b);
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function vulnerabilityTotal(audit) {
  return audit?.metadata?.vulnerabilities?.total;
}

function parseAuditJson(text, label) {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") {
      return { ok: false, reason: `${label} audit JSON is not an object` };
    }
    if (!parsed.metadata?.vulnerabilities || typeof parsed.vulnerabilities !== "object") {
      return { ok: false, reason: `${label} audit JSON is missing metadata or vulnerabilities` };
    }
    if (typeof parsed.metadata.vulnerabilities.total !== "number") {
      return { ok: false, reason: `${label} audit JSON is missing vulnerability total` };
    }
    return { ok: true, audit: parsed };
  } catch (error) {
    return { ok: false, reason: `${label} audit JSON is malformed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function runNpmAudit(args) {
  const result = spawnSync("npm", args, {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  const parsed = parseAuditJson(result.stdout, args.includes("--omit=dev") ? "production" : "full");
  const vulnerabilityExit = result.status === 1 && parsed.ok;
  const cleanExit = result.status === 0 && parsed.ok;
  if (!cleanExit && !vulnerabilityExit) {
    return {
      ok: false,
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      reason: parsed.ok
        ? `npm audit execution failed with status ${result.status}`
        : parsed.reason,
    };
  }
  return {
    ok: true,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    audit: parsed.audit,
  };
}

export function renderRawAuditEvidence(label, auditResult) {
  return [
    `RAW_NPM_AUDIT_${label}_BEGIN`,
    `status=${auditResult.status ?? "UNKNOWN"}`,
    "stdout:",
    auditResult.stdout || "",
    "stderr:",
    auditResult.stderr || "",
    `RAW_NPM_AUDIT_${label}_END`,
  ].join("\n");
}

function collectAdvisories(vulnerability) {
  return (vulnerability.via || []).filter((entry) => entry && typeof entry === "object");
}

function nodePackageName(nodePath) {
  const marker = "node_modules/";
  const index = nodePath.lastIndexOf(marker);
  if (index === -1) return nodePath;
  return nodePath.slice(index + marker.length);
}

function installedVersionDataFromLock(lockJsonText) {
  const byNode = new Map();
  const nodesByPackage = new Map();
  const lock = JSON.parse(lockJsonText);
  for (const [nodePath, pkg] of Object.entries(lock.packages || {})) {
    if (!nodePath.startsWith("node_modules/") || !pkg?.version) continue;
    byNode.set(nodePath, pkg.version);
    const name = nodePackageName(nodePath);
    if (!nodesByPackage.has(name)) nodesByPackage.set(name, []);
    nodesByPackage.get(name).push(nodePath);
  }
  return { byNode, nodesByPackage };
}

function advisoryIdentity(advisory) {
  return {
    source: advisory.source,
    url: advisory.url,
    package: advisory.name,
    dependency: advisory.dependency,
    severity: advisory.severity,
    range: advisory.range,
  };
}

function sameAdvisory(actual, expected) {
  return actual.source === expected.source &&
    actual.url === expected.url &&
    actual.package === expected.package &&
    actual.dependency === expected.dependency &&
    actual.severity === expected.severity &&
    actual.range === expected.range;
}

function validateRootAdvisories(fullAudit, exception) {
  const vuln = fullAudit.vulnerabilities?.[exception.vulnerablePackage];
  if (!vuln) return { ok: false, reason: `root vulnerable package ${exception.vulnerablePackage} is absent`, advisories: [] };
  const actual = collectAdvisories(vuln).map(advisoryIdentity);
  const expected = exception.expectedRootAdvisories;
  if (actual.length !== expected.length) {
    return { ok: false, reason: `root advisory count drift: ${actual.length} !== ${expected.length}`, advisories: actual };
  }
  for (const expectedAdvisory of expected) {
    if (!actual.some((entry) => sameAdvisory(entry, expectedAdvisory))) {
      return { ok: false, reason: `root advisory identity drift: ${JSON.stringify(actual)}`, advisories: actual };
    }
  }
  return { ok: true, advisories: actual };
}

function validateFindingNodes(name, expected, vulnerability, versionData) {
  const expectedNodes = Object.keys(expected.nodes);
  const actualAuditNodes = vulnerability.nodes || [];
  if (!sameArray(actualAuditNodes, expectedNodes)) return { ok: false, reason: `${name} dependency node drift` };

  const lockNodes = versionData.nodesByPackage.get(name) || [];
  if (!sameArray(lockNodes, expectedNodes)) {
    return { ok: false, reason: `${name} package-lock node set drift: expected ${expectedNodes.join(",")}; got ${lockNodes.join(",")}` };
  }

  for (const [node, expectedVersion] of Object.entries(expected.nodes)) {
    const installedVersion = versionData.byNode.get(node);
    if (!installedVersion) return { ok: false, reason: `${name} missing package-lock node ${node}` };
    if (installedVersion !== expectedVersion) return { ok: false, reason: `${name} installed version drift at ${node}: ${installedVersion} !== ${expectedVersion}` };
  }
  return { ok: true };
}

function matchingExceptionForFinding(name, vulnerability, exception, versionData) {
  const expected = exception.expectedFindings[name];
  if (!expected) return { ok: false, reason: `finding ${name} is not registered in exception ${exception.id}` };
  if (vulnerability.severity !== expected.severity) return { ok: false, reason: `${name} severity drift: ${vulnerability.severity} !== ${expected.severity}` };
  if (!SEVERITIES.has(vulnerability.severity)) return { ok: false, reason: `${name} has unknown severity ${vulnerability.severity}` };
  if (vulnerability.isDirect !== expected.isDirect) return { ok: false, reason: `${name} directness drift` };
  if (vulnerability.range !== expected.range) return { ok: false, reason: `${name} range drift: ${vulnerability.range} !== ${expected.range}` };
  const nodeMatch = validateFindingNodes(name, expected, vulnerability, versionData);
  if (!nodeMatch.ok) return nodeMatch;

  const expectedFix = expected.fixAvailable;
  const actualFix = vulnerability.fixAvailable;
  if (expectedFix === false || actualFix === false) {
    if (expectedFix !== actualFix) return { ok: false, reason: `${name} fixAvailable representation drift: expected ${JSON.stringify(expectedFix)} got ${JSON.stringify(actualFix)}` };
    return { ok: true, remediation: { classification: "NON_ACTIONABLE", raw: actualFix, reason: "npm reports no fix available." } };
  }
  if (!actualFix || typeof actualFix !== "object" || !expectedFix || typeof expectedFix !== "object") {
    return { ok: false, reason: `${name} has ambiguous fixAvailable representation` };
  }
  if (
    actualFix.name !== expectedFix.name ||
    actualFix.version !== expectedFix.version ||
    Boolean(actualFix.isSemVerMajor) !== Boolean(expectedFix.isSemVerMajor)
  ) {
    return { ok: false, reason: `${name} remediation drift: ${JSON.stringify(actualFix)}` };
  }
  if (expectedFix.classification !== "NON_ACTIONABLE") {
    return { ok: false, reason: `${name} remediation is not classified as non-actionable` };
  }
  return { ok: true, remediation: { classification: expectedFix.classification, raw: actualFix, reason: expectedFix.reason } };
}

export function classifyDependencySecurity({ fullAudit, productionAudit, packageLockJsonText, fullAuditProcessOk = true, productionAuditProcessOk = true }) {
  const findings = [];
  const failures = [];

  if (!fullAuditProcessOk) failures.push("full npm audit did not produce valid complete JSON");
  if (!productionAuditProcessOk) failures.push("production npm audit did not produce valid complete JSON");
  if (!fullAudit || !productionAudit) failures.push("missing audit input");
  if (failures.length) return { finalGate: "FAIL", productionStatus: "UNKNOWN", fullStatus: "UNKNOWN", failures, findings, rootAdvisories: [] };

  const productionTotal = vulnerabilityTotal(productionAudit);
  const fullTotal = vulnerabilityTotal(fullAudit);
  if (typeof productionTotal !== "number" || typeof fullTotal !== "number") failures.push("missing audit metadata totals");
  if (productionTotal > 0) failures.push(`production audit has ${productionTotal} vulnerabilities`);

  let versionData = { byNode: new Map(), nodesByPackage: new Map() };
  try {
    versionData = installedVersionDataFromLock(packageLockJsonText || "{}");
  } catch (error) {
    failures.push(`package-lock JSON is malformed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const fullVulnerabilities = fullAudit.vulnerabilities || {};
  const prodVulnerabilities = productionAudit.vulnerabilities || {};
  for (const [name, vulnerability] of Object.entries(fullVulnerabilities)) {
    if (!SEVERITIES.has(vulnerability.severity)) failures.push(`${name} has unknown severity ${vulnerability.severity}`);
    if (vulnerability.severity === "critical") failures.push(`${name} is critical`);
    if (prodVulnerabilities[name]) failures.push(`${name} is present in production audit`);
  }

  const exception = KNOWN_DEV_ONLY_EXCEPTIONS[0];
  const actualNames = Object.keys(fullVulnerabilities).sort();
  if (actualNames.length === 0) {
    return {
      finalGate: failures.length ? "FAIL" : "PASS",
      productionStatus: productionTotal === 0 ? "PASS" : "FAIL",
      fullStatus: failures.length ? "FAIL" : "PASS",
      failures,
      findings,
      rootAdvisories: [],
      productionTotal,
      fullTotal,
    };
  }

  const expectedNames = Object.keys(exception.expectedFindings).sort();
  if (!sameArray(expectedNames, actualNames)) {
    failures.push(`full audit finding set drift: expected ${expectedNames.join(", ")}; got ${actualNames.join(", ")}`);
  }

  const rootMatch = validateRootAdvisories(fullAudit, exception);
  if (!rootMatch.ok) failures.push(rootMatch.reason);

  for (const [name, vulnerability] of Object.entries(fullVulnerabilities)) {
    const match = matchingExceptionForFinding(name, vulnerability, exception, versionData);
    if (!match.ok) {
      failures.push(match.reason);
      continue;
    }
    findings.push({
      package: name,
      severity: vulnerability.severity,
      direct: Boolean(vulnerability.isDirect),
      range: vulnerability.range,
      nodes: vulnerability.nodes || [],
      fixAvailable: vulnerability.fixAvailable,
      remediation: match.remediation,
      prodReachability: prodVulnerabilities[name] ? "PRODUCTION" : "DEV_ONLY",
    });
  }

  const rootAdvisories = rootMatch.ok ? rootMatch.advisories.map((advisory) => ({
    id: exception.id,
    package: advisory.package,
    severity: advisory.severity,
    range: advisory.range,
    url: advisory.url,
    source: advisory.source,
    dependency: advisory.dependency,
    installedVersion: versionData.byNode.get(`node_modules/${exception.vulnerablePackage}`),
  })) : [];

  if (failures.length) {
    return {
      finalGate: "FAIL",
      productionStatus: productionTotal === 0 ? "PASS" : "FAIL",
      fullStatus: "FAIL",
      failures,
      findings,
      rootAdvisories,
      productionTotal,
      fullTotal,
    };
  }

  return {
    finalGate: fullTotal === 0 ? "PASS" : "PASS_WITH_DEV_ONLY_UNPATCHED",
    productionStatus: "PASS",
    fullStatus: fullTotal === 0 ? "PASS" : "KNOWN_DEV_ONLY_UNPATCHED",
    failures: [],
    findings,
    rootAdvisories,
    productionTotal,
    fullTotal,
  };
}

function formatFinding(finding) {
  return [
    `- package=${finding.package}`,
    `  severity=${finding.severity}`,
    `  direct=${finding.direct}`,
    `  prodReachability=${finding.prodReachability}`,
    `  vulnerableRange=${finding.range}`,
    `  affectedNodes=${finding.nodes.length ? finding.nodes.join(",") : "NONE"}`,
    `  fixAvailable=${JSON.stringify(finding.fixAvailable)}`,
    `  remediation=${finding.remediation.classification}`,
    `  reason=${finding.remediation.reason}`,
  ].join("\n");
}

export function renderSummary(classification) {
  const lines = [];
  lines.push("POLICY_CLASSIFICATION_BEGIN");
  lines.push(`PRODUCTION_DEPENDENCY_AUDIT = ${classification.productionStatus}`);
  lines.push(`PRODUCTION_VULNERABILITY_TOTAL = ${classification.productionTotal ?? "UNKNOWN"}`);
  lines.push(`FULL_DEPENDENCY_AUDIT = ${classification.fullStatus}`);
  lines.push(`FULL_VULNERABILITY_TOTAL = ${classification.fullTotal ?? "UNKNOWN"}`);
  lines.push(`ROOT_ADVISORY_COUNT = ${classification.rootAdvisories.length}`);
  for (const advisory of classification.rootAdvisories) {
    lines.push(`ROOT_ADVISORY ${advisory.id} source=${advisory.source} package=${advisory.package} dependency=${advisory.dependency} severity=${advisory.severity} range=${advisory.range} installed=${advisory.installedVersion} url=${advisory.url}`);
  }
  lines.push(`RESIDUAL_DEV_ONLY_FINDING_COUNT = ${classification.findings.length}`);
  for (const finding of classification.findings) lines.push(formatFinding(finding));
  if (classification.failures.length) {
    lines.push("FAILURES:");
    for (const failure of classification.failures) lines.push(`- ${failure}`);
  }
  lines.push(`DEPENDENCY_SECURITY_GATE = ${classification.finalGate}`);
  lines.push("POLICY_CLASSIFICATION_END");
  return lines.join("\n");
}

function main() {
  const prod = runNpmAudit(["audit", "--omit=dev", "--json"]);
  const full = runNpmAudit(["audit", "--json"]);
  console.log(renderRawAuditEvidence("PRODUCTION", prod));
  console.log(renderRawAuditEvidence("FULL", full));
  const lockText = readFileSync("package-lock.json", "utf8");
  if (!prod.ok || !full.ok) {
    const classification = classifyDependencySecurity({
      fullAudit: full.audit,
      productionAudit: prod.audit,
      packageLockJsonText: lockText,
      fullAuditProcessOk: full.ok,
      productionAuditProcessOk: prod.ok,
    });
    if (!prod.ok) classification.failures.push(prod.reason);
    if (!full.ok) classification.failures.push(full.reason);
    console.log(renderSummary(classification));
    process.exit(1);
  }
  const classification = classifyDependencySecurity({
    fullAudit: full.audit,
    productionAudit: prod.audit,
    packageLockJsonText: lockText,
  });
  console.log(renderSummary(classification));
  process.exit(classification.finalGate.startsWith("PASS") ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("dependencySecurityGate.mjs")) {
  main();
}
