// lib/journal/export.ts
import { JournalEvent } from "@/lib/core/types";

function escapeCsv(v: any) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toJson(events: JournalEvent[]) {
  return JSON.stringify(events, null, 2);
}

export function toCsv(events: JournalEvent[]) {
  const headers = ["id", "ts", "type", "title", "details"];
  const lines = [headers.join(",")];

  for (const e of events) {
    lines.push(
      [
        escapeCsv(e.id),
        escapeCsv(new Date(e.ts).toISOString()),
        escapeCsv(e.type),
        escapeCsv(e.title),
        escapeCsv(e.details ?? ""),
      ].join(",")
    );
  }

  return lines.join("\n");
}

export function downloadText(filename: string, content: string, mime = "text/plain") {
  if (typeof window === "undefined") return;

  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}