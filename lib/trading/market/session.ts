import type { TradingMarketDataSnapshot } from "@/lib/trading/data";

import type { SessionOutput } from "./types";

type ZonedTimeParts = {
  weekday: string;
  hour: number;
  minute: number;
};

function getZonedTimeParts(timestamp: string, timeZone: string): ZonedTimeParts {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date(timestamp));
  const lookup = new Map(parts.map((part) => [part.type, part.value]));

  return {
    weekday: lookup.get("weekday") ?? "Mon",
    hour: Number(lookup.get("hour") ?? "0"),
    minute: Number(lookup.get("minute") ?? "0"),
  };
}

function minutesIntoDay(parts: ZonedTimeParts): number {
  return parts.hour * 60 + parts.minute;
}

function classifyAlwaysOpenSession(
  newYorkMinutes: number,
  londonMinutes: number,
  weekend: boolean,
): SessionOutput {
  if (weekend) {
    return {
      marketOpen: true,
      session: "weekend_drift",
      confidence: 82,
    };
  }

  if (
    londonMinutes >= 13 * 60 &&
    londonMinutes < 16 * 60 &&
    newYorkMinutes >= 8 * 60 &&
    newYorkMinutes < 11 * 60
  ) {
    return {
      marketOpen: true,
      session: "london_ny_overlap",
      confidence: 92,
    };
  }

  if (londonMinutes >= 7 * 60 && londonMinutes < 8 * 60 + 30) {
    return {
      marketOpen: true,
      session: "london_open",
      confidence: 88,
    };
  }

  if (londonMinutes >= 8 * 60 + 30 && londonMinutes < 13 * 60) {
    return {
      marketOpen: true,
      session: "london_session",
      confidence: 86,
    };
  }

  if (newYorkMinutes >= 8 * 60 && newYorkMinutes < 10 * 60 + 30) {
    return {
      marketOpen: true,
      session: "ny_open",
      confidence: 84,
    };
  }

  if (newYorkMinutes >= 11 * 60 + 30 && newYorkMinutes < 14 * 60) {
    return {
      marketOpen: true,
      session: "midday_lull",
      confidence: 80,
    };
  }

  if (newYorkMinutes >= 14 * 60 && newYorkMinutes < 17 * 60) {
    return {
      marketOpen: true,
      session: "late_us",
      confidence: 82,
    };
  }

  return {
    marketOpen: true,
    session: "asia_flow",
    confidence: 78,
  };
}

export function readSession(snapshot: TradingMarketDataSnapshot): SessionOutput {
  const newYork = getZonedTimeParts(snapshot.snapshotAt, "America/New_York");
  const london = getZonedTimeParts(snapshot.snapshotAt, "Europe/London");
  const newYorkMinutes = minutesIntoDay(newYork);
  const londonMinutes = minutesIntoDay(london);
  const weekend = newYork.weekday === "Sat" || newYork.weekday === "Sun";

  if (snapshot.sessionProfile === "ny_equities") {
    if (weekend) {
      return {
        marketOpen: false,
        session: "market_closed",
        confidence: 95,
      };
    }

    if (newYorkMinutes >= 4 * 60 && newYorkMinutes < 9 * 60 + 30) {
      return {
        marketOpen: true,
        session: "pre_market",
        confidence: 86,
      };
    }

    if (newYorkMinutes >= 9 * 60 + 30 && newYorkMinutes < 10 * 60 + 30) {
      return {
        marketOpen: true,
        session: "ny_open",
        confidence: 92,
      };
    }

    if (newYorkMinutes >= 10 * 60 + 30 && newYorkMinutes < 12 * 60) {
      return {
        marketOpen: true,
        session: "london_ny_overlap",
        confidence: 84,
      };
    }

    if (newYorkMinutes >= 12 * 60 && newYorkMinutes < 14 * 60) {
      return {
        marketOpen: true,
        session: "midday_lull",
        confidence: 80,
      };
    }

    if (newYorkMinutes >= 14 * 60 && newYorkMinutes < 16 * 60) {
      return {
        marketOpen: true,
        session: "late_us",
        confidence: 82,
      };
    }

    return {
      marketOpen: false,
      session: "market_closed",
      confidence: 94,
    };
  }

  if (snapshot.sessionProfile === "forex") {
    const closedForWeekend =
      (newYork.weekday === "Fri" && newYorkMinutes >= 17 * 60) ||
      newYork.weekday === "Sat" ||
      (newYork.weekday === "Sun" && newYorkMinutes < 17 * 60);

    if (closedForWeekend) {
      return {
        marketOpen: false,
        session: "market_closed",
        confidence: 95,
      };
    }

    return classifyAlwaysOpenSession(newYorkMinutes, londonMinutes, false);
  }

  return classifyAlwaysOpenSession(newYorkMinutes, londonMinutes, weekend);
}
