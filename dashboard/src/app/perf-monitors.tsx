"use client";

// All passive perf collection for the app, in one mount. See
// docs/decisions/ADR-004-perf-monitoring.md.
//
//   1. Web Vitals   — LCP / INP / CLS / FCP / TTFB, per load and per client nav
//   2. route.render — pathname commit -> first paint after it, which is the
//                     metric that moves when a navigation stalls (the stuck
//                     "Rendering" pill from ADR-001/ADR-003)
//   3. longtask     — main-thread blocks, the thing that actually feels like lag
//
// React Scan (ADR-002) still owns per-component render attribution in dev; this
// records the aggregate cost so regressions are visible after the fact.

import { useReportWebVitals } from "next/web-vitals";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { normalizeRoute, perfEnabled, reportPerf, reportVital } from "@/lib/perf";

// Below this, a long task is indistinguishable from normal work and would
// drown out the entries worth looking at.
const LONGTASK_MIN_MS = 200;
const LONGTASK_CAP_PER_SESSION = 50;

export default function PerfMonitors() {
  const pathname = usePathname();
  const longTaskCount = useRef(0);

  useReportWebVitals((metric) => {
    reportVital(metric);
  });

  // Route render cost. The effect runs on commit; rAF + a macrotask defers the
  // reading until after the browser has painted that commit.
  //
  // Only measured while the tab is visible, and rechecked before reporting:
  // a hidden tab never runs rAF, so an unguarded version would fire whenever
  // the tab was restored and log time-to-visible as if it were render time.
  useEffect(() => {
    if (!perfEnabled() || typeof performance === "undefined") return;
    if (document.visibilityState !== "visible") return;

    const t0 = performance.now();
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    raf = requestAnimationFrame(() => {
      timer = setTimeout(() => {
        if (document.visibilityState !== "visible") return;
        reportPerf({
          kind: "measure",
          name: "route.render",
          value: performance.now() - t0,
          route: normalizeRoute(pathname || "/"),
        });
      }, 0);
    });

    return () => {
      cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
    };
  }, [pathname]);

  useEffect(() => {
    if (!perfEnabled() || typeof PerformanceObserver === "undefined") return;

    let observer: PerformanceObserver;
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration < LONGTASK_MIN_MS) continue;
          if (longTaskCount.current >= LONGTASK_CAP_PER_SESSION) return;
          longTaskCount.current += 1;
          reportPerf({
            kind: "measure",
            name: "longtask",
            value: entry.duration,
            // window.location, not the pathname closure: a long task can land
            // mid-navigation, and the route it blocked is the useful one.
            route: normalizeRoute(window.location.pathname),
          });
        }
      });
      observer.observe({ type: "longtask", buffered: true });
    } catch {
      // Safari has no longtask support; vitals and route.render still work.
      return;
    }

    return () => observer.disconnect();
  }, []);

  return null;
}
