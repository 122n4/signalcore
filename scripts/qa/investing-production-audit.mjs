import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const base = (process.env.QA_BASE_URL || "https://www.syntrake.com").replace(/\/$/, "");
const envFile = process.env.QA_ENV_FILE || ".env.production.sync";
const outputDir = path.resolve(process.env.QA_OUTPUT_DIR || "artifacts/qa-investing-prod");
const reportPath = path.join(outputDir, "report.json");
const headless = process.env.QA_HEADLESS !== "0";

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
    finalUrl: null,
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

async function resolveSignInUrl() {
  if (process.env.QA_SIGN_IN_URL) {
    report.auth.method = "QA_SIGN_IN_URL";
    return process.env.QA_SIGN_IN_URL;
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
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
  const email = process.env.QA_CLERK_EMAIL;

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
      const token = await client.signInTokens.createSignInToken({
        userId: candidate,
        expiresInSeconds: 300,
      });
      report.auth.method = process.env.QA_CLERK_USER_ID === candidate
        ? "CLERK_SECRET_KEY+QA_CLERK_USER_ID"
        : ownerUserIds.includes(candidate)
          ? "CLERK_SECRET_KEY+SC_OWNER_USER_IDS"
          : "CLERK_SECRET_KEY+QA_CLERK_EMAIL";
      return token.url;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("QA Clerk sign-in token could not be created.");
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

async function auditPage(page, name, route, requiredSignals) {
  const response = await page.goto(absoluteUrl(route), {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => null);
  await page.waitForTimeout(1_000);

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
      fail(`Missing required investing page signal: ${name}.${signal}`, {
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

function inspectInvestingBundle(bundle) {
  const daily = bundle?.daily ?? {};
  const paywall = daily?.paywall ?? {};
  const tradingSupport = daily?.decisionEnvelope?.support?.trading ?? null;
  const tradingAccess = daily?.tradingAccess ?? bundle?.derived?.tradingAccess ?? null;

  if (bundle?.mode !== "investing") {
    fail("Investing daily-bundle returned the wrong mode.", { mode: bundle?.mode });
  }

  if (paywall?.show === true) {
    fail("Investing daily-bundle is showing a paywall even though Investing should stay free.", {
      paywall,
    });
  }

  if (String(paywall?.decisionExposure || "").toUpperCase() !== "FULL") {
    fail("Investing daily-bundle is not exposing the full daily decision.", {
      decisionExposure: paywall?.decisionExposure ?? null,
    });
  }

  if (tradingAccess?.mode !== "investing") {
    fail("Investing daily-bundle has an invalid tradingAccess mode.", { tradingAccess });
  }

  if (tradingSupport) {
    fail("Investing daily-bundle unexpectedly contains trading scanner support.", {
      instrumentCount: Array.isArray(tradingSupport?.watchlist) ? tradingSupport.watchlist.length : null,
    });
  }
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
    if (!report.auth.authenticated) {
      fail("Authenticated /api/me check failed.", { status: me.status });
    }

    const bundle = await callApi(page, "daily-bundle investing", "/api/daily-bundle?mode=investing&budgetEur=5000");
    if (!bundle.ok) {
      fail("Investing daily-bundle returned a non-2xx response.", { status: bundle.status });
    } else {
      inspectInvestingBundle(bundle.payload);
    }

    await auditPage(page, "Investing Daily", "/app?mode=investing&tab=daily&lang=pt", {
      investing: /Investing OS|Investing/i,
      daily: /Today|Hoje|Daily|Loop/i,
    });
    await auditPage(page, "Investing Plan", "/app?mode=investing&tab=planning&lang=pt", {
      plan: /Plan|Plano|goal|objetivo/i,
    });
    await auditPage(page, "Investing Portfolio", "/app?mode=investing&tab=portfolio&lang=pt", {
      portfolio: /Portfolio|holdings|posicoes|capital/i,
    });
    await auditPage(page, "Investing Advisor", "/app?mode=investing&tab=advisor&lang=pt", {
      advisor: /Advisor|advice|orientacao|decision/i,
    });
    await auditPage(page, "Investing Autonomy", "/app?mode=investing&tab=autonomy&lang=pt", {
      autonomy: /Autonomy|Autonomia|broker|sync/i,
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
  } finally {
    await browser.close().catch(() => null);
    report.ok = report.failures.length === 0;
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({
      ok: report.ok,
      failures: report.failures.length,
      warnings: report.warnings.length,
      pages: report.pages.length,
      apis: report.apis.length,
      reportPath,
    }, null, 2));
  }

  if (!report.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  fail(error?.message ?? "qa_investing_prod_failed");
  report.ok = false;
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.error(error);
  process.exitCode = 1;
});
