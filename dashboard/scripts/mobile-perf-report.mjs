#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

// ── Thresholds ──────────────────────────────────────────────────────────

// Core Web Vitals thresholds: [pass, warn] upper bounds (ms)
// Anything above "warn" is "fail"
const VITAL_THRESHOLDS = {
  ttfb:    { pass: 800,  warn: 1800 },
  fcp:     { pass: 1800, warn: 3000 },
  domComplete: { pass: 2500, warn: 5000 },
};

// App measures: p75 ceiling
const MEASURE_THRESHOLDS = {
  // Below pass = green, below warn = amber, above = red
  "route.render":           { pass: 50,  warn: 200 },
  "activity.enrich":        { pass: 50,  warn: 200 },
  "activity.filter":        { pass: 50,  warn: 200 },
  "channels.threadExtras":  { pass: 200, warn: 500 },
  default:                  { pass: 50,  warn: 200 },
};

// Next.js internal measures are recorded but never scored — they reflect
// framework overhead, not app code. Shown for visibility only.
const NEXT_INTERNAL = /^Next\.js-/;

// Any longtask > 200ms is a fail
const LONGTASK_FAIL_MS = 200;

// ── Paths ───────────────────────────────────────────────────────────────

const ROOT = path.resolve(process.cwd(), "tmp-qa/mobile-qa");
const PERF_DIR = path.join(ROOT, "perf");
const OUT = path.join(ROOT, "mobile-perf-audit.md");

// ── Helpers ─────────────────────────────────────────────────────────────

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function readJSON(p) {
  try {
    return JSON.parse(await fs.readFile(p, "utf8"));
  } catch {
    return null;
  }
}

function round(n) { return Math.round(n); }

function pct(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil(p / 100 * sorted.length) - 1;
  return sorted[idx] ?? sorted[sorted.length - 1];
}

// ── Gather ──────────────────────────────────────────────────────────────

async function gatherAll() {
  if (!(await exists(PERF_DIR))) return [];
  const projects = await fs.readdir(PERF_DIR);
  const snapshots = [];
  for (const proj of projects) {
    const dir = path.join(PERF_DIR, proj);
    const files = await fs.readdir(dir);
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      const snap = await readJSON(path.join(dir, f));
      if (snap) snapshots.push(snap);
    }
  }
  return snapshots;
}

function summarize(snapshots) {
  const rows = [];

  for (const s of snapshots) {
    const nav = s.navigation;
    const lt = s.longtasks ?? [];
    const measures = s.measures ?? [];

    const measureMap = {};
    for (const m of measures) {
      const bucket = measureMap[m.name] ??= { values: [], detail: [] };
      bucket.values.push(m.value);
      if (m.detail) bucket.detail.push(m.detail);
    }

    const flatMeasures = {};
    for (const [name, bucket] of Object.entries(measureMap)) {
      const vals = bucket.values;
      flatMeasures[name] = {
        count: vals.length,
        p50: round(pct(vals, 50)),
        p75: round(pct(vals, 75)),
        max: round(Math.max(...vals)),
      };
    }

    rows.push({
      route: s.route,
      slug: s.slug,
      project: s.project,
      viewport: s.viewport ? `${s.viewport.width}x${s.viewport.height}` : "unknown",
      ttfb: nav?.ttfb ?? -1,
      fcp: nav?.fcp ?? -1,
      domComplete: nav?.domComplete ?? -1,
      longtaskCount: lt.length,
      longtaskMax: lt.length ? round(Math.max(...lt.map((l) => l.duration))) : 0,
      measures: flatMeasures,
      errors: s.errors ?? [],
    });
  }

  return rows;
}

// ── Scoring ─────────────────────────────────────────────────────────────

function scoreVital(name, value) {
  const t = VITAL_THRESHOLDS[name];
  if (!t || value < 0) return "skip";
  if (value <= t.pass) return "pass";
  if (value <= t.warn) return "warn";
  return "fail";
}

function scoreMeasure(name, p75value) {
  // Next.js internals are informational — never score them
  if (NEXT_INTERNAL.test(name)) return "skip";
  const t = MEASURE_THRESHOLDS[name] ?? MEASURE_THRESHOLDS.default;
  if (p75value <= t.pass) return "pass";
  if (p75value <= t.warn) return "warn";
  return "fail";
}

function worstVerdict(...verdicts) {
  if (verdicts.includes("fail")) return "fail";
  if (verdicts.includes("warn")) return "warn";
  if (verdicts.includes("pass")) return "pass";
  return "skip";
}

function verdictGlyph(v) {
  if (v === "pass") return "🟢";
  if (v === "warn") return "🟡";
  if (v === "fail") return "🔴";
  return "⚪";
}

// ── Report ──────────────────────────────────────────────────────────────

