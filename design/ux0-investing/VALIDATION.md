# UX-T1 validation

## Static validation

- Prototype remains confined to `design/ux0-investing/`.
- No dependency, API, runtime, migration or production route was changed.
- `prototype.js` passes `node --check`.
- Network isolation guard rejects `window.fetch`; no API URL is present.
- Active navigation contains only Home, Portfolio and Plan.
- All 11 approved truth-safe states are selectable.
- `healthy_verified`, demo, real Investing, general follow-up and resolved situation are absent from active state values.
- Every factual UI block is marked `data-truth="A"` or `data-truth="B"`.
- Research and Activity are absent from the active navigation and page registry.
- Concentration review is read-only and the proposal states `executable:false`.
- Absence of a Paper order is account/proposal/cutoff-bound.

## Real Chrome validation and screenshots

Completed on 2026-08-02 in a real Chrome session, using a static server rooted only at this directory.

- Viewports inspected: 390 x 844, 768 x 1024 and 1440 x 900.
- All 11 selector states were selected and rendered at every viewport.
- Home, Portfolio and Plan were navigated through both desktop and mobile navigation.
- `Back to Home` returned from the concentration review to Home.
- The concentration review remained read-only; `Prepare adjustment` had no order or API behaviour and was paired with `executable: false`.
- The evidence disclosure was opened and captured on mobile and desktop.
- Minimum visible interactive target: 44 px in all three viewports.
- Horizontal overflow: 0 px in every state and viewport.
- Page console warnings/errors: none (`[]`).
- Application/API/external requests: zero. The only network traffic was the initial localhost delivery of `index.html`, `prototype.css` and `prototype.js`; the prototype contains a rejecting `window.fetch` isolation guard.
- Real Chrome PNGs are stored under `screenshots/`. Mobile and desktop include viewport and complete-page captures for the eight required Home states, Portfolio/concentration, Plan, the open disclosure and the `executable: false` proposal. Tablet evidence covers attention, insufficient, stale and unavailable.

Flows navigated:

1. State selector through all approved states.
2. Home -> Portfolio -> open Evidence and scope -> Back to Home.
3. Home -> Plan.
4. The same Portfolio and Plan routes through the mobile bottom navigation.

Visual inspection result:

- State, dominant priority and next step are legible in the first viewport.
- Paper is persistent and explicit; no real/demo mode is presented.
- Insufficient, stale and unavailable have distinct headings, status treatment and copy.
- No global portfolio-health claim or money-moving action is presented.
- Copy is not clipped, contrast/focus treatment is legible, and mobile utilities remain accessible through the fixed state bar and three-item bottom navigation.

Defects corrected during the Chrome session:

1. Increased prototype bar, selector, brand and action targets to at least 44 px.
2. Added a dedicated stale-data warning so stale is visually distinct from attention.
3. Added a scoped evidence disclosure to make the required progressive detail inspectable.
4. Updated static asset cache keys so the corrected files reload reliably in Chrome.

Unexpected unresolved defects: none.

## Classification

`ux_truth_safe_prototype_ready`

## UX-T1R human-first validation

- Real Chrome at 390 x 844 and 1440 x 900.
- Nine-step first-use journey navigated from welcome through the first-evaluation transition.
- Changed Home states captured: attention, stale, recorded stale assessment, scoped no-issue and unavailable.
- Concentration and voluntarily opened `Technical evidence` captured on mobile and desktop.
- Attention renders priority and its single primary action before value, cash, allocation and evidence.
- Stale renders `Refresh data` first and keeps the historical assessment secondary and explicitly not current.
- Direct state changes while Portfolio was open correctly replaced detail content for unavailable and insufficient; stale was marked historical; the scoped no-issue state did not show a concentration issue as current.
- No-portfolio screens contain no evaluation timestamp and hide Paper account/environment indicators.
- Only truth classifications A and B were observed; no C, D or E classification exists.
- No horizontal overflow or unexpected console error was observed.
- Evidence: `screenshots/t1r/` and `UX_T1R_HUMAN_FIRST.md`.

Classification: `ux_truth_safe_human_experience_ready`

## UX-T1R-R1 focused blocker recovery

### First-use exit and resume

- `Save and exit` is present on steps 1–8 and absent from the completed ninth step.
- Exiting at step 1 and at intermediate step 4 returned to Home without creating a Paper account, persisted plan, position, payment or real evaluation.
- Home displayed `Continue setup` and the paused step number.
- `Continue setup` resumed exactly at step 1 and step 4 respectively.
- `Back` remained a distinct secondary action and moved from step 4 to step 3.
- Normal progression through all nine steps and final completion was exercised.

