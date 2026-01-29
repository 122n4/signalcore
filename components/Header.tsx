"use client";

import Link from "next/link";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { usePathname } from "next/navigation";

export default function Header() {
  const pathname = usePathname();
  const isPT = pathname.startsWith("/pt");

  const base = isPT ? "/pt" : "";

  return (
    <header className="sticky top-0 z-40 border-b border-ink-100 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        {/* Logo */}
        <Link
          href={base || "/"}
          className="text-sm font-semibold tracking-tight"
        >
          SignalCore
        </Link>

        {/* Navigation */}
        <nav className="flex items-center gap-4 text-sm text-ink-600">
          <Link href={`${base}/market-map`} className="hover:text-ink-900">
            Market Map
          </Link>

          <Link href={`${base}/pricing`} className="hover:text-ink-900">
            Pricing
          </Link>

          {/* Só aparece se estiver logado */}
          <SignedIn>
            <Link
              href="/my-portfolio"
              className="font-medium text-ink-900 hover:underline"
            >
              My Portfolio
            </Link>
          </SignedIn>

          {/* Idioma */}
          <Link
            href={isPT ? pathname.replace("/pt", "") || "/" : `/pt${pathname}`}
            className="text-xs opacity-70 hover:opacity-100"
          >
            {isPT ? "EN" : "PT"}
          </Link>

          {/* Auth */}
          <SignedOut>
            <Link
              href="/sign-in"
              className="rounded-full border border-ink-200 px-3 py-1 text-xs hover:bg-ink-50"
            >
              Sign in
            </Link>
          </SignedOut>

          <SignedIn>
            <UserButton afterSignOutUrl={base || "/"} />
          </SignedIn>
        </nav>
      </div>
    </header>
  );
}