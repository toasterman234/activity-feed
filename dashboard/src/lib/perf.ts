"use client";

// Client-side performance reporting. See docs/decisions/ADR-004-perf-monitoring.md
//
// Two sources feed one sink (`/api/perf/write` -> unlogged perf_metrics):
//   kind='vital'   — Web Vitals from next/web-vitals (LCP, INP, CLS, TTFB, FCP)
//   kind='measure' — explicit spans you wrap with measure()/startMeasure()
//
// Design constraints specific to this app:
//   * Batched and flushed on pagehide via sendBeacon. Per-metric POSTs would
//     compete with Electric's long-poll connections (ADR-003) — the same
//     starvation this instrumentation exists to detect.
//   * performance.mark/measure are used for real, so spans also show up in the
//     browser Performance panel next to React Scan's render data (ADR-002).
//   * Kill switch: localStorage `perf:off` = "1", or NEXT_PUBLIC_PERF_DISABLED.

export type PerfKind = "vital" | "measure";

export type PerfEntry = {
  kind: PerfKind;
  name: string;
  value: number;
  route: string;
  rating?: string;
  detail?: Record<string, unknown>;
};

const FLUSH_INTERVAL_MS = 10_000;
const MAX_QUEUE = 40;

// Keep in sync with the App Router tree so aggregates group by route pattern
// instead of by every channel/thread id.
const ROUTE_PATTERNS: Array<[RegExp, string]> = [
  [/^\/channels\/[^/]+\/[^/]+\/?$/, "/channels/[channelId]/[threadId]"],
  [/^\/channels\/[^/]+\/?$/, "/channels/[channelId]"],
  [/^\/settings(?:\/.*)?$/, "/settings"],
  [/^\/perf\/?$/, "/settings"], // old URL redirects here
];

let queue: PerfEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let listenersBound = false;
let sessionId: string | null = null;

export function normalizeRoute(pathname: string): string {
  for (const [re, pattern] of ROUTE_PATTERNS) {
    if (re.test(pathname)) return pattern;
  }
  return pathname === "" ? "/" : pathname.replace(/\/$/, "") || "/";
}

export function perfEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NEXT_PUBLIC_PERF_DISABLED === "1") return false;
  try {
    if (window.localStorage.getItem("perf:off") === "1") return false;
  } catch {
    // Private mode / blocked storage — fall through to enabled.
  }
  const sample = Number(process.env.NEXT_PUBLIC_PERF_SAMPLE ?? "1");
  return sessionSample(Number.isFinite(sample) ? sample : 1);
}

// Sample per session rather than per entry, so a session either has a complete
// picture or none at all. Partial sessions make percentiles hard to read.
function sessionSample(rate: number): boolean {
  if (rate >= 1) return true;
  if (rate <= 0) return false;
  const id = getSessionId();
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return (hash % 1000) / 1000 < rate;
}

function getSessionId(): string {
  if (sessionId) return sessionId;
  const fresh = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    const stored = window.sessionStorage.getItem("perf:sid");
    sessionId = stored ?? fresh();
    if (!stored) window.sessionStorage.setItem("perf:sid", sessionId);
  } catch {
    sessionId = fresh();
  }
  return sessionId;
}

function device(): string {
  if (typeof window === "undefined") return "unknown";
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator && Boolean(window.navigator.standalone));
  const form = window.innerWidth < 768 ? "mobile" : "desktop";
  return standalone ? `${form}-pwa` : form;
}

function bindListeners() {
  if (listenersBound || typeof document === "undefined") return;
  listenersBound = true;
  // pagehide covers iOS Safari, where visibilitychange alone is unreliable and
  // this app is usually an installed PWA.
  const flushNow = () => flush(true);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushNow();
  });
  window.addEventListener("pagehide", flushNow);
}

export function reportPerf(entry: PerfEntry): void {
  if (!perfEnabled()) return;
  bindListeners();
  queue.push(entry);

  if (queue.length >= MAX_QUEUE) {
    flush(false);
    return;
  }
  if (flushTimer === null) {
    flushTimer = setTimeout(() => flush(false), FLUSH_INTERVAL_MS);
  }
}

export function flush(useBeacon: boolean): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (queue.length === 0) return;

  const payload = JSON.stringify({
    sessionId: getSessionId(),
    device: device(),
    entries: queue,
  });
  queue = [];

  const url = "/api/perf/write";
  if (useBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
    return;
  }
  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => {
    // Perf reporting must never surface an error to the user.
  });
}

function currentRoute(): string {
  if (typeof window === "undefined") return "unknown";
  return normalizeRoute(window.location.pathname);
}

/**
 * Times an already-running span. Call the returned function when the work ends.
 * Safe to call unconditionally — it no-ops when reporting is disabled.
 */
export function startMeasure(
  name: string,
  detail?: Record<string, unknown>,
): (extraDetail?: Record<string, unknown>) => void {
  if (typeof performance === "undefined" || !perfEnabled()) return () => {};

  const startMark = `${name}:start:${Math.random().toString(36).slice(2, 8)}`;
  performance.mark(startMark);
  const t0 = performance.now();

  return (extraDetail?: Record<string, unknown>) => {
    const value = performance.now() - t0;
    try {
      performance.measure(name, startMark);
    } catch {
      // Mark was cleared (e.g. buffer pressure) — the timing is still valid.
    }
    performance.clearMarks(startMark);
    performance.clearMeasures(name);
    reportPerf({
      kind: "measure",
      name,
      value,
      route: currentRoute(),
      detail: { ...detail, ...extraDetail },
    });
  };
}

/** Wraps a synchronous block, reporting how long it took. */
export function measure<T>(name: string, fn: () => T, detail?: Record<string, unknown>): T {
  const stop = startMeasure(name, detail);
  try {
    return fn();
  } finally {
    stop();
  }
}

/** Reports a Web Vital. Called by src/app/web-vitals.tsx. */
export function reportVital(metric: {
  name: string;
  value: number;
  rating?: string;
  navigationType?: string;
}): void {
  reportPerf({
    kind: "vital",
    name: metric.name,
    // CLS is unitless; everything else is milliseconds. Round to keep the
    // payload small without losing anything meaningful.
    value: metric.name === "CLS" ? Number(metric.value.toFixed(4)) : Math.round(metric.value),
    route: currentRoute(),
    rating: metric.rating,
    detail: metric.navigationType ? { navigationType: metric.navigationType } : undefined,
  });
}
