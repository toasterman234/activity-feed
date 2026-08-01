import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd(), "tmp-qa/mobile-qa");
const jsonReportPath = path.join(root, "results.json");
const auditsRoot = path.join(root, "audits");
const outPath = path.join(root, "mobile-layout-audit.md");

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function gatherAuditFiles(dir) {
  if (!(await exists(dir))) return [];
  const projects = await fs.readdir(dir);
  const rows = [];
  for (const project of projects) {
    const projectDir = path.join(dir, project);
    const files = await fs.readdir(projectDir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const data = JSON.parse(await fs.readFile(path.join(projectDir, file), 'utf8'));
      rows.push({
        project,
        route: file.replace(/\.json$/, ''),
        hasHorizontalOverflow: !!data.hasHorizontalOverflow,
        overflowCount: Array.isArray(data.overflowElements) ? data.overflowElements.length : 0,
        clippedTextCount: Array.isArray(data.clippedText) ? data.clippedText.length : 0,
        smallTouchTargets: Array.isArray(data.touchTargets) ? data.touchTargets.length : 0,
      });
    }
  }
  return rows.sort((a, b) => `${a.project}:${a.route}`.localeCompare(`${b.project}:${b.route}`));
}

async function gatherTestSummary() {
  if (!(await exists(jsonReportPath))) return null;
  const report = JSON.parse(await fs.readFile(jsonReportPath, 'utf8'));
  const counts = { passed: 0, failed: 0, skipped: 0 };
  const walk = (suite) => {
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        const status = test.status || 'unknown';
        if (status === 'passed') counts.passed += 1;
        else if (status === 'failed') counts.failed += 1;
        else if (status === 'skipped') counts.skipped += 1;
      }
    }
    for (const child of suite.suites || []) walk(child);
  };
  for (const suite of report.suites || []) walk(suite);
  return counts;
}

const [summary, audits] = await Promise.all([gatherTestSummary(), gatherAuditFiles(auditsRoot)]);
const overflowRows = audits.filter((row) => row.hasHorizontalOverflow || row.overflowCount > 0);
const clippedRows = audits.filter((row) => row.clippedTextCount > 0);
const touchRows = audits.filter((row) => row.smallTouchTargets > 0);

const lines = [
  '# Mobile layout audit',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  '## Test summary',
  '',
  summary
    ? `- passed: ${summary.passed}\n- failed: ${summary.failed}\n- skipped: ${summary.skipped}`
    : '- No Playwright JSON report found yet.',
  '',
  '## Audited route/viewport runs',
  '',
];

if (audits.length) {
  for (const row of audits) {
    lines.push(`- ${row.project} · ${row.route} — overflow=${row.hasHorizontalOverflow ? 'yes' : 'no'}, out-of-viewport=${row.overflowCount}, clippedText=${row.clippedTextCount}, smallTouchTargets=${row.smallTouchTargets}`);
  }
} else {
  lines.push('- No audit files found yet.');
}

lines.push('', '## Issues found', '');
lines.push(`- Horizontal overflow flagged in ${overflowRows.length} route runs.`);
lines.push(`- Clipped text flagged in ${clippedRows.length} route runs.`);
lines.push(`- Small touch targets flagged in ${touchRows.length} route runs.`);
lines.push('', '## Artifact folders', '');
lines.push(`- screenshots: ${path.join(root, 'screenshots')}`);
lines.push(`- traces/videos/test-results: ${path.join(root, 'test-results')}`);
lines.push(`- HTML report: ${path.join(root, 'html-report', 'index.html')}`);

await fs.mkdir(root, { recursive: true });
await fs.writeFile(outPath, `${lines.join('\n')}\n`);
console.log(`Wrote ${outPath}`);
