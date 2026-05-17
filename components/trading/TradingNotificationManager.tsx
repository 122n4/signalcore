"use client";

import { useMemo } from "react";

import TradingNotificationBridge from "@/components/trading/TradingNotificationBridge";
import { useTradingWorkspace } from "@/app/app/tabs/tradingWorkspace";
import { deriveTradingFollowUpEvents } from "@/lib/trading/notifications";
import { useFollowedTradingInstruments } from "@/lib/trading/useFollowedTradingInstruments";

type TradingNotificationManagerProps = {
  enabled: boolean;
};

export default function TradingNotificationManager({
  enabled,
}: TradingNotificationManagerProps) {
  const { entries } = useTradingWorkspace("trading");
  const { instruments: followedInstruments } = useFollowedTradingInstruments();
  const followUpEvents = useMemo(
    () => deriveTradingFollowUpEvents(entries, followedInstruments),
    [entries, followedInstruments],
  );

  return <TradingNotificationBridge enabled={enabled} events={followUpEvents} />;
}