async function writeReport(rows) {
  const lines = [];
  lines.push("# Mobile performance audit");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Snapshots: ${rows.length}`);
  lines.push("");

  if (!rows.length) {
    lines.push("No perf snapshot files found. Run `npm run test:mobile:perf` first.");
    await fs.mkdir(ROOT, { recursive: true });
    await fs.writeFile(OUT, lines.join("\n") + "\n");
    return;
  }

  // Scores per row
  const scored = rows.map((r) => {
    const verdicts = [];
    verdicts.push(scoreVital("ttfb", r.ttfb));
    verdicts.push(scoreVital("fcp", r.fcp));
    verdicts.push(scoreVital("domComplete", r.domComplete));

    for (const [name, m] of Object.entries(r.measures)) {
      verdicts.push(scoreMeasure(name, m.p75));
    }

    if (r.longtaskCount > 0) verdicts.push("fail");

    return { ...r, verdict: worstVerdict(...verdicts), verdicts };
  });

  // Summary stats
  const grouped = {};
  for (const s of scored) {
    const key = `${s.route} @ ${s.viewport}`;
    grouped[key] = worstVerdict(grouped[key] ?? "skip", s.verdict);
  }
  const counts = { pass: 0, warn: 0, fail: 0, skip: 0 };
  for (const v of Object.values(grouped)) counts[v]++;

  lines.push("## Summary");
  lines.push("");
  lines.push(`- ${counts.pass} route/viewports passing 🟢`);
  lines.push(`- ${counts.warn} route/viewports with warnings 🟡`);
  lines.push(`- ${counts.fail} route/viewports failing 🔴`);
  if (counts.skip) lines.push(`- ${counts.skip} skipped (no data) ⚪`);
  lines.push("");

  // Per-route table
  lines.push("## Per-route details");
  lines.push("");

  const sorted = scored.sort((a, b) => `${a.route}:${a.viewport}`.localeCompare(`${b.route}:${b.viewport}`));

  for (const r of sorted) {
    lines.push(`### ${r.route} — ${r.viewport} ${verdictGlyph(r.verdict)}`);
    lines.push("");
    lines.push(`| Metric | Value | Verdict |`);
    lines.push(`| --- | --- | --- |`);
    lines.push(`| TTFB | ${r.ttfb >= 0 ? `${r.ttfb}ms` : "—"} | ${verdictGlyph(scoreVital("ttfb", r.ttfb))} |`);
    lines.push(`| FCP | ${r.fcp >= 0 ? `${r.fcp}ms` : "—"} | ${verdictGlyph(scoreVital("fcp", r.fcp))} |`);
    lines.push(`| DOM Complete | ${r.domComplete >= 0 ? `${r.domComplete}ms` : "—"} | ${verdictGlyph(scoreVital("domComplete", r.domComplete))} |`);
    lines.push(`| Longtasks | ${r.longtaskCount} (max ${r.longtaskMax}ms) | ${r.longtaskCount > 0 ? verdictGlyph("fail") : verdictGlyph("pass")} |`);

    const measureNames = Object.keys(r.measures).sort();
    for (const name of measureNames) {
      const m = r.measures[name];
      lines.push(`| \`${name}\` p75 | ${m.p75}ms (n=${m.count}, max=${m.max}ms) | ${verdictGlyph(scoreMeasure(name, m.p75))} |`);
    }

    if (r.errors.length) {
      lines.push("");
      lines.push(`Errors: ${r.errors.join(", ")}`);
    }
    lines.push("");
  }

  // Threshold reference
  lines.push("## Threshold reference");
  lines.push("");
  lines.push("| Metric | Pass ≤ | Warn ≤ | Fail > |");
  lines.push("| --- | --- | --- | --- |");
  for (const [name, t] of Object.entries(VITAL_THRESHOLDS)) {
    lines.push(`| ${name} | ${t.pass}ms | ${t.warn}ms | ${t.warn}ms |`);
  }
  lines.push(`| Longtask (any) | 0 | — | ${LONGTASK_FAIL_MS}ms |`);
  lines.push(`| App measures (p75) | ${MEASURE_THRESHOLDS.default.pass}ms | ${MEASURE_THRESHOLDS.default.warn}ms | ${MEASURE_THRESHOLDS.default.warn}ms |`);
  lines.push("| \`Next.js-*\` measures | — | — | informational only |");
  lines.push("");
  lines.push("## Artifacts");
  lines.push("");
  lines.push(`- Raw perf snapshots: \`${path.relative(process.cwd(), PERF_DIR)}\``);
  lines.push("");

  await fs.mkdir(ROOT, { recursive: true });
  await fs.writeFile(OUT, lines.join("\n") + "\n");
  console.log(`Wrote ${OUT}`);
}

// ── Main ────────────────────────────────────────────────────────────────

const snapshots = await gatherAll();
const rows = summarize(snapshots);
await writeReport(rows);

if (rows.length) {
  const failing = rows.filter((r) => {
    const v = scoreVital("ttfb", r.ttfb);
    const v2 = scoreVital("fcp", r.fcp);
    return v === "fail" || v2 === "fail" || r.longtaskCount > 0;
  });
  if (failing.length) {
    console.error(`\n${failing.length} route/viewport(s) have perf failures — see report for details.`);
    process.exit(1);
  }
}
