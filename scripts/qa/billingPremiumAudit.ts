import { readFile } from "node:fs/promises";
import path from "node:path";

import { buildPremiumAuditReport, normalizeEmailFilter } from "../../lib/billing/premiumAuditService";

function readArg(name: string): string | null {
  const prefix = `--${name}=`;
  const matched = process.argv.find((arg) => arg.startsWith(prefix));
  return matched ? matched.slice(prefix.length) : null;
}

async function loadEnvFile() {
  const envFile = readArg("env") ?? process.env.QA_ENV_FILE ?? ".env.production.sync";
  const targetPath = path.resolve(envFile);
  let raw = "";
  try {
    raw = await readFile(targetPath, "utf8");
  } catch {
    return;
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function configuredEmails(): Set<string> | null {
  return normalizeEmailFilter(readArg("emails") ?? process.env.QA_BILLING_EMAILS);
}

async function main() {
  await loadEnvFile();

  const emails = configuredEmails();
  const limit = Number(readArg("limit") ?? process.env.QA_BILLING_LIMIT ?? 1000);
  const report = await buildPremiumAuditReport({
    emails,
    limit: Number.isFinite(limit) ? limit : 1000,
  });

  console.log(JSON.stringify(report, null, 2));
  if (process.argv.includes("--fail-on-issues") && !report.ok) {
    process.exitCode = 1;
  }
  if (process.argv.includes("--fail-on-warnings") && report.summary.warn > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
