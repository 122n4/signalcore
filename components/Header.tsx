"use client";

import { usePathname } from "next/navigation";
import LanguageSwitch from "./LanguageSwitch";

function NavLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <a
      href={href}
      className="text-sm px-3 py-2 rounded-full text-gray-700 hover:bg-gray-100 transition whitespace-nowrap"
    >
      {label}
    </a>
  );
}

export default function Header() {
  const pathname = usePathname() || "/";
  const isPT = pathname === "/pt" || pathname.startsWith("/pt/");
  const base = isPT ? "/pt" : "";

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
        <a href={base || "/"} className="text-lg font-semibold">
          SignalCore
        </a>

        <LanguageSwitch />
      </div>

      <div className="mx-auto max-w-7xl px-6 pb-4 flex gap-4 overflow-x-auto">
        <NavLink href={`${base}/market-map`} label="Market Map" />
        <NavLink href={`${base}/why-signalcore`} label={isPT ? "Método" : "Method"} />
        <NavLink href={`${base}/pricing`} label={isPT ? "Preços" : "Pricing"} />
      </div>
    </header>
  );
}