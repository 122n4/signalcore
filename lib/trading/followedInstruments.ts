const FOLLOWED_TRADING_INSTRUMENTS_KEY = "syntrake:trading:followed-instruments";
const FOLLOWED_TRADING_INSTRUMENTS_EVENT = "syntrake:trading:followed-instruments-changed";
const EMPTY_FOLLOWED_TRADING_INSTRUMENTS: string[] = [];

let followedTradingInstrumentsRaw: string | null = null;
let followedTradingInstrumentsSnapshot: string[] = EMPTY_FOLLOWED_TRADING_INSTRUMENTS;

function normalizeInstrument(value: unknown) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9._:-]/g, "")
    .slice(0, 32);
}

function normalizeList(values: unknown[]) {
  return Array.from(
    new Set(
      values
        .map(normalizeInstrument)
        .filter(Boolean),
    ),
  ).slice(0, 50);
}

export function readFollowedTradingInstruments() {
  if (typeof window === "undefined") return EMPTY_FOLLOWED_TRADING_INSTRUMENTS;
  const raw = window.localStorage.getItem(FOLLOWED_TRADING_INSTRUMENTS_KEY);
  if (raw === followedTradingInstrumentsRaw) return followedTradingInstrumentsSnapshot;

  followedTradingInstrumentsRaw = raw;
  if (!raw) {
    followedTradingInstrumentsSnapshot = EMPTY_FOLLOWED_TRADING_INSTRUMENTS;
    return followedTradingInstrumentsSnapshot;
  }

  try {
    const parsed = JSON.parse(raw);
    followedTradingInstrumentsSnapshot = Array.isArray(parsed)
      ? normalizeList(parsed)
      : EMPTY_FOLLOWED_TRADING_INSTRUMENTS;
    return followedTradingInstrumentsSnapshot;
  } catch {
    followedTradingInstrumentsSnapshot = EMPTY_FOLLOWED_TRADING_INSTRUMENTS;
    return followedTradingInstrumentsSnapshot;
  }
}

export function writeFollowedTradingInstruments(values: string[]) {
  if (typeof window === "undefined") return EMPTY_FOLLOWED_TRADING_INSTRUMENTS;
  const normalized = normalizeList(values);
  const raw = JSON.stringify(normalized);
  followedTradingInstrumentsRaw = raw;
  followedTradingInstrumentsSnapshot = normalized;
  window.localStorage.setItem(FOLLOWED_TRADING_INSTRUMENTS_KEY, raw);
  window.dispatchEvent(
    new CustomEvent(FOLLOWED_TRADING_INSTRUMENTS_EVENT, {
      detail: { instruments: normalized },
    }),
  );
  return normalized;
}

export function isTradingInstrumentFollowed(instrument: string, values = readFollowedTradingInstruments()) {
  const normalized = normalizeInstrument(instrument);
  return Boolean(normalized && values.includes(normalized));
}

export function toggleFollowedTradingInstrument(instrument: string) {
  const normalized = normalizeInstrument(instrument);
  const current = readFollowedTradingInstruments();
  if (!normalized) return current;
  const next = current.includes(normalized)
    ? current.filter((item) => item !== normalized)
    : [...current, normalized];
  return writeFollowedTradingInstruments(next);
}

export function subscribeFollowedTradingInstruments(callback: (instruments: string[]) => void) {
  if (typeof window === "undefined") return () => {};

  const handler = () => callback(readFollowedTradingInstruments());
  window.addEventListener(FOLLOWED_TRADING_INSTRUMENTS_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(FOLLOWED_TRADING_INSTRUMENTS_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}
