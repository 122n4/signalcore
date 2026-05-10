export function formatUtcDateTime(value: string | number | Date | null | undefined) {
  if (value == null) return "never";
  const dt = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(dt.getTime())) return "never";
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  const hh = String(dt.getUTCHours()).padStart(2, "0");
  const min = String(dt.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min} UTC`;
}

export function formatIntGroups(value: number) {
  const safe = Number.isFinite(value) ? Math.round(Math.abs(value)) : 0;
  return String(safe).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function formatMoneyCode(value: number, currency = "EUR") {
  const n = Number.isFinite(value) ? Math.round(value) : 0;
  const sign = n < 0 ? "-" : "";
  return `${sign}${formatIntGroups(n)} ${currency}`;
}
