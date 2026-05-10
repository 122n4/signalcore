"use client";
import React from "react";

type Variant = "primary" | "secondary" | "ghost";

export function Button({
  children,
  onClick,
  type = "button",
  disabled,
  variant = "primary",
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  variant?: Variant;
  className?: string;
}) {
  const base =
    "inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm font-semibold transition focus:outline-none";

  const styles: Record<Variant, string> = {
    primary:
      "bg-white text-black hover:bg-white/90 disabled:opacity-50 disabled:hover:bg-white",
    secondary:
      "bg-white/10 text-white hover:bg-white/15 disabled:opacity-50",
    ghost:
      "bg-transparent text-white/70 hover:bg-white/5 hover:text-white disabled:opacity-50",
  };

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={[base, styles[variant], className].join(" ")}
    >
      {children}
    </button>
  );
}