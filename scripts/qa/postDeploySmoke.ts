import fs from "node:fs";
import path from "node:path";

type CheckStatus = "pass" | "warn" | "fail";

type SmokeCheck = {
  name: string;
  status: CheckStatus;
  statusCode?: number | null;
  durationMs?: number;
  details?: unknown;
};

type SmokeReport = {
  ok: boolean;
  timestamp: string;
  baseUrl: string;
  checks: SmokeCheck[];
  failures: SmokeCheck[];
  warnings: SmokeCheck[];
  reportPath: string;
};

const defaultBaseUrl = "https://www.syntrake.com";
const baseUrl = String(process.env.QA_BASE_URL || defaultBaseUrl).replace(/\/$/, "");
const envFile = process.env.QA_ENV_FILE || ".env.production.sync";
const outputDir = path.resolve(process.env.QA_OUTPUT_DIR || "artifacts/qa-post-deploy");
const reportPath = path.join(outputDir, "post-deploy-smoke-latest.json");
const requireStripePricing = process.env.QA_REQUIRE_STRIPE_PRICING !== "0";
const requireRefreshSecret = process.env.QA_REQUIRE_SCANNER_REFRESH !== "0";

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

function absoluteUrl(route: string) {
  return `${baseUrl}${route.startsWith("/") ? route : `/${route}`}`;
}

function cleanText(value: unknown, limit = 600) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function redact(value: unknown) {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/(secret|token|key)=([^&\s]+)/gi, "$1=[redacted]");
}

