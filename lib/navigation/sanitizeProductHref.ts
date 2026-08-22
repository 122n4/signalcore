const TRADING_TAB_VALUES = ["trading", "journal", "alerts"] as const;
const ALLOWED_TAB_VALUES: ReadonlySet<string> = new Set(TRADING_TAB_VALUES);
const ALLOWED_MODE_VALUES: ReadonlySet<string> = new Set(["trading"]);
const APP_QUERY_ALLOWLIST = new Set([
  "tab",
  "mode",
  "fresh",
  "source",
  "manual",
]);
const FULL_SCREEN_QUERY_ALLOWLIST = new Set(["source", "mode"]);
const DEFAULT_ALLOWED_FULL_SCREEN_ROUTES = new Set(["/pricing"]);

export type SanitizeProductHrefArgs = {
  href: unknown;
  fallbackHref: string;
  mode?: string | null;
  allowFullScreenRoutes?: string[];
};

function toNonEmptyString(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

function normalizeMode(value: unknown) {
  const mode = String(value ?? "").trim().toLowerCase();
  return ALLOWED_MODE_VALUES.has(mode) ? mode : null;
}

function normalizeTab(value: unknown) {
  const tab = String(value ?? "").trim().toLowerCase();
  return ALLOWED_TAB_VALUES.has(tab) ? tab : null;
}

function homeTabForMode(mode: string | null) {
  void mode;
  return "trading";
}

function filterParams(params: URLSearchParams, allowlist: Set<string>) {
  const next = new URLSearchParams();
  for (const [key, value] of params.entries()) {
    if (!allowlist.has(key)) continue;
    const trimmed = String(value || "").trim();
    if (!trimmed) continue;
    next.set(key, trimmed);
  }
  return next;
}

function parseProductUrl(rawHref: string) {
  if (/^https?:\/\//i.test(rawHref)) {
    const parsed = new URL(rawHref);
    if (parsed.origin !== "https://syntrake.local") return null;
    return parsed;
  }

  if (!rawHref.startsWith("/")) return null;
  return new URL(rawHref, "https://syntrake.local");
}

function buildShellHref(pathname: string, params: URLSearchParams, preferredMode: string | null, fallbackHref: string) {
  const filtered = filterParams(params, APP_QUERY_ALLOWLIST);
  const tab = normalizeTab(filtered.get("tab"));
  if (!tab) return fallbackHref;

  filtered.set("tab", tab);
  const mode = normalizeMode(filtered.get("mode")) ?? preferredMode;
  if (mode) filtered.set("mode", mode);
  else filtered.delete("mode");

  const query = filtered.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function buildFullScreenHref(pathname: string, params: URLSearchParams, preferredMode: string | null) {
  const filtered = filterParams(params, FULL_SCREEN_QUERY_ALLOWLIST);
  const mode = normalizeMode(filtered.get("mode")) ?? preferredMode;
  if (mode) filtered.set("mode", mode);
  else filtered.delete("mode");

  const query = filtered.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function buildFallbackHref(
  fallbackUrl: URL | null,
  allowedFullScreenRoutes: Set<string>,
  preferredMode: string | null,
) {
  if (fallbackUrl?.pathname === "/app") {
    return buildShellHref(
      "/app",
      fallbackUrl.searchParams,
      preferredMode,
      `/app?tab=${homeTabForMode(preferredMode)}${preferredMode ? `&mode=${preferredMode}` : ""}`,
    );
  }

  if (fallbackUrl && allowedFullScreenRoutes.has(fallbackUrl.pathname)) {
    return buildFullScreenHref(fallbackUrl.pathname, fallbackUrl.searchParams, preferredMode);
  }

  return preferredMode ? `/app?tab=${homeTabForMode(preferredMode)}&mode=${preferredMode}` : "/app?tab=trading";
}

export function sanitizeProductHref(args: SanitizeProductHrefArgs): string {
  const allowedFullScreenRoutes = new Set([
    ...DEFAULT_ALLOWED_FULL_SCREEN_ROUTES,
    ...(args.allowFullScreenRoutes ?? []),
  ]);
  const fallbackRaw = toNonEmptyString(args.fallbackHref) || "/app?tab=trading";
  const fallbackUrl = parseProductUrl(fallbackRaw);
  const fallbackPreferredMode = normalizeMode(fallbackUrl?.searchParams.get("mode")) ?? normalizeMode(args.mode);

  const rawHref = toNonEmptyString(args.href);
  if (!rawHref) return buildFallbackHref(fallbackUrl, allowedFullScreenRoutes, fallbackPreferredMode);

  const parsed = parseProductUrl(rawHref);
  if (!parsed) return buildFallbackHref(fallbackUrl, allowedFullScreenRoutes, fallbackPreferredMode);

  const preferredMode =
    normalizeMode(parsed.searchParams.get("mode")) ??
    normalizeMode(args.mode) ??
    fallbackPreferredMode;

  if (parsed.pathname === "/app") {
    return buildShellHref(
      "/app",
      parsed.searchParams,
      preferredMode,
      buildFallbackHref(fallbackUrl, allowedFullScreenRoutes, preferredMode),
    );
  }

  if (allowedFullScreenRoutes.has(parsed.pathname)) {
    return buildFullScreenHref(parsed.pathname, parsed.searchParams, preferredMode);
  }

  return buildFallbackHref(fallbackUrl, allowedFullScreenRoutes, preferredMode);
}
