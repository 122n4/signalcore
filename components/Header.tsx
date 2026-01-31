"use client";

import Link from "next/link";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border-soft bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        {/* Logo */}
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-ink-900"
        >
          SignalCore
        </Link>

        {/* Navigation */}
        <nav className="flex items-center gap-6 text-sm text-ink-700">
          <Link href="/market-map" className="hover:text-ink-900">
            Market Map
          </Link>

          <Link href="/pricing" className="hover:text-ink-900">
            Pricing
          </Link>

          <SignedIn>
            <Link href="/my-portfolio" className="hover:text-ink-900">
              My Portfolio
            </Link>
          </SignedIn>

          {/* Language */}
          <Link
            href="/pt"
            className="text-xs opacity-70 hover:opacity-100"
          >
            PT
          </Link>

          {/* Auth */}
          <SignedOut>
            <Link
              href="/sign-in"
              className="rounded-xl bg-signal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-signal-800"
            >
              Join SignalCore
            </Link>
          </SignedOut>

          <SignedIn>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
        </nav>
      </div>
    </header>
  );
}