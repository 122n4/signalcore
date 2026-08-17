// proxy.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { isLocalQaAuthBypassRequest, LOCAL_QA_AUTH_COOKIE } from "@/lib/auth/localQaAuth";
import { SITE_DETECTED_LANG_COOKIE_KEY, resolveCountrySiteLang } from "@/lib/i18n/siteLanguage";
import { resolveProtectedRedirectTarget } from "@/lib/navigation/resolveProtectedRedirectTarget";

/**
 * Next.js 16+: "middleware.ts" deprecated -> use "proxy.ts"
 * Este ficheiro é o que realmente corre e injeta auth do Clerk.
 */

const isProtectedRoute = createRouteMatcher([
  // App pages
  "/app(.*)",

  // Private APIs
  "/api/user-settings(.*)",
  "/api/portfolio-items(.*)",
  "/api/daily-bundle(.*)",
  "/api/daily-snapshot(.*)",
  "/api/journal(.*)", // cobre /api/journal/log
  "/api/setup(.*)",

  // Market data (private)
  "/api/market(.*)",
]);

function attachDetectedLanguageCookie(req: NextRequest, res: NextResponse) {
  const country = req.headers.get("x-vercel-ip-country") ?? req.headers.get("cf-ipcountry");
  const detected = resolveCountrySiteLang(country);
  if (!detected) return res;
  res.cookies.set(SITE_DETECTED_LANG_COOKIE_KEY, detected, {
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return res;
}

export default clerkMiddleware(async (auth, req) => {
  const host = req.nextUrl.host.trim().toLowerCase();

  if (host === "syntrake.com") {
    const canonicalUrl = new URL(req.url);
    canonicalUrl.protocol = "https:";
    canonicalUrl.host = "www.syntrake.com";
    return NextResponse.redirect(canonicalUrl, 308);
  }

  // se não for protegida, passa
  if (!isProtectedRoute(req)) return attachDetectedLanguageCookie(req, NextResponse.next());

  if (isLocalQaAuthBypassRequest(req)) {
    const res = NextResponse.next();
    res.cookies.set(LOCAL_QA_AUTH_COOKIE, "1", {
      httpOnly: false,
      sameSite: "lax",
      maxAge: 60 * 60,
      path: "/",
    });
    return attachDetectedLanguageCookie(req, res);
  }

  const a = await auth();

  // sem sessão
  if (!a.userId) {
    // se for API -> 401 json (nunca redirect)
    if (req.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // se for página -> redirect para login com redirect_url
    const signInUrl = new URL("/sign-in", req.url);
    signInUrl.searchParams.set("redirect_url", resolveProtectedRedirectTarget(req.nextUrl.pathname, req.nextUrl.search));
    return attachDetectedLanguageCookie(req, NextResponse.redirect(signInUrl));
  }

  return attachDetectedLanguageCookie(req, NextResponse.next());
});

export const config = {
  matcher: [
    // ignora assets
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|map)$).*)",
    // corre sempre em /api
    "/(api|trpc)(.*)",
  ],
};