### Portfolio state replacement

With Portfolio/concentration open, direct state changes retained `#portfolio` and replaced the concentration content:

- `unavailable` rendered `We could not update your Paper portfolio`;
- `data_incomplete` rendered `Some prices are missing`.

Both transitions were exercised and captured at the mobile and desktop viewports.

### Chrome validation

- Real Chrome viewports configured and measured: 390 x 844 and 1440 x 900.
- All 11 states were selected at both viewports.
- Maximum horizontal overflow across those 22 renders: 0 px.
- Minimum visible interactive target height: 44 px.
- Page console warnings/errors: `[]`.
- Application/API requests: zero. The only loads required by the isolated static document were `index.html`, `prototype.css` and `prototype.js`; `prototype.js` contains a rejecting `window.fetch` guard and no API URL.
- `node --check design/ux0-investing/prototype.js`: exit 0.
- `git diff --check`: exit 0.
- staging: empty.

### Screenshot dimensions

Chrome's viewport override reported the configured CSS viewport exactly through `innerWidth`/`innerHeight`. The Chrome extension screenshot raster excludes browser-managed capture insets and the scrollbar gutter, so the initial-viewport PNG is smaller: 375 x 811 for a measured 390 x 844 viewport, and 1425 x 891 for a measured 1440 x 900 viewport. The table records configured viewport, measured inner viewport and actual PNG dimensions separately; no PNG is described as having the configured viewport dimensions.

| filename | state/flow | configured viewport | measured inner viewport | PNG width/height | capture |
| --- | --- | --- | --- | --- | --- |
| `r1-desktop-data-incomplete.png` | data_incomplete | 1440 x 900 | 1440 x 900 | 1425 x 891 | initial viewport |
| `r1-desktop-home-continue-setup-step-4.png` | Home / Continue setup | 1440 x 900 | 1440 x 900 | 1425 x 891 | initial viewport |
| `r1-desktop-new-user.png` | new_user_unclassified | 1440 x 900 | 1440 x 900 | 1425 x 891 | initial viewport |
| `r1-desktop-no-portfolio-no-plan.png` | no_portfolio_no_plan | 1440 x 900 | 1440 x 900 | 1425 x 891 | initial viewport |
| `r1-desktop-plan.png` | Plan | 1440 x 900 | 1440 x 900 | 1425 x 891 | initial viewport |
| `r1-desktop-plan-ready-no-portfolio.png` | plan_ready_no_portfolio | 1440 x 900 | 1440 x 900 | 1425 x 891 | initial viewport |
| `r1-desktop-plan-setup.png` | plan_setup_in_progress | 1440 x 900 | 1440 x 900 | 1425 x 891 | initial viewport |
| `r1-desktop-portfolio-switch-data-incomplete.png` | Portfolio -> data_incomplete | 1440 x 900 | 1440 x 900 | 1425 x 891 | initial viewport |
| `r1-desktop-portfolio-switch-unavailable.png` | Portfolio -> unavailable | 1440 x 900 | 1440 x 900 | 1425 x 891 | initial viewport |
| `r1-desktop-resume-step-4.png` | resume at step 4 | 1440 x 900 | 1440 x 900 | 1425 x 891 | initial viewport |
| `r1-desktop-save-exit-intermediate-step-4.png` | Save and exit / step 4 | 1440 x 900 | 1440 x 900 | 1425 x 891 | initial viewport |
| `r1-mobile-back-to-step-3.png` | Back / step 4 to step 3 | 390 x 844 | 390 x 844 | 375 x 811 | initial viewport |
| `r1-mobile-data-incomplete.png` | data_incomplete | 390 x 844 | 390 x 844 | 375 x 811 | initial viewport |
| `r1-mobile-home-continue-setup-step-1.png` | Home / Continue setup / step 1 | 390 x 844 | 390 x 844 | 375 x 811 | initial viewport |
| `r1-mobile-home-continue-setup-step-4.png` | Home / Continue setup / step 4 | 390 x 844 | 390 x 844 | 375 x 811 | initial viewport |
| `r1-mobile-journey-complete.png` | normal completion | 390 x 844 | 390 x 844 | 375 x 811 | initial viewport |
| `r1-mobile-journey-step-1.png` | journey step 1 | 390 x 844 | 390 x 844 | 375 x 811 | initial viewport |
| `r1-mobile-journey-step-2.png` | journey step 2 | 390 x 844 | 390 x 844 | 375 x 811 | initial viewport |
| `r1-mobile-journey-step-3.png` | journey step 3 | 390 x 844 | 390 x 844 | 375 x 811 | initial viewport |
| `r1-mobile-journey-step-4.png` | journey step 4 | 390 x 844 | 390 x 844 | 375 x 811 | initial viewport |
| `r1-mobile-journey-step-5.png` | journey step 5 | 390 x 844 | 390 x 844 | 375 x 811 | initial viewport |
| `r1-mobile-journey-step-6.png` | journey step 6 | 390 x 844 | 390 x 844 | 375 x 811 | initial viewport |
| `r1-mobile-journey-step-7.png` | journey step 7 | 390 x 844 | 390 x 844 | 375 x 811 | initial viewport |
| `r1-mobile-journey-step-8.png` | journey step 8 | 390 x 844 | 390 x 844 | 375 x 811 | initial viewport |
| `r1-mobile-journey-step-9.png` | journey step 9 | 390 x 844 | 390 x 844 | 375 x 811 | initial viewport |
| `r1-mobile-new-user.png` | new_user_unclassified | 390 x 844 | 390 x 844 | 375 x 811 | initial viewport |
| `r1-mobile-no-portfolio-no-plan.png` | no_portfolio_no_plan | 390 x 844 | 390 x 844 | 375 x 811 | initial viewport |
| `r1-mobile-plan.png` | Plan | 390 x 844 | 390 x 844 | 375 x 811 | initial viewport |
| `r1-mobile-plan-ready-no-portfolio.png` | plan_ready_no_portfolio | 390 x 844 | 390 x 844 | 375 x 811 | initial viewport |
| `r1-mobile-plan-setup.png` | plan_setup_in_progress | 390 x 844 | 390 x 844 | 375 x 811 | initial viewport |
| `r1-mobile-portfolio-switch-data-incomplete.png` | Portfolio -> data_incomplete | 390 x 844 | 390 x 844 | 375 x 811 | initial viewport |
| `r1-mobile-portfolio-switch-unavailable.png` | Portfolio -> unavailable | 390 x 844 | 390 x 844 | 375 x 811 | initial viewport |
| `r1-mobile-resume-step-1.png` | resume at step 1 | 390 x 844 | 390 x 844 | 375 x 811 | initial viewport |
| `r1-mobile-resume-step-4.png` | resume at step 4 | 390 x 844 | 390 x 844 | 375 x 811 | initial viewport |
| `r1-mobile-save-exit-intermediate-step-4.png` | Save and exit / step 4 | 390 x 844 | 390 x 844 | 375 x 811 | initial viewport |
| `r1-mobile-save-exit-step-1.png` | Save and exit / step 1 | 390 x 844 | 390 x 844 | 375 x 811 | initial viewport |

