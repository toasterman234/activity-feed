#!/usr/bin/env node
/**
 * PLAN / initiative evidence checker.
 *
 * Compares docs/evidence-map.json claims against the filesystem (and optional
 * PLAN status headers). Exit 1 on hard mismatches. Use --json for machine output.
 */
import { access, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mapPath = path.join(root, "docs/evidence-map.json");
const snapshotOut = path.join(root, "data/evidence-status.snapshot.json");

const STATUS_PATTERNS = [
  { id: "mostly_shipped", re: /\bmostly shipped\b/i },
  { id: "shipped", re: /\bshipped\b/i },
  { id: "not_built", re: /not yet (built|implemented)|design captured|ready to implement/i },
  { id: "pending", re: /\bpending\b/i },
];

function normalizeClaimed(text) {
  if (!text) return "unknown";
  for (const row of STATUS_PATTERNS) {
    if (row.re.test(text)) return row.id;
  }
  return "unknown";
}

async function exists(rel) {
  try {
    await access(path.join(root, rel));
    return true;
  } catch {
    return false;
  }
}

async function readText(rel) {
  try {
    return await readFile(path.join(root, rel), "utf8");
  } catch {
    return null;
  }
}

function extractPlanStatus(markdown) {
  if (!markdown) return null;
  const lines = markdown.split(/\r?\n/).slice(0, 12);
  for (const line of lines) {
    if (/status/i.test(line) && (line.includes("**") || line.includes(":"))) {
      return line.trim();
    }
  }
  return null;
}

async function evaluateOpenItem(item) {
  const findings = [];
  if (item.path && item.includes) {
    const text = await readText(item.path);
    if (!text) {
      findings.push({ severity: "fail", message: `open item path missing: ${item.path}` });
    } else if (!text.includes(item.includes)) {
      findings.push({
        severity: "warn",
        message: `open item marker missing in ${item.path} (may already be resolved): ${item.includes}`,
      });
    } else {
      findings.push({ severity: "open", message: `open item still present: ${item.title || item.id}` });
    }
  }
  if (item.plan && item.marker) {
    const text = await readText(item.plan);
    if (!text) {
      findings.push({ severity: "fail", message: `open-item plan missing: ${item.plan}` });
    } else {
      const idx = text.indexOf(item.marker);
      if (idx < 0) {
        findings.push({ severity: "warn", message: `marker not found in ${item.plan}: ${item.marker}` });
      } else {
        const slice = text.slice(idx, idx + 400);
        const unchecked = /- \[ \]/.test(slice);
        const checked = /- \[x\]/i.test(slice);
        if (item.expectUnchecked && !unchecked) {
          findings.push({
            severity: checked ? "info" : "warn",
            message: checked
              ? `open item appears completed in ${item.plan}: ${item.title || item.marker}`
              : `could not find unchecked box near ${item.marker}`,
          });
        } else if (item.expectUnchecked && unchecked) {
          findings.push({ severity: "open", message: `still open: ${item.title || item.marker}` });
        } else if (!item.expectUnchecked) {
          findings.push({ severity: "open", message: `tracked open item: ${item.title || item.marker}` });
        }
      }
    }
  }
  return findings;
}

export async function evaluateEvidenceMap() {
  const map = JSON.parse(await readFile(mapPath, "utf8"));
  const results = [];
  let fails = 0;
  let warns = 0;
  let opens = 0;

  for (const initiative of map.initiatives || []) {
    const findings = [];
    const planText = initiative.plan ? await readText(initiative.plan) : null;
    const planStatusLine = extractPlanStatus(planText);
    const claimed = planStatusLine ? normalizeClaimed(planStatusLine) : initiative.expectedStatus;

    for (const rel of initiative.requireAll || []) {
      if (!(await exists(rel))) {
        findings.push({ severity: "fail", message: `required path missing: ${rel}` });
      }
    }
    for (const rel of initiative.requireAny || []) {
      // handled below as group
    }
    if ((initiative.requireAny || []).length) {
      const anyOk = [];
      for (const rel of initiative.requireAny) {
        if (await exists(rel)) anyOk.push(rel);
      }
      if (!anyOk.length) {
        findings.push({
          severity: "fail",
          message: `none of requireAny exist: ${(initiative.requireAny || []).join(", ")}`,
        });
      }
    }
    for (const rel of initiative.forbidAll || []) {
      if (await exists(rel)) {
        findings.push({
          severity: "fail",
          message: `forbidden path exists while expected not_built: ${rel}`,
        });
      }
    }
    for (const check of initiative.requirePathContains || []) {
      const text = await readText(check.path);
      if (!text) {
        findings.push({ severity: "fail", message: `content check path missing: ${check.path}` });
      } else if (!text.includes(check.includes)) {
        findings.push({
          severity: "fail",
          message: `expected content missing in ${check.path}: ${check.includes}`,
        });
      }
    }

    for (const openItem of initiative.openItems || []) {
      findings.push(...(await evaluateOpenItem(openItem)));
    }

    // Claim vs evidence honesty
    const hardFails = findings.filter((f) => f.severity === "fail");
    const evidenceOk = hardFails.length === 0;
    if (
      (claimed === "shipped" || claimed === "mostly_shipped" || initiative.expectedStatus === "shipped") &&
      !evidenceOk
    ) {
      findings.push({
        severity: "fail",
        message: `status claims shipped-ish but evidence is incomplete`,
      });
    }
    if ((claimed === "not_built" || initiative.expectedStatus === "not_built") && evidenceOk) {
      // For not_built, evidenceOk means required paths exist (usually empty) and forbid paths absent.
      // If requireAll is empty and forbidAll absent, that's fine. If requireAll has items and they exist while claimed not_built → stale.
      if ((initiative.requireAll || []).length > 0) {
        findings.push({
          severity: "warn",
          message: `PLAN claims not built but required evidence paths exist — status may be stale`,
        });
      }
    }
    if (planStatusLine && initiative.expectedStatus) {
      const expected = initiative.expectedStatus;
      const compatible =
        claimed === expected ||
        (expected === "shipped" && claimed === "mostly_shipped") ||
        (expected === "mostly_shipped" && (claimed === "shipped" || claimed === "mostly_shipped"));
      if (!compatible && claimed !== "unknown") {
        findings.push({
          severity: "warn",
          message: `PLAN status "${claimed}" does not match evidence-map expectedStatus "${expected}"`,
        });
      }
    }

    const rowFails = findings.filter((f) => f.severity === "fail").length;
    const rowWarns = findings.filter((f) => f.severity === "warn").length;
    const rowOpens = findings.filter((f) => f.severity === "open").length;
    fails += rowFails;
    warns += rowWarns;
    opens += rowOpens;

    results.push({
      id: initiative.id,
      title: initiative.title,
      plan: initiative.plan,
      planStatusLine,
      claimed,
      expectedStatus: initiative.expectedStatus,
      ok: rowFails === 0,
      findings,
    });
  }

  return {
    version: map.version,
    generatedAt: new Date().toISOString(),
    ok: fails === 0,
    failCount: fails,
    warnCount: warns,
    openCount: opens,
    results,
  };
}

async function main() {
  const jsonMode = process.argv.includes("--json");
  const writeSnapshot = !process.argv.includes("--no-snapshot");
  const report = await evaluateEvidenceMap();

  if (writeSnapshot) {
    await mkdir(path.dirname(snapshotOut), { recursive: true });
    await writeFile(snapshotOut, `${JSON.stringify(report, null, 2)}\n`);
  }

  if (jsonMode) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    for (const row of report.results) {
      const mark = row.ok ? "✓" : "✗";
      console.log(`${mark} ${row.id} — ${row.title} (claimed=${row.claimed})`);
      for (const finding of row.findings) {
        if (finding.severity === "info") continue;
        console.log(`  [${finding.severity}] ${finding.message}`);
      }
    }
    console.log(
      report.ok
        ? `✓ plan-evidence check passed (${report.warnCount} warning${report.warnCount === 1 ? "" : "s"}, ${report.openCount} open)`
        : `✗ plan-evidence check failed (${report.failCount} fail, ${report.warnCount} warn, ${report.openCount} open)`,
    );
  }

  process.exit(report.ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
