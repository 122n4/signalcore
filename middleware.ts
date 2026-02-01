// middleware.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher([
  "/app(.*)",
  "/my-portfolio(.*)",
  "/portfolio(.*)",
  "/pricing(.*)", // se quiseres proteger pricing, senão remove
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isProtectedRoute(req)) return NextResponse.next();

  const a = await auth();

  if (!a.userId) {
    const signInUrl = new URL("/sign-in", req.url);
    signInUrl.searchParams.set("redirect_url", req.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // não correr em static/assets
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};