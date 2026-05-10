"use client";

import { useEffect } from "react";

import {
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
  useEffect(() => {
    if (!enabled) return;
    if (!readTradingNotificationsEnabled()) return;

    for (const event of events) {
      if (!event.browserEligible) continue;
      if (hasSeenTradingNotification(event.id)) continue;
      dispatchTradingBrowserNotification(event);
    }
  }, [enabled, events]);

  return null;
}
