import { spawnSync } from "node:child_process";
import { access, mkdir, readdir, writeFile } from "node:fs/promises";
import { statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const snapshotPath = path.join(root, "data/finance-research.snapshot.json");
const quantRoot = process.env.QUANT_RESEARCH_ROOT ?? "/Users/bencharney/Projects/quant-research-pipeline";
const miraRoot = process.env.MIRA_ROOT ?? "/Users/bencharney/sandbox/Mira";
const quantChannelId = "08bf3d95-a069-4693-937d-553b49c86c77";
const READ_TIMEOUT_MS = Number(process.env.FINANCE_SNAPSHOT_READ_TIMEOUT_MS || 4000);

// These three themes have channel threads — auto-discovered cases won't.
const THREADED_THEMES = new Map([
  ["cybersecurity-demand-2026-07", "3f0b6e86-08ea-41ff-a33c-4d145f2a1d11"],
  ["memory-storage-sector-2026-07", "4ab8a854-bc9e-4f25-b9f2-c0159e8d4b0e"],
  ["mobile-ai-hardware-supercycle-2026-07", "39874959-f2e2-4201-b8bc-c8c7886b06d4"],
]);

const cards = [
  {
    id: "option-signal-equity-inverted-put-skew", kind: "screen_rule",
    threadId: "26401b0f-bc49-49d3-80f8-f67af2d01c66", status: "provisional",
  },
  {
    id: "strategy-miner-live-loop", kind: "screen_rule",
    threadId: "8676d2c6-4a0e-417c-a322-c7bc94d91492", status: "working",
  },
  {
    id: "vrp-iv-rank-scan-top-premium-selling-candidates-today-20260617165937",
    kind: "screen_rule", threadId: "d9f7e0cb-909f-42b6-b9d5-5d08ced2aa08", status: "working",
  },
  {
    id: "wheel-csp-entry-ruleset", kind: "trade_doctrine",
    threadId: "44359af2-fc6f-4447-95c4-d96f998d72db", status: "published",
  },
];

/** Map Mira package_type → FinanceResearchContext kind */
function kindFromPackageType(type, directoryName) {
  if (!type) return "symbol_thesis";
  const t = type.toLowerCase();
  if (t.includes("theme") || t.includes("thematic") || t.includes("sector") || t.includes("value_capture") || directoryName.includes("sector") || directoryName.includes("demand") || directoryName.includes("theme")) return "theme";
  if (t.includes("screen") || t.includes("scan") || t.includes("rule")) return "screen_rule";
  if (t.includes("doctrine") || t.includes("methodology") || t.includes("workflow")) return "trade_doctrine";
  if (t.includes("earnings") || t.includes("analysis") || t.includes("backtest") || t.includes("triage")) return "symbol_thesis";
  return "symbol_thesis";
}

/** Derive a human title from research_object + directory name */
function titleFromCase(dirName, manifest) {
  const obj = manifest.research_object || "";
  // If research_object is a ticker symbol only, prepend the case dir name
  if (/^[A-Z]{1,5}$/.test(obj.trim())) {
    const readable = dirName.replace(/-202[0-9]-[0-9]+.*$/, "").replace(/-/g, " ").toUpperCase();
    if (readable && readable !== obj.trim()) return `${readable} (${obj.trim()})`;
    return obj.trim();
  }
  // If title-like string, use it
  if (obj.length > 4 && obj.length < 80) return obj;
  // Fallback: clean directory name
  return dirName.replace(/-202[0-9]-[0-9]+.*$/, "").replace(/-/g, " ");
}

function parseCsv(input) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === '"' && quoted && input[i + 1] === '"') { field += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(field); field = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      row.push(field); field = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [headers = [], ...records] = rows;
  return records.map((values) => Object.fromEntries(headers.map((key, index) => [key, values[index] ?? ""])));
}

function validSymbol(value) {
  return /^[A-Z]{1,5}(?:\.[A-Z])?$/.test(value);
}

/** Timed read so a hung NFS/mount cannot block deploys indefinitely. */
function readFileTimed(filePath, timeoutMs = READ_TIMEOUT_MS) {
  const result = spawnSync(
    process.execPath,
    ["-e", "const fs=require('fs'); process.stdout.write(fs.readFileSync(process.argv[1], 'utf8'));", filePath],
    { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024, encoding: "utf8" },
  );
  if (result.error?.code === "ETIMEDOUT" || result.signal === "SIGTERM") {
    throw new Error(`timed out after ${timeoutMs}ms reading ${filePath}`);
  }
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || `failed reading ${filePath}`);
  }
  return result.stdout;
}

async function existingSnapshotReusable() {
  try {
    await access(snapshotPath);
    return true;
  } catch {
    return false;
  }
}

const warnings = [];
const contexts = [];

// --- Auto-discover all Mira cases ---
const casesDir = path.join(miraRoot, "cases");
let entries = [];
try {
  entries = await readdir(casesDir);
} catch {
  // Mira root doesn't exist on this machine — skip auto-discovery, cards only
  entries = [];
}

