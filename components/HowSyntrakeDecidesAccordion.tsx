"use client";

import { useId, useState } from "react";
import { track } from "@/lib/analytics/client";

type HowSyntrakeDecidesAccordionProps = {
  buttonLabel: string;
  title: string;
  items: readonly string[];
};

export default function HowSyntrakeDecidesAccordion({
  buttonLabel,
  title,
  items,
}: HowSyntrakeDecidesAccordionProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  function onToggle() {
    if (!open) {
      track("landing_decision_trace_expand", {
        location: "decision_preview",
      });
    }
    setOpen((prev) => !prev);
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="inline-flex items-center justify-center rounded-2xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
      >
        {buttonLabel}
      </button>

      {open ? (
        <div id={panelId} className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
          <div className="text-sm font-semibold text-zinc-900">{title}</div>
          <ul className="mt-2 space-y-1 text-sm text-zinc-700">
            {items.slice(0, 5).map((item, idx) => (
              <li key={`${item}-${idx}`}>- {item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}