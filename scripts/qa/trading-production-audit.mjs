import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const base = (process.env.QA_BASE_URL || "https://signalcore.vercel.app").replace(/\/$/, "");
const outputDir = path.resolve(process.env.QA_OUTPUT_DIR || "artifacts/qa-trading-prod");
const reportPath = path.join(outputDir, "report.json");
const expectedReason = "trading_daily_bundle_rebuild_pending";
const expectedHumanReason = "Trading daily bundle is reduced while legacy capital runtime is purged.";

fs.mkdirSync(outputDir, { recursive: true });

const report = {
  ok: false,
  timestamp: new Date().toISOString(),
  environment: "TEST_DEMO",
  base,
  runtimeState: "UNKNOWN",
  auth: {
    method: null,
    authenticated: false,
    paid: false,
  },
  checks: [],
  failures: [],
};

function pass(name, details = null) {
  report.checks.push({ name, ok: true, details });
}

function fail(name, details = null) {
  report.checks.push({ name, ok: false, details });
  report.failures.push({ name, details });
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function absoluteUrl(route) {
  return `${base}${route.startsWith("/") ? route : `/${route}`}`;
}

async function callApi(page, route) {
  return page.evaluate(async (apiRoute) => {
    const response = await fetch(apiRoute, { cache: "no-store" });
    const text = await response.text();
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
    return { status: response.status, ok: response.ok, payload };
  }, route);
}

function assertCanonicalBlockedBundle(name, result) {
  const payload = result?.payload;
  const checks = {
    status503: result?.status === 503,
    okFalse: payload?.ok === false,
    degradedTrue: payload?.degraded === true,
    degradedReason: payload?.degradedReason === expectedReason,
    modeTrading: payload?.mode === "trading",
    dailyUnavailable: payload?.daily?.status === "unavailable",
    dailyReason: payload?.daily?.reason === expectedHumanReason,
    opportunitiesEmpty:
      Array.isArray(payload?.daily?.opportunities) && payload.daily.opportunities.length === 0,
    topOpportunitiesEmpty:
      Array.isArray(payload?.daily?.top_opportunities) && payload.daily.top_opportunities.length === 0,
    derivedUnavailable: payload?.derived?.status === "unavailable",
  };

  const failed = Object.entries(checks)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (failed.length > 0) {
    fail(name, { status: result?.status ?? null, failed });
    return false;
  }

  pass(name, {
    status: 503,
    degradedReason: expectedReason,
    state: "BLOCKED_REBUILD_PENDING",
  });
  return true;
}

async function resolveQaUserId(client) {
  const explicit = [
    process.env.QA_CLERK_USER_ID,
    process.env.SC_OWNER_USER_ID,
    ...String(process.env.SC_OWNER_USER_IDS || "")
      .split(",")
      .map((value) => value.trim()),
  ]
    .map((value) => String(value || "").trim())
    .find(Boolean);

  if (explicit) return explicit;

  const email = String(process.env.QA_CLERK_EMAIL || "").trim();
  if (!email) return null;
  const users = await client.users.getUserList({ emailAddress: [email], limit: 1 });
  return users?.data?.[0]?.id || null;
}

async function setupClerkTestSession(context, page) {
  const signInUrl = String(process.env.QA_SIGN_IN_URL || "").trim();
  if (signInUrl) {
    report.auth.method = "QA_SIGN_IN_URL";
    await page.goto(signInUrl, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForURL(/\/app|\/pricing/, { timeout: 60_000 }).catch(() => null);
    return;
  }

  const secretKey = String(process.env.CLERK_SECRET_KEY || "").trim();
  if (!secretKey.startsWith("sk_test_")) {
    throw new Error(
      "Canonical Trading TEST/DEMO audit requires a Clerk TEST secret or an explicit QA_SIGN_IN_URL.",
    );
  }

  const { createClerkClient } = await import("@clerk/backend");
  const client = createClerkClient({ secretKey });
  const userId = await resolveQaUserId(client);
  if (!userId) {
    throw new Error("Canonical Trading TEST/DEMO audit could not resolve a QA user.");
  }

  const signInToken = await client.signInTokens.createSignInToken({
    userId,
    expiresInSeconds: 300,
  });
  const testingToken = await client.testingTokens.createTestingToken();
  const frontendApi = new URL(signInToken.url).host;
  if (!frontendApi || !testingToken?.token || !signInToken?.token) {
    throw new Error("Clerk TEST session bootstrap is incomplete.");
  }

  const apiUrl = new RegExp(`^https://${escapeRegex(frontendApi)}/v1/.*?(\\?.*)?$`);
  const retryableStatuses = new Set([429, 502, 503, 504]);

  await context.route(apiUrl, async (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set("__clerk_testing_token", testingToken.token);

    for (let attempt = 0; attempt <= 3; attempt += 1) {
      try {
        const response = await route.fetch({ url: url.toString() });
        const status = response.status();
        if (retryableStatuses.has(status) && attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
          continue;
        }

        const contentType = String(response.headers()["content-type"] || "");
        if (!contentType.includes("application/json")) {
          await route.fulfill({ response });
          return;
        }

        const json = await response.json();
        if (json?.response?.captcha_bypass === false) json.response.captcha_bypass = true;
        if (json?.client?.captcha_bypass === false) json.client.captcha_bypass = true;
        await route.fulfill({ response, json });
        return;
      } catch (error) {
        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
          continue;
        }
        throw error;
      }
    }
  });

  await page.goto(absoluteUrl("/"), { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForFunction(() => window.Clerk !== undefined && window.Clerk.loaded === true);
  await page.evaluate(async (ticket) => {
    const clerk = window.Clerk;
    if (!clerk?.client) throw new Error("Clerk client is not loaded.");
    const result = await clerk.client.signIn.create({ strategy: "ticket", ticket });
    if (result.status !== "complete" || !result.createdSessionId) {
      throw new Error(`Clerk TEST ticket sign-in failed with status ${result.status}.`);
    }
    await clerk.setActive({ session: result.createdSessionId });
  }, signInToken.token);
  await page.waitForFunction(() => Boolean(window.Clerk?.user && window.Clerk?.session));
  await page.waitForTimeout(300);
  report.auth.method = "CLERK_TEST_TICKET";
}

async function main() {
  const browser = await chromium.launch({ headless: process.env.QA_HEADLESS !== "0" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  try {
    await setupClerkTestSession(context, page);

    const me = await callApi(page, "/api/me");
    report.auth.authenticated = me.status === 200 && me.payload?.isAuthenticated === true;
    report.auth.paid = Boolean(me.payload?.isPaid || me.payload?.hasProAccess);

    if (report.auth.authenticated) pass("authenticated_me", { status: me.status });
    else fail("authenticated_me", { status: me.status });

    if (report.auth.paid) pass("paid_pro_qa_identity");
    else fail("paid_pro_qa_identity");

    const normal = await callApi(page, "/api/daily-bundle?mode=trading");
    const normalBlocked = assertCanonicalBlockedBundle("trading_daily_bundle_blocked", normal);

    const forced = await callApi(
      page,
      "/api/daily-bundle?mode=trading&tradingRefresh=live",
    );
    const forcedBlocked = assertCanonicalBlockedBundle("trading_force_live_blocked", forced);

    if (normalBlocked && forcedBlocked) {
      report.runtimeState = "BLOCKED_REBUILD_PENDING";
    }
  } finally {
    await browser.close().catch(() => null);
  }

  report.ok = report.failures.length === 0 && report.runtimeState === "BLOCKED_REBUILD_PENDING";
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        ok: report.ok,
        environment: report.environment,
        runtimeState: report.runtimeState,
        failures: report.failures.length,
        checks: report.checks.length,
        reportPath,
      },
      null,
      2,
    ),
  );

  if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
  fail("audit_exception", { message: error instanceof Error ? error.message : String(error) });
  report.ok = false;
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