async function fetchText(route: string, init?: RequestInit) {
  const startedAt = Date.now();
  const response = await fetch(absoluteUrl(route), {
    redirect: "follow",
    cache: "no-store",
    ...init,
    headers: {
      "User-Agent": "syntrake-post-deploy-smoke/1.0",
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  return {
    response,
    text,
    durationMs: Date.now() - startedAt,
  };
}

async function fetchJson<T = any>(route: string, init?: RequestInit) {
  const result = await fetchText(route, init);
  let payload: T | null = null;
  try {
    payload = JSON.parse(result.text) as T;
  } catch {
    payload = null;
  }
  return { ...result, payload };
}

function pushCheck(
  checks: SmokeCheck[],
  name: string,
  status: CheckStatus,
  args: Omit<SmokeCheck, "name" | "status"> = {},
) {
  checks.push({
    name,
    status,
    ...args,
    details: typeof args.details === "string" ? redact(args.details) : args.details,
  });
}

function scannerRefreshHeaders() {
  const secret = String(process.env.CRON_SECRET || process.env.ENGINE_LOOP_SECRET || "").trim();
  if (!secret) return null;
  return {
    Authorization: `Bearer ${secret}`,
  };
}

function inspectHealth(payload: any) {
  const warningReasons = Array.isArray(payload?.warningReasons) ? payload.warningReasons : [];
  const scannerOk = payload?.checks?.tradingScanner?.ok !== false;
  const degraded = payload?.ok === false || payload?.status === "degraded";
  const openScannerStale = warningReasons.includes("open_markets_without_fresh_scanner_snapshot");

  return {
    degraded,
    scannerOk,
    openScannerStale,
    warningReasons,
    status: payload?.status ?? null,
  };
}

async function main() {
  loadEnvFile(envFile);

  const checks: SmokeCheck[] = [];

  try {
    const home = await fetchText("/");
    const hasBrand = /Syntrake|SignalCore/i.test(home.text);
    pushCheck(checks, "public_homepage", home.response.ok && hasBrand ? "pass" : "fail", {
      statusCode: home.response.status,
      durationMs: home.durationMs,
      details: hasBrand ? null : cleanText(home.text),
    });
  } catch (error) {
    pushCheck(checks, "public_homepage", "fail", {
      details: error instanceof Error ? error.message : String(error),
    });
  }

  const refreshHeaders = scannerRefreshHeaders();
  if (refreshHeaders) {
    try {
      const refresh = await fetchJson("/api/trading/scanner-refresh", {
        method: "POST",
        headers: refreshHeaders,
      });
      const warningReasons = Array.isArray(refresh.payload?.warningReasons) ? refresh.payload.warningReasons : [];
      const refreshCompleted = refresh.response.ok && refresh.payload?.ok !== false;
      pushCheck(checks, "scanner_refresh", refreshCompleted ? warningReasons.length > 0 ? "warn" : "pass" : "fail", {
        statusCode: refresh.response.status,
        durationMs: refresh.durationMs,
        details: {
          ok: refresh.payload?.ok ?? false,
          executionReady: refresh.payload?.executionReady ?? null,
          warningReasons,
          marketOpenCount: refresh.payload?.summary?.marketOpenCount ?? null,
          freshOpenMarketCount: refresh.payload?.summary?.freshOpenMarketCount ?? null,
          staleOpenMarketCount: refresh.payload?.summary?.staleOpenMarketCount ?? null,
          persistedCount: refresh.payload?.persistedCount ?? null,
        },
      });
    } catch (error) {
      pushCheck(checks, "scanner_refresh", "fail", {
        details: error instanceof Error ? error.message : String(error),
      });
    }
  } else {
    pushCheck(checks, "scanner_refresh", requireRefreshSecret ? "fail" : "warn", {
      details: "Missing CRON_SECRET or ENGINE_LOOP_SECRET, so the live scanner refresh could not be proved.",
    });
  }

  try {
    const health = await fetchJson("/api/health");
    const inspected = inspectHealth(health.payload);
    const status: CheckStatus =
      health.response.ok && !inspected.degraded && inspected.scannerOk && !inspected.openScannerStale
        ? inspected.warningReasons.length > 0
          ? "warn"
          : "pass"
        : "fail";

    pushCheck(checks, "health", status, {
      statusCode: health.response.status,
      durationMs: health.durationMs,
      details: inspected,
    });
  } catch (error) {
    pushCheck(checks, "health", "fail", {
      details: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const pricing = await fetchJson("/api/pricing");
    const source = pricing.payload?.meta?.source ?? null;
    const amount = pricing.payload?.display?.amount ?? null;
    const priceId = pricing.payload?.display?.priceId ?? null;
    const healthy = pricing.response.ok && Number(amount) > 0 && Boolean(priceId);
    const stripeReady = !requireStripePricing || source === "stripe";

    pushCheck(checks, "pricing", healthy && stripeReady ? "pass" : "fail", {
      statusCode: pricing.response.status,
      durationMs: pricing.durationMs,
      details: {
        source,
        amount,
        currency: pricing.payload?.display?.currency ?? null,
        priceIdPresent: Boolean(priceId),
        annualAvailable: Boolean(pricing.payload?.display?.annualAvailable),
      },
    });
  } catch (error) {
    pushCheck(checks, "pricing", "fail", {
      details: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const me = await fetchJson("/api/me");
    pushCheck(checks, "public_me_contract", me.response.ok && me.payload?.isAuthenticated === false ? "pass" : "fail", {
      statusCode: me.response.status,
      durationMs: me.durationMs,
      details: {
        isAuthenticated: me.payload?.isAuthenticated ?? null,
        planStatus: me.payload?.planStatus ?? null,
      },
    });
  } catch (error) {
    pushCheck(checks, "public_me_contract", "fail", {
      details: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const app = await fetchText("/app?mode=trading&lang=pt");
    const protectedOrLoaded =
      /sign.?in|entrar|Owner access required|Trading Desk|Syntrake/i.test(app.text) ||
      /sign-in|login/i.test(app.response.url);

    pushCheck(checks, "app_route_guard", app.response.status < 500 && protectedOrLoaded ? "pass" : "fail", {
      statusCode: app.response.status,
      durationMs: app.durationMs,
      details: {
        finalUrl: app.response.url.replace(/\?.*$/, ""),
        snippet: protectedOrLoaded ? null : cleanText(app.text),
      },
    });
  } catch (error) {
    pushCheck(checks, "app_route_guard", "fail", {
      details: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const ops = await fetchText("/ops");
    const guarded = /Owner access required|sign.?in|entrar/i.test(ops.text) || /sign-in|login/i.test(ops.response.url);

    pushCheck(checks, "ops_route_guard", ops.response.status < 500 && guarded ? "pass" : "fail", {
      statusCode: ops.response.status,
      durationMs: ops.durationMs,
      details: {
        finalUrl: ops.response.url.replace(/\?.*$/, ""),
        snippet: guarded ? null : cleanText(ops.text),
      },
    });
  } catch (error) {
    pushCheck(checks, "ops_route_guard", "fail", {
      details: error instanceof Error ? error.message : String(error),
    });
  }

  const failures = checks.filter((check) => check.status === "fail");
  const warnings = checks.filter((check) => check.status === "warn");
  const report: SmokeReport = {
    ok: failures.length === 0,
    timestamp: new Date().toISOString(),
    baseUrl,
    checks,
    failures,
    warnings,
    reportPath,
  };

  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    ok: report.ok,
    checks: checks.length,
    failures: failures.length,
    warnings: warnings.length,
    reportPath,
  }, null, 2));

  if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
  const report: SmokeReport = {
    ok: false,
    timestamp: new Date().toISOString(),
    baseUrl,
    checks: [],
    failures: [
      {
        name: "post_deploy_smoke",
        status: "fail",
        details: error instanceof Error ? error.message : String(error),
      },
    ],
    warnings: [],
    reportPath,
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.error(error);
  process.exitCode = 1;
});
