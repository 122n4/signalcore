import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const base = (process.env.QA_BASE_URL || "https://www.syntrake.com").replace(/\/$/, "");
const envFile = process.env.QA_ENV_FILE || "";
const outputDir = path.resolve(process.env.QA_OUTPUT_DIR || "artifacts/qa-trading-prod");
const reportPath = path.join(outputDir, "report.json");
const headless = process.env.QA_HEADLESS !== "0";
const requirePaid = process.env.QA_REQUIRE_PAID !== "0";
const snapshotMaxAgeMs = Number(process.env.QA_TRADING_MAX_SNAPSHOT_AGE_MS || 5 * 60 * 1000);

fs.mkdirSync(outputDir, { recursive: true });

if (envFile && fs.existsSync(envFile)) {
  const text = fs.readFileSync(envFile, "utf8");
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

const report = {
  ok: false,
  timestamp: new Date().toISOString(),
  base,
  auth: {
    method: null,
    authenticated: false,
    paid: null,
    finalUrl: null,
  },
  metrics: {
    watchlistCount: 0,
    openMarketCount: 0,
    staleOpenAllowedCount: 0,
    coverage: null,
    focusInstrument: null,
  },
  pages: [],
  apis: [],
  failures: [],
  warnings: [],
  errors: {
    console: [],
    pageErrors: [],
    requestFailed: [],
    badResponses: [],
  },
  screenshots: [],
};

function pushLimited(list, item, limit = 100) {
  if (list.length < limit) list.push(item);
}

function cleanText(value, limit = 900) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function redactUrl(value) {
  try {
    const url = new URL(String(value));
    for (const key of Array.from(url.searchParams.keys())) {
      if (/token|ticket|secret|session|code/i.test(key)) {
        url.searchParams.set(key, "[redacted]");
      }
    }
    return url.toString();
  } catch {
    return String(value).replace(/(__clerk_ticket=)[^&\s]+/g, "$1[redacted]");
  }
}

function absoluteUrl(route) {
  return `${base}${route.startsWith("/") ? route : `/${route}`}`;
}

function fail(message, details = null) {
  report.failures.push({ message, details });
}

function warn(message, details = null) {
  report.warnings.push({ message, details });
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function authMethodForCandidate(candidate, ownerUserIds) {
  return process.env.QA_CLERK_USER_ID === candidate
    ? "CLERK_SECRET_KEY+QA_CLERK_USER_ID"
    : ownerUserIds.includes(candidate)
      ? "CLERK_SECRET_KEY+SC_OWNER_USER_IDS"
      : "CLERK_SECRET_KEY+QA_CLERK_EMAIL";
}

async function resolveQaAuth() {
  if (process.env.QA_SIGN_IN_URL) {
    report.auth.method = "QA_SIGN_IN_URL";
    return { kind: "url", url: process.env.QA_SIGN_IN_URL };
  }

  const secretKey = String(process.env.CLERK_SECRET_KEY || "").trim();
  const ownerUserIds = [
    process.env.SC_OWNER_USER_ID,
    ...String(process.env.SC_OWNER_USER_IDS || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  ]
    .map((id) => String(id || "").trim())
    .filter(Boolean);
  const userIds = [
    process.env.QA_CLERK_USER_ID,
    ...ownerUserIds,
  ]
    .map((id) => String(id || "").trim())
    .filter(Boolean)
    .filter((id, index, arr) => arr.indexOf(id) === index);
  const email = String(process.env.QA_CLERK_EMAIL || "").trim();

  if (!secretKey || (!userIds.length && !email)) {
    return null;
  }

  const { createClerkClient } = await import("@clerk/backend");
  const client = createClerkClient({ secretKey });
  let resolvedUserId = userIds[0] || "";

  if (!resolvedUserId && email) {
    const users = await client.users.getUserList({ emailAddress: [email], limit: 1 });
    resolvedUserId = users?.data?.[0]?.id;
  }

  if (!resolvedUserId) {
    throw new Error("QA Clerk user was not found.");
  }

  const candidates = resolvedUserId
    ? [resolvedUserId, ...userIds.filter((id) => id !== resolvedUserId)]
    : userIds;
  let lastError = null;

  for (const candidate of candidates) {
    try {
      const signInToken = await client.signInTokens.createSignInToken({
        userId: candidate,
        expiresInSeconds: 300,
      });
      const baseMethod = authMethodForCandidate(candidate, ownerUserIds);

      if (!secretKey.startsWith("sk_test_")) {
        report.auth.method = baseMethod;
        return { kind: "url", url: signInToken.url };
      }

      const testingToken = await client.testingTokens.createTestingToken();
      const frontendApi = new URL(signInToken.url).host;
      if (!frontendApi || !testingToken?.token) {
        throw new Error("Clerk TEST QA auth could not resolve its Frontend API/testing token.");
      }

      report.auth.method = `CLERK_TEST_TICKET+${baseMethod}`;
      return {
        kind: "clerk_test_ticket",
        ticket: signInToken.token,
        testingToken: testingToken.token,
        frontendApi,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("QA Clerk sign-in token could not be created.");
}

async function setupClerkTestingTokenRouting(context, auth) {
  const apiUrl = new RegExp(
    `^https://${escapeRegex(auth.frontendApi)}/v1/.*?(\\?.*)?$`,
  );
  const retryableStatusCodes = new Set([429, 502, 503, 504]);
  const maxRetries = 3;

  await context.route(apiUrl, async (route) => {
    const originalUrl = new URL(route.request().url());
    originalUrl.searchParams.set("__clerk_testing_token", auth.testingToken);
    const routedUrl = originalUrl.toString();

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const response = await route.fetch({ url: routedUrl });
        const status = response.status();

        if (retryableStatusCodes.has(status) && attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
          continue;
        }

        if (retryableStatusCodes.has(status)) {
          await route.fulfill({ response });
          return;
        }

        const contentType = String(response.headers()["content-type"] || "");
        if (!contentType.includes("application/json")) {
          await route.fulfill({ response });
          return;
        }

        const json = await response.json();
        if (json?.response?.captcha_bypass === false) {
          json.response.captcha_bypass = true;
        }
        if (json?.client?.captcha_bypass === false) {
          json.client.captcha_bypass = true;
        }
        await route.fulfill({ response, json });
        return;
      } catch (error) {
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
          continue;
        }
        throw error;
      }
    }
  });
}

async function authenticateQa(page, context, auth) {
  if (auth.kind === "url") {
    await page.goto(auth.url, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForURL(/\/app|\/pricing/, { timeout: 60_000 }).catch(() => null);
    report.auth.finalUrl = redactUrl(page.url());
    return;
  }

  await setupClerkTestingTokenRouting(context, auth);
  await page.goto(absoluteUrl("/"), { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForFunction(() => window.Clerk !== undefined && window.Clerk.loaded === true);

  await page.evaluate(async (ticket) => {
    const clerk = window.Clerk;
    if (!clerk?.client) {
      throw new Error("Clerk client is not loaded in the QA browser.");
    }

    const result = await clerk.client.signIn.create({
      strategy: "ticket",
      ticket,
    });
    if (result.status !== "complete" || !result.createdSessionId) {
      throw new Error(`Clerk TEST ticket sign-in failed with status ${result.status}.`);
    }

    await clerk.setActive({ session: result.createdSessionId });
  }, auth.ticket);

  await page.waitForFunction(() => Boolean(window.Clerk?.user && window.Clerk?.session));
  await page.waitForTimeout(300);
  report.auth.finalUrl = redactUrl(page.url());
}

function attachPageDiagnostics(page) {
  page.on("console", (message) => {
    if (!["error", "warning"].includes(message.type())) return;
    const text = message.text();
    if (/Download the React DevTools/i.test(text)) return;
    pushLimited(report.errors.console, {
      type: message.type(),
      text: cleanText(text, 500),
      url: redactUrl(page.url()),
    });
  });

  page.on("pageerror", (error) => {
    pushLimited(report.errors.pageErrors, {
      message: cleanText(error?.message || error, 500),
      url: redactUrl(page.url()),
    });
  });

  page.on("requestfailed", (request) => {
    const url = request.url();
    if (!url.startsWith(base)) return;
    pushLimited(report.errors.requestFailed, {
      url: redactUrl(url),
      method: request.method(),
      error: request.failure()?.errorText || "unknown",
      page: redactUrl(page.url()),
    });
  });

  page.on("response", async (response) => {
    const status = response.status();
    if (status < 400) return;
    const url = response.url();
    if (!url.startsWith(base)) return;
    let body = "";
    if (/\/api\//.test(url)) {
      try {
        body = cleanText(await response.text(), 900);
      } catch {}
    }
    pushLimited(report.errors.badResponses, {
      url: redactUrl(url),
      status,
      body,
      page: redactUrl(page.url()),
    });
  });
}

async function getBodyText(page) {
  return page.locator("body").innerText({ timeout: 12_000 }).catch(() => "");
}

async function callApi(page, name, route) {
  const result = await page.evaluate(async (apiRoute) => {
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

  report.apis.push({
    name,
    route,
    status: result.status,
    ok: result.ok,
  });

  return result;
}

function flattenTradingEntries(bundle) {
  const sections =
    bundle?.daily?.decisionEnvelope?.support?.trading?.watchlistSections ??
    bundle?.decisionEnvelope?.support?.trading?.watchlistSections ??
    [];

  if (!Array.isArray(sections)) return [];
  return sections.flatMap((section) => (Array.isArray(section?.entries) ? section.entries : []));
}

function inspectTradingBundle(bundle) {
  const trading =
    bundle?.daily?.decisionEnvelope?.support?.trading ??
    bundle?.decisionEnvelope?.support?.trading ??
    null;
  const entries = flattenTradingEntries(bundle);
  const staleOpenAllowed = [];

  for (const entry of entries) {
    const snapshotAt = entry?.chart?.snapshotAt;
    const snapshotMs = Date.parse(String(snapshotAt || ""));
    const ageMs = Number.isFinite(snapshotMs) ? Date.now() - snapshotMs : null;
    const marketOpen = entry?.contextSummary?.marketOpen === true;
    const executionAllowed = entry?.executionStatus === "allowed" || entry?.liveDecision?.executionStatus === "allowed";

    if (marketOpen && executionAllowed && typeof ageMs === "number" && ageMs > snapshotMaxAgeMs) {
      staleOpenAllowed.push({
        instrument: entry.instrument,
        snapshotAt,
        ageMinutes: Math.round(ageMs / 60_000),
        executionStatus: entry.executionStatus,
        liveExecutionStatus: entry?.liveDecision?.executionStatus,
      });
    }
  }

  report.metrics.watchlistCount = entries.length;
  report.metrics.openMarketCount = entries.filter((entry) => entry?.contextSummary?.marketOpen === true).length;
  report.metrics.staleOpenAllowedCount = staleOpenAllowed.length;
  report.metrics.coverage = trading?.marketCoverageSummary ?? null;
  report.metrics.focusInstrument = trading?.watchlistFocus?.anchorInstrument ?? null;

  if (!entries.length) {
    fail("Trading bundle has no watchlist entries.");
  }

  if (staleOpenAllowed.length > 0) {
    fail("Open markets with stale snapshots were still allowed for execution.", staleOpenAllowed);
  }
}

async function screenshot(page, name) {
  const file = path.join(outputDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => null);
  report.screenshots.push(file);
}

async function auditPage(page, name, route, requiredSignals) {
  const response = await page.goto(absoluteUrl(route), {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => null);
  await page.waitForTimeout(1_500);

  const body = await getBodyText(page);
  const pageReport = {
    name,
    route,
    url: redactUrl(page.url()),
    status: response?.status() ?? null,
    title: await page.title().catch(() => null),
    signals: {},
    snippet: cleanText(body, 700),
  };

  for (const [signal, pattern] of Object.entries(requiredSignals)) {
    pageReport.signals[signal] = pattern.test(body);
    if (!pageReport.signals[signal]) {
      fail(`Missing required page signal: ${name}.${signal}`, {
        route,
        pattern: String(pattern),
      });
    }
  }

  if (/application error|something went wrong|runtime error|failed to load/i.test(body)) {
    fail(`Application error copy appeared on ${name}.`, { route });
  }

  report.pages.push(pageReport);
  return body;
}

async function auditFocusedTradePlan(page) {
  const openPlanButton = page.getByRole("button", { name: /open trade plan/i }).first();
  if (!(await openPlanButton.isVisible().catch(() => false))) {
    fail("Market Radar did not expose an Open trade plan action.");
    return;
  }

  await openPlanButton.click();
  await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => null);
  await page.waitForTimeout(1_000);

  const body = await getBodyText(page);
  const requiredSignals = {
    focusedPlan: /TRADE PLAN|Trade plan|Execute only the defined plan/i,
    chartTrigger: /Chart trigger|Chart \+ trigger|TRIGGER/i,
    brokerPlan: /Broker plan|Broker checklist|Open broker checklist|Broker gate|broker action/i,
    followUntilClose: /Follow until close|followed|alert/i,
    backToRadar: /Back to Market Radar|Market Radar/i,
  };
  const pageReport = {
    name: "Focused Trade Plan",
    route: "/app?mode=trading&lang=pt -> open trade plan",
    url: redactUrl(page.url()),
    status: null,
    title: await page.title().catch(() => null),
    signals: {},
    snippet: cleanText(body, 700),
  };

  for (const [signal, pattern] of Object.entries(requiredSignals)) {
    pageReport.signals[signal] = pattern.test(body);
    if (!pageReport.signals[signal]) {
      fail(`Missing required focused trade plan signal: ${signal}`, {
        pattern: String(pattern),
      });
    }
  }

  report.pages.push(pageReport);
}

async function main() {
  const auth = await resolveQaAuth();
  if (!auth) {
    throw new Error(
      "Missing QA auth. Set QA_SIGN_IN_URL, or CLERK_SECRET_KEY plus QA_CLERK_USER_ID/QA_CLERK_EMAIL.",
    );
  }

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  attachPageDiagnostics(page);

  try {
    await authenticateQa(page, context, auth);

    const me = await callApi(page, "me", "/api/me");
    report.auth.authenticated = me.status === 200 && me.payload?.isAuthenticated === true;
    report.auth.paid = Boolean(me.payload?.isPaid || me.payload?.hasProAccess);

    if (!report.auth.authenticated) {
      fail("Authenticated /api/me check failed.", { status: me.status });
    }

    if (requirePaid && !report.auth.paid) {
      fail("QA user is not paid/pro, so the paid trading surface cannot be audited.");
    }

    const bundle = await callApi(page, "daily-bundle trading", "/api/daily-bundle?mode=trading");
    if (!bundle.ok) {
      fail("Trading daily-bundle returned a non-2xx response.", { status: bundle.status });
    } else {
      inspectTradingBundle(bundle.payload);
    }

    const liveBundle = await callApi(
      page,
      "daily-bundle trading force live",
      "/api/daily-bundle?mode=trading&tradingRefresh=live",
    );
    if (!liveBundle.ok) {
      fail("Forced live trading daily-bundle returned a non-2xx response.", { status: liveBundle.status });
    }

    await auditPage(page, "Trading Desk", "/app?mode=trading&lang=pt", {
      tradingDesk: /Trading Desk/i,
      marketRadar: /Market Radar/i,
      chooseMarket: /Choose the market before opening the plan|Open a market only when/i,
      openTradePlan: /Open trade plan/i,
      instrument: /BTCUSD|ETHUSD|EURUSD|XAUUSD/i,
    });

    await auditFocusedTradePlan(page);

    const showAllButton = page.getByRole("button", { name: /show all markets/i });
    if (await showAllButton.isVisible().catch(() => false)) {
      await showAllButton.click();
      await page.waitForTimeout(600);
    } else {
      warn("Show all markets button was not visible. This is fine when the queue has six or fewer markets.");
    }

    await screenshot(page, "trading-desk");

    await auditPage(page, "Legacy Execution Redirect", "/app?mode=trading&tab=execution&lang=pt", {
      trading: /Market Radar|Trade plan|Trading/i,
      instrument: /BTCUSD|ETHUSD|EURUSD|XAUUSD/i,
    });
    await auditPage(page, "Legacy Opportunities Redirect", "/app?mode=trading&tab=opportunities&lang=pt", {
      trading: /Market Radar|Trade plan|Trading/i,
      instrument: /BTCUSD|ETHUSD|EURUSD|XAUUSD/i,
    });
    await auditPage(page, "Legacy Risk Redirect", "/app?mode=trading&tab=risk&lang=pt", {
      trading: /Market Radar|Trade plan|Trading/i,
      instrument: /BTCUSD|ETHUSD|EURUSD|XAUUSD/i,
    });
    await auditPage(page, "Alerts", "/app?mode=trading&tab=alerts&lang=pt", {
      alerts: /Alerts|Alertas|Trading/i,
    });

    if (report.errors.pageErrors.length > 0) {
      fail("Browser page errors were captured.", report.errors.pageErrors);
    }

    if (report.errors.badResponses.length > 0) {
      fail("First-party 4xx/5xx responses were captured.", report.errors.badResponses);
    }

    const firstPartyFailures = report.errors.requestFailed.filter(
      (item) => !/_rsc=/.test(item.url) && !/ERR_ABORTED/.test(item.error),
    );
    if (firstPartyFailures.length > 0) {
      fail("First-party request failures were captured.", firstPartyFailures);
    }

    const clerkWarnings = report.errors.console.filter((item) =>
      /afterSignInUrl|afterSignUpUrl|deprecated/i.test(item.text),
    );
    if (clerkWarnings.length > 0) {
      warn("Clerk deprecated redirect environment is still present.", {
        count: clerkWarnings.length,
      });
    }
  } finally {
    await browser.close().catch(() => null);
    report.ok = report.failures.length === 0;
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({
      ok: report.ok,
      failures: report.failures.length,
      warnings: report.warnings.length,
      watchlistCount: report.metrics.watchlistCount,
      openMarketCount: report.metrics.openMarketCount,
      staleOpenAllowedCount: report.metrics.staleOpenAllowedCount,
      reportPath,
    }, null, 2));
  }

  if (!report.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  fail(error?.message ?? "qa_trading_prod_failed");
  report.ok = false;
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.error(error);
  process.exitCode = 1;
});