import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

type GateStep = {
  name: string;
  command: string;
  args: string[];
  required: boolean;
  reportPath: string;
};

type StepResult = {
  name: string;
  ok: boolean;
  required: boolean;
  exitCode: number | null;
  durationMs: number;
  reportPath: string;
  summary: unknown;
};

const envFile = process.env.QA_ENV_FILE || ".env.production.sync";
const outputDir = path.resolve(process.env.QA_OUTPUT_DIR || "artifacts/qa-authenticated-post-deploy");
const reportPath = path.join(outputDir, "authenticated-post-deploy-latest.json");
const node = process.execPath;

fs.mkdirSync(outputDir, { recursive: true });

function loadEnvFile(file: string) {
  if (!file || !fs.existsSync(file)) return;

  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function parseBool(value: unknown, fallback: boolean) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "y"].includes(normalized)) return true;
  if (["0", "false", "no", "n"].includes(normalized)) return false;
  return fallback;
}

function readJsonIfExists(file: string) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function redactedEnv() {
  const safe = { ...process.env };
  for (const key of Object.keys(safe)) {
    if (/key|secret|token|password|authorization/i.test(key)) {
      safe[key] = "[redacted]";
    }
  }
  return safe;
}

function buildSteps(): GateStep[] {
  const tradingOutputDir = path.resolve("artifacts/qa-authenticated-post-deploy/trading");
  const investingOutputDir = path.resolve("artifacts/qa-authenticated-post-deploy/investing");
  const billingOutputDir = path.resolve("artifacts/qa-authenticated-post-deploy/billing");
  fs.mkdirSync(tradingOutputDir, { recursive: true });
  fs.mkdirSync(investingOutputDir, { recursive: true });
  fs.mkdirSync(billingOutputDir, { recursive: true });

  const billingArgs = [
    "-r",
    "./scripts/register-alias.cjs",
    "./node_modules/jiti/bin/jiti.js",
    "scripts/qa/billingPremiumAudit.ts",
    "--fail-on-issues",
  ];
  if (parseBool(process.env.QA_AUTH_FAIL_ON_BILLING_WARNINGS, false)) {
    billingArgs.push("--fail-on-warnings");
  }

  return [
    {
      name: "trading_authenticated",
      command: node,
      args: ["scripts/qa/trading-production-audit.mjs"],
      required: true,
      reportPath: path.join(tradingOutputDir, "report.json"),
    },
    {
      name: "investing_authenticated",
      command: node,
      args: ["scripts/qa/investing-production-audit.mjs"],
      required: true,
      reportPath: path.join(investingOutputDir, "report.json"),
    },
    {
      name: "billing_entitlements",
      command: node,
      args: billingArgs,
      required: parseBool(process.env.QA_AUTH_REQUIRE_BILLING, true),
      reportPath: path.join(billingOutputDir, "report.json"),
    },
  ];
}

function runStep(step: GateStep): Promise<StepResult> {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const child = spawn(step.command, step.args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        QA_ENV_FILE: envFile,
        QA_OUTPUT_DIR: path.dirname(step.reportPath),
      },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      process.stderr.write(chunk);
    });
    child.on("close", (exitCode) => {
      const summary = readJsonIfExists(step.reportPath) ?? {
        stdout: stdout.slice(-3000),
        stderr: stderr.slice(-3000),
      };
      resolve({
        name: step.name,
        ok: exitCode === 0,
        required: step.required,
        exitCode,
        durationMs: Date.now() - startedAt,
        reportPath: step.reportPath,
        summary,
      });
    });
  });
}

async function main() {
  loadEnvFile(envFile);
  const steps = buildSteps();
  const results: StepResult[] = [];

  for (const step of steps) {
    results.push(await runStep(step));
  }

  const failures = results.filter((result) => result.required && !result.ok);
  const warnings = results.filter((result) => !result.required && !result.ok);
  const report = {
    ok: failures.length === 0,
    timestamp: new Date().toISOString(),
    env: redactedEnv(),
    steps: results,
    failures,
    warnings,
    reportPath,
  };

  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    ok: report.ok,
    steps: results.length,
    failures: failures.length,
    warnings: warnings.length,
    reportPath,
  }, null, 2));

  if (!report.ok) process.exitCode = 1;
}

void main().catch((error) => {
  const report = {
    ok: false,
    timestamp: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
    reportPath,
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.error(error);
  process.exitCode = 1;
});
