"use client";

import { usePathname } from "next/navigation";

function LinkLang({
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
        "rounded-full px-3 py-1 text-sm transition",
        active
          ? "bg-ink-900 text-white"
          : "text-ink-700 hover:bg-canvas-50 border border-border-soft",
      ].join(" ")}
      aria-current={active ? "page" : undefined}
    >
      {label}
    </a>
  );
}

export default function LanguageSwitch() {
  const pathname = usePathname() || "/";
  const isPT = pathname === "/pt" || pathname.startsWith("/pt/");

  return (
    <nav className="flex items-center gap-2">
      <LinkLang href="/" label="EN" active={!isPT} />
      <LinkLang href="/pt" label="PT" active={isPT} />
    </nav>
  );
}