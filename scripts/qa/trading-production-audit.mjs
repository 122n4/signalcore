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

async function resolveSignInUrl() {
  if (process.env.QA_SIGN_IN_URL) {
    report.auth.method = "QA_SIGN_IN_URL";
    return process.env.QA_SIGN_IN_URL;
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  const userId = process.env.QA_CLERK_USER_ID;
  const email = process.env.QA_CLERK_EMAIL;

  if (!secretKey || (!userId && !email)) {
    return null;
  }

  const { createClerkClient } = await import("@clerk/backend");
  const client = createClerkClient({ secretKey });
  let resolvedUserId = userId;

  if (!resolvedUserId && email) {
    const users = await client.users.getUserList({ emailAddress: [email], limit: 1 });
    resolvedUserId = users?.data?.[0]?.id;
  }

  if (!resolvedUserId) {
    throw new Error("QA Clerk user was not found.");
  }

  const token = await client.signInTokens.createSignInToken({
    userId: resolvedUserId,
    expiresInSeconds: 300,
  });
  report.auth.method = userId ? "CLERK_SECRET_KEY+QA_CLERK_USER_ID" : "CLERK_SECRET_KEY+QA_CLERK_EMAIL";
  return token.url;
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

async function main() {
  const signInUrl = await resolveSignInUrl();
  if (!signInUrl) {
    throw new Error(
      "Missing QA auth. Set QA_SIGN_IN_URL, or CLERK_SECRET_KEY plus QA_CLERK_USER_ID/QA_CLERK_EMAIL.",
    );
  }

  const browser = await chromium.launch({ headless });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  attachPageDiagnostics(page);

  try {
    await page.goto(signInUrl, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForURL(/\/app|\/pricing/, { timeout: 60_000 }).catch(() => null);
    report.auth.finalUrl = redactUrl(page.url());

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
      tradeCard: /What to do now|Trade card/i,
      brokerChecklist: /Broker-ready checklist|Broker checklist/i,
      liveRefresh: /Live refresh monitor/i,
      chartTrigger: /Chart trigger|Chart \+ trigger/i,
      marketQueue: /Opportunity queue/i,
    });

    const showAllButton = page.getByRole("button", { name: /show all markets/i });
    if (await showAllButton.isVisible().catch(() => false)) {
      await showAllButton.click();
      await page.waitForTimeout(600);
    } else {
      warn("Show all markets button was not visible. This is fine when the queue has six or fewer markets.");
    }

    await screenshot(page, "trading-desk");

    await auditPage(page, "Execution", "/app?mode=trading&tab=execution&lang=pt", {
      execution: /Execution|Execucao|Broker/i,
      instrument: /BTCUSD|ETHUSD|EURUSD|XAUUSD/i,
    });
    await auditPage(page, "Opportunities", "/app?mode=trading&tab=opportunities&lang=pt", {
      opportunities: /Opportunities|Oportunidades|Tracked instruments/i,
      instrument: /BTCUSD|ETHUSD|EURUSD|XAUUSD/i,
    });
    await auditPage(page, "Risk", "/app?mode=trading&tab=risk&lang=pt", {
      risk: /Risk|Risco|Allowed|Restricted/i,
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
