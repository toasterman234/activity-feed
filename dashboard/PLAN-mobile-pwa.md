# Plan: Mobile PWA Hardening

**Status:** mostly shipped — real channel/thread routes, Serwist SW (`sw.ts`), install prompt, update prompt. Remaining polish: proper 180×180 Apple touch icon (`layout.tsx` TODO still uses `/icon-192.png`). Bottom nav is now 6 tabs (Home, Activity, Channels, Fleet, Finance, Settings).

App: `activity-feed/dashboard` (Next.js 16 App Router, Electric SQL sync).
Goal: close the gap between "website with a manifest" and an actual installed-feeling mobile app. Two structural changes (real routing for nested views, a service worker) plus a set of small polish fixes. Ordered so each step is independently shippable/testable — do not batch them into one PR.

Historical pre-build notes (superseded by shipped code above):
- `src/app/layout.tsx` already sets `viewport-fit=cover`, `theme-color`, `appleWebApp` meta, manifest link.
- Channel/thread routing was rebuilt out of the old single-component overlay.
- Service worker + install/update prompts now exist under `src/app/`.

---

## 1. Real routing for channels/threads (do this first — item 2 depends on knowing what "a page" is)

**Problem:** channel and thread drill-in are div-toggle state, not URLs. Back button/swipe-back exits `/channels` instead of closing the thread. No deep links.

**Target structure:**
```
src/app/channels/page.tsx              -> channel list (server component wrapper, same as today)
src/app/channels/ChannelsContent.tsx   -> keep as the list view ONLY, strip out channel/thread panes
src/app/channels/[channelId]/page.tsx  -> single channel view (messages list)
src/app/channels/[channelId]/[threadId]/page.tsx -> thread view
```

