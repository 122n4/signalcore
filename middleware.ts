import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware();

export const config = {
  matcher: [
    /*
     * Match all routes except static files and Next internals
     */
    "/((?!_next|.*\\..*).*)",
  ],
};