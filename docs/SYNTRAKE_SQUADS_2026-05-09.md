# Syntrake Squads - Software + Marketing

Date: 2026-05-09

Purpose: turn Syntrake into a product a user can understand, trust, and pay for monthly.

## North Star

Syntrake should answer one buyer question before the broker opens:

> Is there a clean trade now, what exactly do I do, and why should I wait if not?

No guarantee language. No fake certainty. The value proposition is disciplined execution from fresh market data, clear blockers, and auditable reasoning.

## Squad A - Software / Product Reliability

Owner mission: make the trading product trustworthy enough to charge for.

Current focus:
- Live data freshness for every open market.
- Scanner snapshot persistence and automatic refresh.
- Crisis/regime filter that improves weak periods without killing annual trade cadence.
- Watchlist output that is broker-actionable: direction, entry zone, invalidation, target/risk, confidence, reason, timestamp.
- Ops visibility: provider errors, stale snapshots, cron/persistence failures, fallback usage.

Sprint 1 deliverables:
- [x] Crypto live candles moved to Binance-first routing.
- [x] Scanner diagnostics expose source, age, freshness, provider error, and data symbol.
- [ ] Daily bundle forces live scanner fallback when stored snapshots are missing or stale.
- [ ] Ops overview distinguishes fresh, stale, fallback catalog, and provider failure states.
- [ ] Crisis filter experiment runs against baseline and crisis periods.
- [ ] Public/product UI shows "fresh data" status where users make broker decisions.

Definition of ready for paid beta:
- Open markets do not show executable trades from stale or fallback data.
- Any stale provider state is blocked and explained in plain language.
- Baseline PF and expectancy remain positive after costs.
- Crisis regime is no longer negative expectancy, or risk is automatically reduced/blocked.
- Annual trade count target remains approximately 220-320 after filters.

## Squad B - Marketing / Growth

Owner mission: make the value instantly clear and convert trust into trial or paid users.

Current focus:
- Positioning: "before you trade, Syntrake checks if the trade is worth taking."
- Landing page proof: live snapshot freshness, broker checklist, wait reasons.
- Pricing page: simple Free vs Pro story, not feature soup.
- Daily content engine: "trade or wait" examples for BTCUSD, EURUSD, XAUUSD.
- Conversion loop: landing -> public example -> sign up -> watchlist -> pricing.

Sprint 1 deliverables:
- [ ] Rewrite landing hero around broker-readiness, not generic planning.
- [ ] Add a public "Trade or Wait" example section with 3 instruments.
- [ ] Add performance proof block with honest baseline/crisis metrics.
- [ ] Add founder offer copy with clear monthly value.
- [ ] Create 14-day content calendar for X/TikTok/YouTube Shorts.
- [ ] Add onboarding copy that gets a new user to one useful decision in under 10 minutes.

Definition of ready for paid beta:
- Visitor understands the product in under 10 seconds.
- Visitor sees why it is safer than raw signals.
- Pricing explains what Pro unlocks in broker workflow terms.
- Founder plan has one clear CTA.
- Claims are auditable and do not promise profit.

## Priority Order

1. Data trust: stale snapshots, provider routing, ops visibility.
2. Broker-actionable output: what to do, where invalidated, when to wait.
3. Crisis filter validation: improve the weak regime without starving trade count.
4. Landing and pricing copy: sell discipline, not magic signals.
5. Public proof loop: live examples, track record, weekly reports.

## Operating Rhythm

Daily:
- Software checks scanner freshness and failing providers.
- Marketing publishes one "trade or wait" proof item.

Weekly:
- Software promotes only validated strategy changes.
- Marketing reviews funnel metrics: landing view, signup, pricing view, checkout start, paid activation.

Release gate:
- `npm test`
- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- live scanner diagnostic

