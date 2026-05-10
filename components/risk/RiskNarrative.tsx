"use client";

import React from "react";

export function RiskNarrative({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Risk brief</div>
          <div className="mt-1 text-sm text-neutral-700 leading-relaxed">
            {/* render markdown-lite simples (bold por ** ** não vai render, mas mantém look limpo) */}
            {text}
          </div>
        </div>
        <div className="text-xs text-neutral-500">Auto-generated (proxy)</div>
      </div>
    </div>
  );
}