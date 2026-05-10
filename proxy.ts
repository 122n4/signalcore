// proxy.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isLocalQaAuthBypassRequest, LOCAL_QA_AUTH_COOKIE } from "@/lib/auth/localQaAuth";
import { resolveProtectedRedirectTarget } from "@/lib/navigation/resolveProtectedRedirectTarget";

/**
 * Next.js 16+: "middleware.ts" deprecated -> use "proxy.ts"
 * Este ficheiro é o que realmente corre e injeta auth do Clerk.
 */

const isProtectedRoute = createRouteMatcher([
  // App pages
  "/app(.*)",
  "/my-portfolio(.*)",
  "/portfolio(.*)",

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

export default clerkMiddleware(async (auth, req) => {
  const host = req.nextUrl.host.trim().toLowerCase();

  if (host === "syntrake.com") {
    const canonicalUrl = new URL(req.url);
    canonicalUrl.protocol = "https:";
    canonicalUrl.host = "www.syntrake.com";
    return NextResponse.redirect(canonicalUrl, 308);
  }

  // se não for protegida, passa
  if (!isProtectedRoute(req)) return NextResponse.next();

  if (isLocalQaAuthBypassRequest(req)) {
    const res = NextResponse.next();
    res.cookies.set(LOCAL_QA_AUTH_COOKIE, "1", {
      httpOnly: false,
      sameSite: "lax",
      maxAge: 60 * 60,
      path: "/",
    });
    return res;
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
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // ignora assets
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|map)$).*)",
    // corre sempre em /api
    "/(api|trpc)(.*)",
  ],
};