### Git baseline and path-scoped isolation

Initial working-tree state was not clean. Before UX-T1R-R1, `design/ux0-investing/` was already untracked as part of `?? design/`, staging was empty, and unrelated changes already existed outside the permitted path.

Pre-existing modified production/out-of-scope files:

- `.gitignore`, `.vercelignore`, `next-env.d.ts`, `package.json`;
- `app/api/daily-snapshot/route.ts`, `app/app/tabs/AdvisorTab.tsx`, `AutonomyTab.tsx`, `DailyTab.tsx`, `PlanningTab.tsx`, `PortfolioTab.tsx`, `app/app/ui.tsx`;
- `app/ops/lab/page.tsx`, `app/ops/page.tsx`, `app/ops/trades/page.tsx`;
- `components/CockpitShell.tsx`, `components/daily/DailyHtmlDashboard.tsx`;
- `lib/ops/researchLabOverview.ts`, `lib/trading/backtest/datasets.ts`, `lib/trading/backtest/twelveDataHistorical.ts`, `lib/trading/research/fs.ts`, `index.ts`, `localArchiveInventory.ts`, `runner.ts`;
- `tests/researchLabOverview.test.ts`, `tests/tradingResearchExpansionInstruments.test.ts`.

Pre-existing untracked out-of-scope paths included `Data/`, additional `lib/trading/research/twelveData*` modules, `scripts/trading/` archive/campaign scripts and additional trading tests.

The UX-T1R-R1 task changed only:

- `design/ux0-investing/prototype.js`;
- `design/ux0-investing/prototype.css`;
- `design/ux0-investing/README.md`;
- `design/ux0-investing/VALIDATION.md`;
- `design/ux0-investing/UX_T1R_HUMAN_FIRST.md`;
- new `design/ux0-investing/screenshots/t1r/r1-*.png` evidence files.

No production-path changes were introduced by UX-T1R-R1; unrelated pre-existing working-tree changes remain outside the task scope.

Classification: `ux_t1r_blockers_fixed`
