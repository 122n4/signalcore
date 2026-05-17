"use client";

import { useMemo, useSyncExternalStore } from "react";

import TradingNotificationBridge from "@/components/trading/TradingNotificationBridge";
import { useTradingWorkspace } from "@/app/app/tabs/tradingWorkspace";
import {
  readFollowedTradingInstruments,
  subscribeFollowedTradingInstruments,
} from "@/lib/trading/followedInstruments";
import { deriveTradingFollowUpEvents } from "@/lib/trading/notifications";

type TradingNotificationManagerProps = {
  enabled: boolean;
};

export default function TradingNotificationManager({
  enabled,
}: TradingNotificationManagerProps) {
  const { entries } = useTradingWorkspace("trading");
  const followedInstruments = useSyncExternalStore(
    subscribeFollowedTradingInstruments,
    readFollowedTradingInstruments,
    () => [],
  );
  const followUpEvents = useMemo(
    () => deriveTradingFollowUpEvents(entries, followedInstruments),
    [entries, followedInstruments],
  );

  return <TradingNotificationBridge enabled={enabled} events={followUpEvents} />;
}
