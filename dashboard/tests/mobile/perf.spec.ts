import { test } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import {
  ARTIFACT_ROOT,
  CORE_ROUTES,
  ensureDir,
  routeSlug,
  settle,
} from "./helpers";

// ── Types ───────────────────────────────────────────────────────────────

type PerfSnapshot = {
  route: string;
  slug: string;
  project: string;
  viewport: { width: number; height: number };
  timestamp: string;
  navigation: {
    ttfb: number;
    fcp: number;
    domComplete: number;
    transferSize: number;
    encodedBodySize: number;
  } | null;
  longtasks: Array<{ name: string; duration: number }>;
  measures: Array<{ name: string; value: number; detail?: Record<string, unknown> }>;
  errors: string[];
};

// ── Collectors ──────────────────────────────────────────────────────────

async function collectNavigationTiming(page: any, browserName: string): Promise<PerfSnapshot["navigation"]> {
  // Collect what we can cross-browser via the legacy PerformanceTiming API.
  // PerformanceNavigationTiming (Level 2) entries are often cleared by the
  // time Playwright's evaluate runs, but timing is a snapshot that persists.
  const timing = await page.evaluate(() => {
    const t = performance.timing as any;
    if (!t || t.navigationStart === 0) return null;
    return {
      ttfb: t.responseStart > 0 ? t.responseStart - t.navigationStart : -1,
      fcp: -1, // not available via timing API
      domComplete: t.domComplete > 0 ? t.domComplete - t.navigationStart : -1,
      transferSize: -1,
      encodedBodySize: -1,
    };
  }).catch(() => null);

  if (!timing) return null;

  // Chromium: supplement with FCP from paint entries
  if (browserName === "chromium" && timing.ttfb > 0) {
    const fcp = await page.evaluate(() => {
      const entries = performance.getEntriesByType("paint") as PerformanceEntry[];
      const e = entries.find((e) => e.name === "first-contentful-paint");
      return e ? Math.round(e.startTime) : -1;
    }).catch(() => -1);
    timing.fcp = fcp;
  }

  return timing;
}

async function collectLongtasks(
  page: any,
): Promise<PerfSnapshot["longtasks"]> {
  return page
    .evaluate(() => {
      const tasks: Array<{ name: string; duration: number }> = [];
      const entries = performance.getEntriesByType(
        "longtask",
      ) as PerformanceEntry[];
      for (const e of entries) {
        if (e.duration >= 200) {
          tasks.push({ name: "longtask", duration: Math.round(e.duration) });
        }
      }
      return tasks;
    })
    .catch(() => []);
}

async function collectMeasures(page: any): Promise<PerfSnapshot["measures"]> {
  return page
    .evaluate(() => {
      const measures: Array<{
        name: string;
        value: number;
        detail?: Record<string, unknown>;
      }> = [];
      const entries = performance.getEntriesByType("measure");
      for (const e of entries) {
        if (e.duration > 0) {
          measures.push({ name: e.name, value: Math.round(e.duration) });
        }
      }
      return measures;
    })
    .catch(() => []);
}

// ── Helpers ─────────────────────────────────────────────────────────────

async function writePerfSnapshot(testInfo: any, snapshot: PerfSnapshot) {
  const dir = path.join(ARTIFACT_ROOT, "perf", testInfo.project.name);
  await ensureDir(dir);
  await fs.writeFile(
    path.join(dir, `${snapshot.slug}.json`),
    JSON.stringify(snapshot, null, 2),
  );
}

// ── Tests ───────────────────────────────────────────────────────────────

// Per-route, NOT serial — a timeout on one route must not kill the rest.
// Each test is fully self-contained within its project (browser+viewport).

const ROUTE_TIMEOUT = 20_000; // individual goto; faster fail than the 90s suite timeout

for (const route of CORE_ROUTES) {
  test(`perf audit ${route}`, async ({ page }, testInfo) => {
    test.setTimeout(ROUTE_TIMEOUT + 10_000);

    const snapshot: PerfSnapshot = {
      route,
      slug: routeSlug(route),
      project: testInfo.project.name,
      viewport: testInfo.project.use.viewport,
      timestamp: new Date().toISOString(),
      navigation: null,
      longtasks: [],
      measures: [],
      errors: [],
    };

    try {
      await page.goto(route, {
        waitUntil: "domcontentloaded",
        timeout: ROUTE_TIMEOUT,
      });
      await settle(page);
      await page.waitForTimeout(1000);

      snapshot.navigation = await collectNavigationTiming(page, testInfo.project.use.browserName ?? "webkit");
      snapshot.longtasks = await collectLongtasks(page);
      snapshot.measures = await collectMeasures(page);
    } catch (err) {
      // Don't fail the test — write the partial snapshot with the error so
      // the report can flag it. A route that doesn't load IS a perf finding.
      snapshot.errors.push(String(err));
    }

    await writePerfSnapshot(testInfo, snapshot);
  });
}
