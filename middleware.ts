import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher([
  "/app(.*)", // protege tudo dentro de /app
]);

export default clerkMiddleware((auth, req) => {
  if (isProtectedRoute(req)) auth().protect();
});

export const config = {
  matcher: [
    // recomendado pelo Clerk (apanha páginas e api)
    "/((?!.*\\..*|_next).*)",
    "/(api|trpc)(.*)",
  ],
};