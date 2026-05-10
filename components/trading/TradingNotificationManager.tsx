"use client";

import TradingNotificationBridge from "@/components/trading/TradingNotificationBridge";
import { useTradingWorkspace } from "@/app/app/tabs/tradingWorkspace";

type TradingNotificationManagerProps = {
  enabled: boolean;
};

export default function TradingNotificationManager({
  enabled,
}: TradingNotificationManagerProps) {
  const { notifications } = useTradingWorkspace("trading");

  return <TradingNotificationBridge enabled={enabled} events={notifications} />;
}
