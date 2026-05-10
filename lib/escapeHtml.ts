const ESCAPE_RE = /[&<>"']/g;

const MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(input: unknown): string {
  const s = input == null ? "" : String(input);
  if (!ESCAPE_RE.test(s)) return s;
  ESCAPE_RE.lastIndex = 0;
  return s.replace(ESCAPE_RE, (ch) => MAP[ch] ?? ch);
}