for (const entry of entries.sort()) {
  const dirPath = path.join(casesDir, entry);
  let isDir = false;
  try { isDir = statSync(dirPath).isDirectory(); } catch { continue; }
  if (!isDir) continue;

  const manifestPath = path.join(dirPath, "research-package-manifest.json");
  try {
    await access(manifestPath);
  } catch {
    continue; // no manifest = skip
  }

  try {
    const manifest = JSON.parse(readFileTimed(manifestPath));
    const caseId = manifest.case_id || entry;
    const kind = kindFromPackageType(manifest.package_type, entry);
    const title = titleFromCase(entry, manifest);

    // Parse company-map.csv for symbols if present
    let collection = [];
    const csvPath = path.join(dirPath, "company-map.csv");
    try {
      const rows = parseCsv(readFileTimed(csvPath));
      collection = rows
        .map((row) => ({
          symbol: (row.ticker || row.symbol || "").trim().toUpperCase(),
          role: row.value_chain_position || row.company_name || row.role || "",
          notes: row.why_it_matters || row.notes || "",
        }))
        .filter((item) => validSymbol(item.symbol));
    } catch {
      // No company-map.csv — extract symbols from research_object if it's a ticker
      const objSymbol = (manifest.research_object || "").trim().toUpperCase();
      if (validSymbol(objSymbol)) {
        collection = [{ symbol: objSymbol, role: "Research subject", notes: "" }];
      }
    }

    // Status: check stale_after vs now
    const staleAfter = manifest.stale_after || manifest.research_cutoff_date || undefined;
    const status = staleAfter && new Date(staleAfter) < new Date() ? "stale" : "working";

    // Summary: use notes or synthesise from manifest
    const summary = manifest.notes
      || `Mira ${kind.replace("_", " ")} — ${manifest.research_object || entry}. Cutoff: ${manifest.research_cutoff_date || "unknown"}. Readiness: ${manifest.readiness_level || "working_view"}.`;

    const threadId = THREADED_THEMES.get(entry) || "";

    contexts.push({
      id: caseId,
      kind,
      title: title.charAt(0).toUpperCase() + title.slice(1),
      symbols: [...new Set(collection.map((item) => item.symbol))],
      status,
      verdict: manifest.readiness_level || "working_view",
      summary,
      blockingGaps: manifest.blocking_gaps ?? [],
      staleAfter: staleAfter || undefined,
      collection: collection.length ? collection : undefined,
      source: {
        channelId: quantChannelId,
        threadId,
        objectType: "mira_case",
        objectId: caseId,
      },
    });
  } catch (error) {
    warnings.push(`mira:${entry}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// --- Pipeline cards ---
// Cards only exist on Mac. On Zima refreshes, preserve them from the existing snapshot.
let existingSnapshot = null;
try { existingSnapshot = JSON.parse(readFileTimed(snapshotPath)); } catch { /* no existing snapshot */ }

for (const cardSource of cards) {
  try {
    const card = JSON.parse(readFileTimed(path.join(quantRoot, "control-plane/cards", cardSource.id, "card.json")));
    contexts.push({
      id: card.id,
      kind: cardSource.kind,
      title: card.title,
      symbols: [],
      status: cardSource.status,
      verdict: card.verdict,
      summary: card.description,
      blockingGaps: card.approval_gate && card.approval_gate !== "none" ? [card.approval_gate] : [],
      source: { channelId: quantChannelId, threadId: cardSource.threadId, objectType: "pipeline_card", objectId: card.id },
    });
  } catch {
    // Source file unavailable — try existing snapshot
    if (existingSnapshot?.contexts) {
      const existing = existingSnapshot.contexts.find(
        (c) => c.source?.objectType === "pipeline_card" && c.id === cardSource.id,
      );
      if (existing) {
        contexts.push(existing);
        continue;
      }
    }
    warnings.push(`card:${cardSource.id}: source unavailable, no cached version`);
  }
}

if (contexts.length === 0) {
  if (await existingSnapshotReusable()) {
    console.warn("finance snapshot: all sources unavailable; keeping existing data/finance-research.snapshot.json");
    for (const warning of warnings) console.warn(`  - ${warning}`);
    process.exit(0);
  }
  console.error("finance snapshot: no contexts exported and no existing snapshot to reuse");
  for (const warning of warnings) console.error(`  - ${warning}`);
  process.exit(1);
}

const snapshot = { version: 2, generatedAt: new Date().toISOString(), quantChannelId, contexts };
await mkdir(path.join(root, "data"), { recursive: true });
await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`Exported ${contexts.length} Finance research contexts (${contexts.filter(c => c.source.objectType === "mira_case").length} Mira, ${contexts.filter(c => c.source.objectType === "pipeline_card").length} pipeline).`);
if (warnings.length) {
  console.warn(`Skipped ${warnings.length} unavailable source(s):`);
  for (const warning of warnings) console.warn(`  - ${warning}`);
}
