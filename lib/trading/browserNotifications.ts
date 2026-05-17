import type { TradingNotificationEvent } from "@/lib/trading/notifications";

const TRADING_NOTIFICATIONS_ENABLED_KEY = "syntrake:trading-notifications:enabled";
const TRADING_NOTIFICATIONS_SEEN_KEY = "syntrake:trading-notifications:seen";
export const TRADING_NOTIFICATIONS_ENABLED_EVENT =
  "syntrake:trading-notifications:enabled-changed";
const MAX_SEEN_IDS = 50;

export function canUseBrowserNotifications() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function readTradingNotificationsEnabled() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(TRADING_NOTIFICATIONS_ENABLED_KEY) === "1";
}

export function writeTradingNotificationsEnabled(value: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TRADING_NOTIFICATIONS_ENABLED_KEY, value ? "1" : "0");
  window.dispatchEvent(
    new CustomEvent(TRADING_NOTIFICATIONS_ENABLED_EVENT, {
      detail: { enabled: value },
    }),
  );
}

function readSeenIds() {
  if (typeof window === "undefined") return [] as string[];
  const raw = window.localStorage.getItem(TRADING_NOTIFICATIONS_SEEN_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((value) => String(value)) : [];
  } catch {
    return [];
  }
}

function writeSeenIds(ids: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    TRADING_NOTIFICATIONS_SEEN_KEY,
    JSON.stringify(ids.slice(-MAX_SEEN_IDS)),
  );
}

export function hasSeenTradingNotification(id: string) {
  return readSeenIds().includes(id);
}

export function markTradingNotificationSeen(id: string) {
  const next = readSeenIds();
  if (!next.includes(id)) {
    next.push(id);
    writeSeenIds(next);
  }
}

export async function requestTradingNotificationPermission() {
  if (!canUseBrowserNotifications()) return "unsupported" as const;
  return Notification.requestPermission();
}

export function getTradingNotificationPermission() {
  if (!canUseBrowserNotifications()) return "unsupported" as const;
  return Notification.permission;
}

export function dispatchTradingBrowserNotification(
  event: TradingNotificationEvent,
  options: { allowVisible?: boolean } = {},
) {
  if (!canUseBrowserNotifications()) return false;
  if (Notification.permission !== "granted") return false;
  if (
    !options.allowVisible &&
    typeof document !== "undefined" &&
    document.visibilityState === "visible"
  ) {
    return false;
  }

  try {
    const notification = new Notification(event.title, {
      body: event.body,
      tag: event.id,
    });

    notification.onclick = () => {
      if (typeof window !== "undefined") {
        window.focus();
      }
      notification.close();
    };
  } catch {
    return false;
  }

  markTradingNotificationSeen(event.id);
  return true;
}
