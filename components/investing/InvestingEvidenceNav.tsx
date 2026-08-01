"use client";

import Link from "next/link";

const surfaces = [
  { href: "/investing", label: "Dashboard" },
  { href: "/investing/runs", label: "History" },
  { href: "/investing/research", label: "Research" },
  { href: "/ops/investing", label: "OPS" },
] as const;

export default function InvestingEvidenceNav() {
  return (
    <nav
      aria-label="Investing evidence and operations"
      className="flex flex-wrap items-center gap-2 rounded-[18px] border border-slate-800/80 bg-[#0d1729]/90 px-4 py-3"
    >
      <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
        Evidence
      </span>
      {surfaces.map((surface) => (
        <Link
          key={surface.href}
          href={surface.href}
          className="rounded-xl border border-slate-700/80 bg-[#101b2f] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-cyan-400/40 hover:text-white"
        >
          {surface.label}
        </Link>
      ))}
      <span className="ml-auto text-[11px] text-slate-500">Read-only operational evidence</span>
    </nav>
  );
}
