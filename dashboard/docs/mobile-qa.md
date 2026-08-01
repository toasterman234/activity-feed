# Mobile QA workflow

This project now has an agent-runnable mobile visual QA loop for the React PWA.

## Primary target
- iPhone 14 portrait: `390x844`

## Other checked viewports
- `320x568`
- `375x667`
- `393x852`
- `430x932`

## Browsers
- Primary: WebKit
- Secondary: Chromium

## Commands
- `npm run test:mobile`
- `npm run test:mobile:update`
- `npm run test:mobile:report`
- `npm run test:mobile:perf` — speed/snappiness audit

## What it does
The Playwright suite:
- starts or reuses the local dev server
- visits major `mobile-v2` routes
- opens the mobile drawer shell
- checks inbox search/focus state
- drills into inbox and Tududi detail pages when links exist
- captures viewport and full-page screenshots
- stores screenshot regression baselines with `toHaveScreenshot()`
- retains traces/videos/screenshots on failure
- writes a concise mobile layout audit summary

## Artifacts
Under `tmp-qa/mobile-qa/`:
- `screenshots/` — route + viewport screenshots
- `audits/` — JSON layout audit files per route/project
- `test-results/` — Playwright failure artifacts
- `html-report/` — HTML report
- `results.json` — machine-readable test report
- `mobile-layout-audit.md` — concise summary
- `perf/` — raw perf snapshots per route/viewport (navigation timings, longtasks, app measures)
- `mobile-perf-audit.md` — speed audit with pass/warn/fail verdicts

## Layout checks included
The audit checks for:
- horizontal page overflow
- elements extending outside the viewport
- clipped text containers
- touch targets smaller than `44x44`

## Current limits
This is strong emulator coverage, not full iPhone Safari parity.

Still validate on real-device Safari / BrowserStack for:
- safe-area behavior in standalone/PWA mode
- keyboard/input behavior
- iOS overscroll quirks
- sticky/fixed positioning under Safari
- install/update prompts and standalone display mode

## Perf/speed checks (`npm run test:mobile:perf`)

Runs the same 8 CORE_ROUTES across all viewports and captures:
- Navigation timings: TTFB, FCP, DOM Complete (via CDP on Chromium, PerformanceTiming on WebKit)
- Longtasks: any main-thread block ≥ 200ms (via PerformanceObserver)
- App measures: any `performance.measure()` spans recorded by the app (e.g. `route.render`, `activity.enrich`)

Thresholds:
| Metric | Pass ≤ | Warn ≤ | Fail > |
| --- | --- | --- | --- |
| TTFB | 800ms | 1800ms | 1800ms |
| FCP | 1800ms | 3000ms | 3000ms |
| DOM Complete | 2500ms | 5000ms | 5000ms |
| App measures (p75) | 50ms | 200ms | 200ms |
| Longtask (any) | 0 | — | 200ms |

Output: `tmp-qa/mobile-qa/mobile-perf-audit.md` with a per-route verdict.

## Suggested workflow
1. Make UI change.
2. Run `npm run test:mobile`.
3. Review `tmp-qa/mobile-qa/mobile-layout-audit.md`.
4. Open `tmp-qa/mobile-qa/html-report/index.html` if something failed.
5. Rebaseline only when the visual change is intentional with `npm run test:mobile:update`.
6. Before release, do one BrowserStack or real iPhone Safari pass.