Steps:
1. Read `ChannelsContent.tsx` in full first — it currently owns the Electric live-query subscriptions for channels, messages, and threads in one component. Identify which query needs which URL param (`channelId`, `threadId`) so you can split the data fetching per-route instead of per-pane-state.
2. Create `src/app/channels/[channelId]/page.tsx` as a client component (`"use client"`, same pattern as existing pages) that reads `channelId` via `useParams()`, runs the messages live-query scoped to that channel, and renders what is currently the "channel" pane. Back button here is a real `<Link href="/channels">` (or `router.back()`) — no custom state needed, browser back now works for free.
3. Create `src/app/channels/[channelId]/[threadId]/page.tsx` the same way for the thread pane — reads `threadId`, runs the thread messages query, renders what is currently the `fixed inset-0` overlay content but as a normal full-screen page (drop the `fixed inset-0 z-30` — a route-level page is already full screen). Back button → `<Link href={`/channels/${channelId}`}>`.
4. In the channel list (`ChannelsContent.tsx`), replace the `setMobilePane("channel")` click handler with `<Link href={`/channels/${channel.id}`}>`. Replace any "open thread" click handler similarly with a link to the thread route.
5. Delete `mobilePane` state, the "← Back" button that manipulated it, and the overlay div wrapper once nothing references them.
6. Reply box / sticky footer (currently `ChannelsContent.tsx:377`, has `env(safe-area-inset-bottom)` padding) moves into the new thread page — keep the safe-area padding exactly as-is, don't drop it in the move.
7. Verify: `beforeinstallprompt` aside, test in the browser (Interceptor skill, per user's global instruction — any UI work must be browser-checked, not just "the code compiles") — click channel → thread → use actual browser back button (not an in-app button) twice, confirm it lands back on `/channels` correctly at each step, not off the page entirely. Test on a real phone or responsive mobile viewport, since this is the whole point.

**Do not** try to preserve scroll position or add transition animations in this step — that's a separate nice-to-have, not required for correctness.

---

## 2. Service worker via Serwist

**Problem:** zero offline support, zero asset caching, no update-available handling.

Steps:
1. `npm install @serwist/next serwist`
2. Create `src/app/sw.ts`:
   - Precache the app shell entries Serwist's webpack plugin generates (`self.__SW_MANIFEST`).
   - Runtime caching rules (use `defaultCache` from `@serwist/next/worker` as the base, then override/add):
     - HTML/navigation requests → `NetworkFirst` (data changes constantly here — an Electric-synced dashboard is not the place for aggressive stale caching of pages).
     - `/api/*` routes → `NetworkFirst` with a short timeout fallback to cache, since this app's whole point is live financial/activity data — do NOT use `CacheFirst` or `StaleWhileRevalidate` for anything under `/api/` or it'll show stale portfolio/activity numbers.
     - Static assets (`_next/static/*`, icons, fonts) → `CacheFirst`, long expiration.
   - Note the existing rewrite proxy in `next.config.ts` sends `/api/*`, `/ds/*`, `/market-lake/*` to local backend ports — the service worker sits in front of the browser's fetches to these same-origin paths, so caching rules keyed on those path prefixes will work without any change to the rewrite config.
3. Wrap `next.config.ts` with `withSerwist` from `@serwist/next`, pointing at `src/app/sw.ts`. Keep the existing `typescript.ignoreBuildErrors`, `allowedDevOrigins`, and `rewrites` config untouched — just wrap the export.
4. Add `public/sw.js` to `.gitignore` if Serwist generates it there (check its docs output path — don't hand-commit a generated file).
5. Register: Serwist's Next integration auto-injects registration; confirm no manual `navigator.serviceWorker.register()` call is needed (it shouldn't be, with `@serwist/next`) — if it does need one, add it as a small client component mounted in `layout.tsx`.
6. Update-available handling: Serwist exposes an event/callback when a new SW is waiting. Add a minimal toast/banner ("New version available — Reload") rather than silently swapping code under an active session — this app has live financial data on screen, silently reloading mid-session is bad UX. Skip building custom UI chrome for this if Serwist ships a ready-made prompt hook; otherwise a simple fixed-bottom banner above the tab bar is enough.
7. Verify: run `npm run build && npm run start` (service workers generally don't run in `next dev`), open in a browser, check Application tab → Service Workers shows it registered and Cache Storage is populated. Kill the local backend ports and confirm the app shell still loads (data will error/empty, that's expected — just confirm it doesn't white-screen).

---

## 3. Install prompt (`beforeinstallprompt`)

Small, independent, do anytime after item 1.

1. New client component `src/app/install-prompt.tsx`:
   - `useEffect` listens for `beforeinstallprompt`, calls `e.preventDefault()`, stores the event in state/ref.
   - Renders nothing until the event has fired AND the app isn't already installed (check `window.matchMedia('(display-mode: standalone)').matches` to skip if already installed).
   - Small dismissible banner (respect safe-area, same pattern as bottom-nav) with an "Install" button that calls `deferredEvent.prompt()`.
   - Persist a "dismissed" flag in `localStorage` so it doesn't nag every visit after the user closes it once.
2. iOS Safari doesn't fire `beforeinstallprompt` at all — add a separate, simpler banner path: detect iOS Safari via UA sniff (`/iPhone|iPad/.test(navigator.userAgent) && !window.MSStream` combined with not-standalone check) and show static instructional text ("Tap Share, then Add to Home Screen") instead. Same dismiss/localStorage behavior.
3. Mount `<InstallPrompt />` once in `layout.tsx`.
4. Verify in browser: Chrome DevTools → Application → Manifest has an "Add to home screen" simulate option; confirm banner appears and the real install flow completes.

---

## 4. CSS/polish fixes (`src/app/globals.css`)

Small, no dependencies, safe to do first if you want a quick win before the bigger items.

1. Add to `globals.css`:
   ```css
   * {
     -webkit-tap-highlight-color: transparent;
   }
   html, body {
     overscroll-behavior-y: contain;
   }
   ```
   Use `contain`, not `none` — `none` also kills the natural momentum bounce, `contain` just stops the pull-to-refresh/rubber-band from leaking to the browser chrome while preserving in-app scroll feel. If a custom pull-to-refresh gesture gets added later, revisit this.
2. Add `safe-area-inset-top` padding to any sticky/fixed header — audit found none currently applied. Check the header in the new `[channelId]/page.tsx` and `[threadId]/page.tsx` from item 1, plus any other sticky top bar (main feed page, finance page) and add `pt-[env(safe-area-inset-top)]` consistently, matching the existing bottom-nav pattern (`pb-[env(safe-area-inset-bottom)]`).
3. Fix the Apple touch icon: generate/export a proper 180×180 PNG (not a resize of the 192 icon if avoidable — re-export from source art at 180×180) and update `src/app/layout.tsx`'s `apple` icon reference to point at it, e.g. `/apple-touch-icon.png`.
4. Verify visually in a real mobile viewport (Interceptor): tap a button and confirm no gray highlight flash, and confirm no rubber-band scroll leaking into a native "refresh" gesture. Since this is UI, don't mark done from code-read alone.

---

## Suggested order for pi agent

1. Item 4 (CSS polish) — fast, isolated, zero risk, ship first.
2. Item 1 (routing) — structural, everything else in channels builds on it.
3. Item 2 (service worker) — biggest lift, do after routing is stable so precaching targets are correct.
4. Item 3 (install prompt) — independent, do last or in parallel with item 2.

Each item should be its own commit/PR, browser-verified before moving to the next — do not declare any of these done from a passing `next build` alone.
