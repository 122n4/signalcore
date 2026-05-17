"use client";

import { useEffect, useState } from "react";

import {
  TRADING_NOTIFICATIONS_ENABLED_EVENT,
  dispatchTradingBrowserNotification,
  hasSeenTradingNotification,
  readTradingNotificationsEnabled,
} from "@/lib/trading/browserNotifications";
import type { TradingNotificationEvent } from "@/lib/trading/notifications";

type TradingNotificationBridgeProps = {
  enabled: boolean;
  events: TradingNotificationEvent[];
};

export default function TradingNotificationBridge({
  enabled,
  events,
}: TradingNotificationBridgeProps) {
  const [settingsVersion, setSettingsVersion] = useState(0);

  useEffect(() => {
    const bumpSettingsVersion = () => setSettingsVersion((value) => value + 1);

    window.addEventListener(TRADING_NOTIFICATIONS_ENABLED_EVENT, bumpSettingsVersion);
    window.addEventListener("storage", bumpSettingsVersion);
    return () => {
      window.removeEventListener(TRADING_NOTIFICATIONS_ENABLED_EVENT, bumpSettingsVersion);
      window.removeEventListener("storage", bumpSettingsVersion);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (!readTradingNotificationsEnabled()) return;

    for (const event of events) {
      if (!event.browserEligible) continue;
      if (hasSeenTradingNotification(event.id)) continue;
      dispatchTradingBrowserNotification(event, { allowVisible: true });
    }
  }, [enabled, events, settingsVersion]);

  return null;
}
