import type {
  TradingWatchlistEntry,
  TradingWatchlistFocus,
  TradingWatchlistSection,
} from "@/lib/trading/state";

import TradingLiveDecisionDetailSurface from "./TradingLiveDecisionDetailSurface";
import TradingSelectedInstrumentBar from "./TradingSelectedInstrumentBar";
import TradingLiveDecisionWatchlist from "./TradingLiveDecisionWatchlist";

type TradingLiveDecisionSelectionSurfaceProps = {
  sections: TradingWatchlistSection[];
  watchlistFocus?: TradingWatchlistFocus | null;
  selectedInstrument: string | null;
  onSelectInstrument?: (instrument: string) => void;
};

function flattenTradingWatchlistSections(
  sections: TradingWatchlistSection[],
): TradingWatchlistEntry[] {
  return sections.flatMap((section) => section.entries);
}

export function resolveSelectedTradingWatchlistEntry(
  sections: TradingWatchlistSection[],
  selectedInstrument: string | null,
): TradingWatchlistEntry | null {
  const entries = flattenTradingWatchlistSections(sections);

  if (!entries.length) {
    return null;
  }

  if (selectedInstrument) {
    const selected = entries.find((entry) => entry.instrument === selectedInstrument);

    if (selected) {
      return selected;
    }
  }

  return entries[0] ?? null;
}

export default function TradingLiveDecisionSelectionSurface({
  sections,
  watchlistFocus,
  selectedInstrument,
  onSelectInstrument,
}: TradingLiveDecisionSelectionSurfaceProps) {
  const selectedEntry = resolveSelectedTradingWatchlistEntry(sections, selectedInstrument);

  return (
    <div className="space-y-6">
      <TradingLiveDecisionWatchlist
        sections={sections}
        selectedInstrument={selectedEntry?.instrument ?? null}
        onSelectInstrument={onSelectInstrument}
      />
      <TradingSelectedInstrumentBar entry={selectedEntry} watchlistFocus={watchlistFocus ?? null} />
      <TradingLiveDecisionDetailSurface
        entry={selectedEntry ?? null}
        liveDecision={selectedEntry?.liveDecision ?? null}
        chart={selectedEntry?.chart ?? null}
        contextSummary={selectedEntry?.contextSummary ?? null}
        whySummary={selectedEntry?.workspace.whySummary ?? null}
      />
    </div>
  );
}
