import { spawnSync } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const snapshotPath = path.join(root, "data/finance-research.snapshot.json");
const quantRoot = process.env.QUANT_RESEARCH_ROOT ?? "/Users/bencharney/Projects/quant-research-pipeline";
const miraRoot = process.env.MIRA_ROOT ?? "/Users/bencharney/sandbox/Mira";
const quantChannelId = "08bf3d95-a069-4693-937d-553b49c86c77";
const READ_TIMEOUT_MS = Number(process.env.FINANCE_SNAPSHOT_READ_TIMEOUT_MS || 4000);

const sources = [
  {
    id: "cybersecurity-demand-2026-07", kind: "theme",
    title: "Cybersecurity demand", threadId: "3f0b6e86-08ea-41ff-a33c-4d145f2a1d11",
    directory: "cybersecurity-demand-2026-07",
  },
  {
    id: "memory-storage-sector-2026-07", kind: "theme",
    title: "Memory & storage", threadId: "4ab8a854-bc9e-4f25-b9f2-c0159e8d4b0e",
    directory: "memory-storage-sector-2026-07",
  },
  {
    id: "mobile-ai-hardware-supercycle-2026-07", kind: "theme",
    title: "Mobile AI hardware", threadId: "39874959-f2e2-4201-b8bc-c8c7886b06d4",
    directory: "mobile-ai-hardware-supercycle-2026-07",
    fallbackSymbols: ["QCOM", "AAPL", "AVGO"],
  },
];

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

for (const source of sources) {
  const directory = path.join(miraRoot, "cases", source.directory);
  try {
    const manifest = JSON.parse(readFileTimed(path.join(directory, "research-package-manifest.json")));
    let collection = [];
    try {
      const rows = parseCsv(readFileTimed(path.join(directory, "company-map.csv")));
      collection = rows
        .map((row) => ({
          symbol: row.ticker?.trim().toUpperCase(),
          role: row.value_chain_position || row.company_name,
          notes: row.why_it_matters || row.notes || "",
        }))
        .filter((item) => validSymbol(item.symbol));
    } catch {
      collection = (source.fallbackSymbols ?? []).map((symbol) => ({ symbol, role: "Named research exposure", notes: "" }));
    }
    contexts.push({
      id: source.id,
      kind: source.kind,
      title: source.title,
      symbols: [...new Set(collection.map((item) => item.symbol))],
      status: new Date(manifest.stale_after) < new Date() ? "stale" : "working",
      verdict: manifest.readiness_level,
      summary: manifest.notes,
      blockingGaps: manifest.blocking_gaps ?? [],
      staleAfter: manifest.stale_after,
      collection,
      source: { channelId: quantChannelId, threadId: source.threadId, objectType: "mira_case", objectId: source.id },
    });
  } catch (error) {
    warnings.push(`mira:${source.id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

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
  } catch (error) {
    warnings.push(`card:${cardSource.id}: ${error instanceof Error ? error.message : String(error)}`);
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

const snapshot = { version: 1, generatedAt: new Date().toISOString(), quantChannelId, contexts };
await mkdir(path.join(root, "data"), { recursive: true });
await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`Exported ${contexts.length} Finance research contexts.`);
if (warnings.length) {
  console.warn(`Skipped ${warnings.length} unavailable source(s):`);
  for (const warning of warnings) console.warn(`  - ${warning}`);
}
