#!/usr/bin/env node
// One-time import of curated eval/case datasets into judgment_collections/judgments.
// Each case becomes a synthetic activity_log row (source: "import:<slug>") plus a
// judgment row linking it to a collection, since the judgments table requires an
// activity_id and these cases don't come from live activity_log entries.

const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const pool = new Pool({
  connectionString:
    process.env.ACTIVITY_DB_URL || "postgres://activity:activity@localhost:5433/activity_log",
});

const HOME = process.env.HOME;

function readJsonl(file) {
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

async function upsertCollection(id, name, kind, description) {
  await pool.query(
    `INSERT INTO judgment_collections (id, name, kind, description)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET name = $2, kind = $3, description = $4`,
    [id, name, kind, description]
  );
}

async function insertCase({ collectionId, source, summary, detail, verdict, comment }) {
  const { rows } = await pool.query(
    `INSERT INTO activity_log (source, type, summary, detail) VALUES ($1, $2, $3, $4) RETURNING id`,
    [source, "eval-case", summary.slice(0, 500), JSON.stringify(detail)]
  );
  const activityId = rows[0].id;
  const judgmentId = `${collectionId}:${activityId}`;
  await pool.query(
    `INSERT INTO judgments (id, activity_id, verdict, comment, collection_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET verdict = $3, comment = $4, collection_id = $5`,
    [judgmentId, activityId, verdict, comment || "", collectionId]
  );
}

async function importGoldenIncidents() {
  const file = path.join(HOME, "ax-brain-crew/evals/incident-agent/golden-incidents.jsonl");
  const rows = readJsonl(file);
  await upsertCollection(
    "golden-incidents",
    "Golden Incidents",
    "regression",
    "Labeled incident-agent regression cases (routing/system-design root causes)."
  );
  for (const r of rows) {
    await insertCase({
      collectionId: "golden-incidents",
      source: "import:golden-incidents",
      summary: r.input,
      detail: r,
      verdict: "golden",
      comment: r.expected?.root_cause_summary || "",
    });
  }
  return rows.length;
}

async function importFrustrationCases() {
  const dir = path.join(HOME, "ax-brain-crew/evals/frustration-cases");
  await upsertCollection(
    "frustration-cases",
    "Frustration Cases",
    "watchlist",
    "User-frustration signals labeled with failure mode, plus hard negatives and root-cause notes."
  );
  let count = 0;

  for (const r of readJsonl(path.join(dir, "cases.jsonl"))) {
    await insertCase({
      collectionId: "frustration-cases",
      source: "import:frustration-cases",
      summary: r.text,
      detail: r,
      verdict: r.label === "frustrated" ? "bug" : "good",
      comment: r.failure_mode || "",
    });
    count++;
  }

  for (const r of readJsonl(path.join(dir, "hard-negatives.jsonl"))) {
    await insertCase({
      collectionId: "frustration-cases",
      source: "import:frustration-cases",
      summary: r.text,
      detail: r,
      verdict: "good",
      comment: `hard-negative: ${r.failure_mode || ""}`,
    });
    count++;
  }

  for (const r of readJsonl(path.join(dir, "root-causes.jsonl"))) {
    await insertCase({
      collectionId: "frustration-cases",
      source: "import:frustration-cases",
      summary: r.ask,
      detail: r,
      verdict: "bug",
      comment: r.gap || "",
    });
    count++;
  }

  return count;
}

async function importAgentEvalCases() {
  const file = path.join(HOME, "ax-brain-crew/dataset/evals/ax-agent-eval-cases-v1.json");
  const rows = readJson(file);
  await upsertCollection(
    "ax-agent-eval-cases-v1",
    "Ax Agent Eval Cases v1",
    "eval",
    "Agent behavior test cases with criteria and expected actions (mirrored in ax-control-plane)."
  );
  for (const r of rows) {
    await insertCase({
      collectionId: "ax-agent-eval-cases-v1",
      source: "import:ax-agent-eval-cases-v1",
      summary: r.input?.userRequest || r.id,
      detail: r,
      verdict: "dataset",
      comment: r.criteria || "",
    });
  }
  return rows.length;
}

async function importClaimVerification() {
  const file = path.join(HOME, "ax-brain-crew/data/claim-verification-dataset.json");
  const data = readJson(file);
  await upsertCollection(
    "claim-verification-dataset",
    "Claim Verification Dataset",
    "eval",
    data.description || "Labeled claim-verification eval set."
  );
  for (const r of data.claims) {
    await insertCase({
      collectionId: "claim-verification-dataset",
      source: "import:claim-verification-dataset",
      summary: r.claim,
      detail: r,
      verdict: r.verdict === "contradicted" ? "bug" : r.verdict === "supported" ? "good" : "redundant",
      comment: r.evidence || r.notes || "",
    });
  }
  return data.claims.length;
}

async function importPiSubagentLabBenchmarks() {
  const base = path.join(HOME, "pi-subagent-lab/benchmarks");
  if (!fs.existsSync(base)) return 0;
  await upsertCollection(
    "pi-subagent-lab-benchmarks",
    "PI Subagent Lab Benchmarks",
    "eval",
    "Per-task benchmark instructions + rubrics across quant-researcher, security-reviewer, harbor datasets."
  );
  let count = 0;
  for (const suite of fs.readdirSync(base)) {
    const tasksDir = path.join(base, suite, "tasks");
    if (!fs.existsSync(tasksDir)) continue;
    for (const taskName of fs.readdirSync(tasksDir)) {
      const taskDir = path.join(tasksDir, taskName);
      const instructionFile = path.join(taskDir, "instruction.md");
      const rubricFile = path.join(taskDir, "tests", "rubric.json");
      if (!fs.existsSync(instructionFile)) continue;
      const instruction = fs.readFileSync(instructionFile, "utf8");
      const rubric = fs.existsSync(rubricFile) ? readJson(rubricFile) : null;
      await insertCase({
        collectionId: "pi-subagent-lab-benchmarks",
        source: "import:pi-subagent-lab-benchmarks",
        summary: `[${suite}/${taskName}] ${instruction}`,
        detail: { suite, task: taskName, instruction, rubric },
        verdict: "dataset",
        comment: suite,
      });
      count++;
    }
  }
  return count;
}

async function main() {
  const results = {};
  results["golden-incidents"] = await importGoldenIncidents();
  results["frustration-cases"] = await importFrustrationCases();
  results["ax-agent-eval-cases-v1"] = await importAgentEvalCases();
  results["claim-verification-dataset"] = await importClaimVerification();
  results["pi-subagent-lab-benchmarks"] = await importPiSubagentLabBenchmarks();
  console.log("Imported:");
  for (const [k, v] of Object.entries(results)) console.log(`  ${k}: ${v} cases`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
