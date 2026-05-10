import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { fetchClerkBillingUsers, primaryBillingEmail } from "../../lib/billing/premiumAuditService";

function readArg(name: string): string | null {
  const prefix = `--${name}=`;
  const matched = process.argv.find((arg) => arg.startsWith(prefix));
  return matched ? matched.slice(prefix.length) : null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
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

function redactMetadata(metadata: Record<string, unknown>) {
  return {
    isPaid: metadata.isPaid ?? null,
    paidSource: metadata.paidSource ?? null,
    paidStatus: metadata.paidStatus ?? null,
    stripeCustomerId: metadata.stripeCustomerId ? "[present]" : null,
    stripeSubscriptionId: metadata.stripeSubscriptionId ? "[present]" : null,
    trialStartedAt: metadata.trialStartedAt ?? null,
    trialEndsAt: metadata.trialEndsAt ?? null,
  };
}

async function patchClerkPublicMetadata(userId: string, publicMetadata: Record<string, unknown>) {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) {
    throw new Error("Missing CLERK_SECRET_KEY.");
  }

  const response = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      public_metadata: publicMetadata,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Clerk metadata patch failed (${response.status}): ${body.slice(0, 500)}`);
  }

  return response.json() as Promise<unknown>;
}

async function main() {
  await loadEnvFile();

  const email = String(readArg("email") ?? "").trim().toLowerCase();
  const reason = String(readArg("reason") ?? "manual premium metadata correction").trim();
  const apply = hasFlag("apply");
  const allowStripe = hasFlag("allow-stripe");

  if (!email) {
    throw new Error("Missing --email=<address>.");
  }

  const users = await fetchClerkBillingUsers({ limit: 1000 });
  const user = users.find((candidate) => primaryBillingEmail(candidate)?.toLowerCase() === email);
  if (!user) {
    throw new Error(`No Clerk user found for ${email}.`);
  }

  const current = user.public_metadata && typeof user.public_metadata === "object"
    ? user.public_metadata
    : {};
  const paidSource = String(current.paidSource ?? "").trim();
  const hasStripeLink = Boolean(current.stripeCustomerId || current.stripeSubscriptionId || paidSource === "stripe");
  if (hasStripeLink && !allowStripe) {
    throw new Error("Refusing to revoke a Stripe-linked premium user without --allow-stripe.");
  }

  const now = new Date().toISOString();
  const nextPublicMetadata: Record<string, unknown> = {
    ...current,
    isPaid: false,
    paidStatus: "manual_revoked",
    paidSource: "manual_revoked",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    premiumRevokedAt: now,
    premiumRevokedReason: reason,
    premiumRevokedBy: "qa:billing:fix-premium",
  };

  if (current.trialStartedAt || current.trialEndsAt) {
    nextPublicMetadata.trialEndsAt = now;
    nextPublicMetadata.trialRevokedAt = now;
  }

  const report = {
    ok: true,
    apply,
    generatedAt: now,
    userId: user.id,
    email,
    reason,
    before: redactMetadata(current),
    after: redactMetadata(nextPublicMetadata),
  };

  if (apply) {
    await patchClerkPublicMetadata(user.id, nextPublicMetadata);
  }

  const outputDir = path.resolve("artifacts/qa-billing");
  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `premium-metadata-fix-${email.replace(/[^a-z0-9]+/g, "-")}-${apply ? "applied" : "dry-run"}.json`);
  await writeFile(outputPath, `${JSON.stringify({ ...report, outputPath }, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({ ...report, outputPath }, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
