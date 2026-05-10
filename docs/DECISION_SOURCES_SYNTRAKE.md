# Syntrake Decision Sources

Syntrake decisions are generated from combined inputs:

1. Market data feeds:
- Binance public spot data for crypto live candles and quotes
- Finnhub
- TwelveData

2. User strategy context:
- Active plan constraints (goal, risk, horizon)
- Portfolio holdings and concentration

3. Execution discipline context:
- Execution proof quality
- Validation and checklist consistency

4. Time continuity context:
- Daily snapshots timeline
- Recent loop state and risk gate history
- Trading scanner snapshots persisted by instrument when the refresh job is healthy
- Live scanner fallback when stored snapshots are missing or stale

Syntrake does not run on static prewritten text alone.  
Daily decisions are produced server-side from these sources and exposed in `/api/daily-bundle`.

Execution guidance must not be treated as broker-ready when the scanner source is stale, empty, or fallback catalog only.
