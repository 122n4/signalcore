"use client";

import { usePathname } from "next/navigation";
import LanguageSwitch from "@/components/LanguageSwitch";

function NavLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <a
      href={href}
      className={[
        "text-sm transition",
        active
          ? "text-ink-900 font-semibold"
          : "text-ink-700 hover:text-ink-900",
      ].join(" ")}
      aria-current={active ? "page" : undefined}
    >
      {label}
    </a>
  );
}

export default function Header() {
  const pathname = usePathname() || "/";
  const isPT = pathname === "/pt" || pathname.startsWith("/pt/");

  const base = isPT ? "/pt" : "";

  const links = [
    { href: `${base}/market-map`, label: "Market Map" },
    { href: `${base}/why-signalcore`, label: isPT ? "Método" : "Method" },
    { href: `${base}/pricing`, label: isPT ? "Preços" : "Pricing" },
  ];

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <header className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between border-b border-border-soft bg-white/80 backdrop-blur">
      {/* BRAND */}
      <a
        href={base || "/"}
        className="flex items-center gap-3 hover:opacity-90 transition"
      >
        <div className="h-10 w-10 rounded-2xl bg-ink-900" />
        <span className="text-lg font-semibold tracking-tight">
          SignalCore
        </span>
      </a>

      {/* NAV + LANG */}
      <div className="flex items-center gap-6">
        <nav className="hidden md:flex items-center gap-6">
          {links.map((l) => (
            <NavLink
              key={l.href}
              href={l.href}
              label={l.label}
              active={isActive(l.href)}
            />
          ))}
        </nav>

        <LanguageSwitch />
      </div>
    </header>
  );
}