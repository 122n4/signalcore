"use client";

import Link from "next/link";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";

export default function Header() {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-lg font-semibold">
          SignalCore
        </Link>

        <div className="flex items-center gap-3">
          {/* Quando está DESLOGADO */}
          <SignedOut>
            <Link
              href="/sign-in"
              className="rounded-full px-4 py-2 text-sm font-semibold border border-border-soft hover:bg-canvas-50"
            >
              Entrar
            </Link>
            <Link
              href="/sign-up"
              className="rounded-full px-4 py-2 text-sm font-semibold bg-ink-900 text-white hover:opacity-95"
            >
              Criar conta
            </Link>
          </SignedOut>

          {/* Quando está LOGADO */}
          <SignedIn>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 pb-4 flex gap-4 overflow-x-auto">
        <Link
          href="/market-map"
          className="text-sm px-3 py-2 rounded-full text-gray-700 hover:bg-gray-100 transition whitespace-nowrap"
        >
          Market Map
        </Link>
        <Link
          href="/why-signalcore"
          className="text-sm px-3 py-2 rounded-full text-gray-700 hover:bg-gray-100 transition whitespace-nowrap"
        >
          Method
        </Link>
        <Link
          href="/pricing"
          className="text-sm px-3 py-2 rounded-full text-gray-700 hover:bg-gray-100 transition whitespace-nowrap"
        >
          Pricing
        </Link>
      </div>
    </header>
  );
}