"use client";

import { SignUp } from "@clerk/nextjs";

export default function Page() {
  // Freemium flow: after sign-up go straight to the app.
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <SignUp redirectUrl="/app" afterSignUpUrl="/app" />
    </div>
  );
}