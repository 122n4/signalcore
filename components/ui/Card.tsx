"use client";
import React from "react";

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-lg font-semibold text-white">{children}</div>;
}

export function CardSub({ children }: { children: React.ReactNode }) {
  return <div className="mt-1 text-sm text-white/70">{children}</div>;
}