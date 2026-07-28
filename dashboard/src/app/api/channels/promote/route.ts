import { NextRequest, NextResponse, after } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { pool } from "../../_db";
import { execFileNoStdin } from "@/lib/execFileNoStdin";

const execFileAsync = promisify(execFile);

// Populate LLM via `pi` + Command Code provider (same as channel @mentions).
// Do NOT call a local Command Code proxy on :8787 — that only exists on the Mini.
const POPULATE_MODEL = process.env.CHANNEL_PI_MODEL || "deepseek/deepseek-v4-flash";
const POPULATE_PROVIDER = process.env.CHANNEL_PI_PROVIDER || "commandcode";
const PI_BIN = process.env.CHANNEL_PI_BIN || "pi";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — scaffold + agent call + commit

// ── aiwg install paths (pinned to 2026.7.19) ─────────────────────
// Resolve at runtime — production is OVH (~/.local), Mini may use nvm.
function resolveAiwgBin(): string {
  const fromEnv = process.env.CHANNEL_AIWG_BIN?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const candidates = [
    path.join(os.homedir(), ".local/bin/aiwg"),
    path.join(os.homedir(), ".nvm/versions/node/v24.16.0/bin/aiwg"),
    "/Users/bencharney/.nvm/versions/node/v24.16.0/bin/aiwg",
    "/home/ubuntu/.local/bin/aiwg",
    "aiwg", // PATH fallback — only used if exec finds it
  ];
  for (const c of candidates) {
    if (c !== "aiwg" && fs.existsSync(c)) return c;
  }
  return candidates[0]; // best-effort default for error messages
}

function resolveAiwgRoot(bin: string): string {
  const fromEnv = process.env.CHANNEL_AIWG_ROOT?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const candidates = [
    path.join(path.dirname(bin), "../lib/node_modules/aiwg"),
    path.join(os.homedir(), ".local/lib/node_modules/aiwg"),
    path.join(os.homedir(), ".nvm/versions/node/v24.16.0/lib/node_modules/aiwg"),
    "/Users/bencharney/.nvm/versions/node/v24.16.0/lib/node_modules/aiwg",
    "/home/ubuntu/.local/lib/node_modules/aiwg",
  ].map((p) => path.normalize(p));
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

const AIWG_BIN = resolveAiwgBin();
const AIWG_ROOT = resolveAiwgRoot(AIWG_BIN);
const SDLC_FRAMEWORK = path.join(AIWG_ROOT, "agentic/code/frameworks/sdlc-complete");
const CI_GITHUB_SRC = path.join(SDLC_FRAMEWORK, "ci/github/workflows");
const CI_GITEA_SRC = path.join(SDLC_FRAMEWORK, "ci/gitea/workflows");

// Files that `aiwg new --no-agents` creates — we populate these
const POPULATE_TARGETS = [
  ".aiwg/intake/project-intake.md",
  ".aiwg/intake/solution-profile.md",
  ".aiwg/intake/option-matrix.md",
  "CLAUDE.md",
  "SECURITY.md",
];

// Sections in project-intake.md that are marked REQUIRED and must be filled
const REQUIRED_SECTIONS = ["Testing Strategy"];

// ── helpers ───────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 64) || "promoted-thread";
}

function scrubSecrets(content: string): string {
  return content
    .replace(/sk-[a-zA-Z0-9]{20,}/g, "[REDACTED]")
    .replace(/Bearer\s+[a-zA-Z0-9._-]{10,}/g, "Bearer [REDACTED]")
    .replace(/-----BEGIN[^-]*PRIVATE KEY-----[^-]*-----END[^-]*-----/gs, "[REDACTED KEY]")
    .replace(/gh[pousr]_[a-zA-Z0-9]{20,}/g, "[REDACTED_TOKEN]")
    .replace(/([A-Z_]{3,30})\s*=\s*['"]?[a-zA-Z0-9+/=]{20,}['"]?/g, "$1=[REDACTED]");
}

function readFileSafe(filePath: string): string {
  try { return fs.readFileSync(filePath, "utf-8"); } catch { return ""; }
}

async function callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
  if (!fs.existsSync(PI_BIN) && PI_BIN.startsWith("/")) {
    throw new Error(
      `pi binary not found at ${PI_BIN}. Set CHANNEL_PI_BIN (OVH: /home/ubuntu/.local/bin/pi).`,
    );
  }
  try {
    const { stdout, stderr } = await execFileNoStdin(
      PI_BIN,
      [
        "-p",
        "--mode",
        "text",
        "--no-session",
        "--no-tools",
        "--thinking",
        "off",
        "--provider",
        POPULATE_PROVIDER,
        "--model",
        POPULATE_MODEL,
        "--system-prompt",
        systemPrompt,
        userPrompt,
      ],
      {
        timeout: 300_000,
        env: process.env,
        maxBuffer: 8 * 1024 * 1024,
      },
    );
    const content = (stdout || "").trim();
    if (!content) {
      throw new Error(
        `pi returned empty content. stderr=${(stderr || "").slice(0, 300)}`,
      );
    }
    return content;
  } catch (err) {
    const e = err as Error & { stderr?: string; signal?: string | null };
    throw new Error(
      `pi populate failed (bin=${PI_BIN}, provider=${POPULATE_PROVIDER}, model=${POPULATE_MODEL}): ${e.message}${e.stderr ? ` stderr=${e.stderr.slice(0, 200)}` : ""}`,
    );
  }
}

// ── agent population ──────────────────────────────────────────────

function buildPopulatePrompt(opts: {
  threadTitle: string;
  threadBody: string;
  replies: { author: string; body: string }[];
  plans: { title: string; status: string }[];
  steps: { label: string; status: string; detail: string }[];
  artifacts: { title: string; kind: string; content: string }[];
  lifecycle: string;
  fileContents: Record<string, string>; // path → current template content
}): string {
  const plansBlock = opts.plans.length
    ? ["## Plans from thread", ...opts.plans.map((p) => `- [${p.status}] ${p.title}`), ""]
    : [];
  const stepsBlock = opts.steps.length
    ? ["## Workflow history", ...opts.steps.map((s) => `- [${s.status}] ${s.label}${s.detail ? ` — ${s.detail}` : ""}`), ""]
    : [];

  const artifactsBlock: string[] = [];
  for (const a of opts.artifacts) {
    artifactsBlock.push(`### ${a.title} (${a.kind})`);
    artifactsBlock.push(a.content.slice(0, 2000));
    artifactsBlock.push("");
  }

  const fileSections: string[] = [];
  for (const [filePath, content] of Object.entries(opts.fileContents)) {
    fileSections.push(`### ${filePath}`);
    fileSections.push("```markdown");
    fileSections.push(content.slice(0, 3000));
    fileSections.push("```");
    fileSections.push("");
  }

  return [
    `You are promoting a conversation thread into a formal AIWG project.`,
    `The thread discussed: "${opts.threadTitle}"`,
    `Lifecycle: ${opts.lifecycle}`,
    ``,
    `## Thread transcript`,
    `> ${opts.threadBody.slice(0, 4000)}`,
    ``,
    ...(opts.replies.length ? [
      `## Replies (${opts.replies.length} messages)`,
      ...opts.replies.map((r) => `${r.author}: ${r.body.slice(0, 500)}`).slice(-30),
      ``,
    ] : []),
    ...plansBlock,
    ...stepsBlock,
    ...(artifactsBlock.length ? ["## Artifacts", ...artifactsBlock] : []),
    ``,
    `## Current template files (fill these)`,
    ...fileSections,
    ``,
    `## Your task`,
    `Fill in each template file based on what the thread actually discussed.`,
    `Use the thread's own words and decisions — don't invent new requirements.`,
    ``,
    `CRITICAL: The project-intake.md has a "Testing Strategy (REQUIRED)" section.`,
    `This MUST be filled with real content (not placeholders). If the thread didn't discuss`,
    `testing, fill it with reasonable defaults based on the lifecycle (${opts.lifecycle})`,
    `and mark any N/A items as "N/A — not discussed in thread".`,
    ``,
    `Return ONLY a JSON object (no markdown fences, no prose):`,
    `{`,
    `  "files": { "<relative-path>": "<full-file-content>", ... },`,
    `  "missingRequired": ["<section-name>"]  // only if a REQUIRED section couldn't be filled`,
    `}`,
    ``,
    `Include every target file in "files", even if unchanged.`,
    `Do not wrap in markdown code fences — just the raw JSON.`,
  ].join("\n");
}

interface PopulateResult {
  files: Record<string, string>;
  missingRequired: string[];
}

async function runPopulateAgent(opts: {
  threadTitle: string;
  threadBody: string;
  replies: { author: string; body: string }[];
  plans: { title: string; status: string }[];
  steps: { label: string; status: string; detail: string }[];
  artifacts: { title: string; kind: string; content: string }[];
  lifecycle: string;
  tempDir: string;
}): Promise<PopulateResult> {
  // Read current template content
  const fileContents: Record<string, string> = {};
  for (const relPath of POPULATE_TARGETS) {
    const fullPath = path.join(opts.tempDir, relPath);
    fileContents[relPath] = readFileSafe(fullPath);
  }

  // Large-thread summarization: if transcript > 60K chars, do a summary pass first
  let threadBody = opts.threadBody;
  let replies = opts.replies;
  const rawTranscript = [opts.threadBody, ...opts.replies.map((r) => r.body)].join("\n");
  if (rawTranscript.length > 60_000) {
    const summaryPrompt = [
      `Summarize this conversation thread into a structured brief. Keep all:`,
      `- Concrete decisions ("we decided X")`,
      `- Technical specs and constraints`,
      `- Named tools, libraries, versions`,
      `- Explicit requirements and acceptance criteria`,
      `- Security concerns or tradeoffs discussed`,
      ``,
      `Drop: greetings, thank-yous, tangents, meta-commentary about the tool.`,
      ``,
      `Return ONLY a JSON object: {"summary": "<structured summary>", "decisions": ["decision 1", ...]}`,
      ``,
      `Thread:`,
      rawTranscript.slice(0, 80_000),
    ].join("\n");

    try {
      const raw = await callLLM(
        "You are a technical summarizer. Return ONLY valid JSON, no markdown fences.",
        summaryPrompt,
      );
      try {
        const parsed = JSON.parse(raw.replace(/```(?:json)?\s*([\s\S]*?)```/i, "$1").trim());
        if (parsed.summary) {
          threadBody = parsed.summary;
          replies = [];
        }
      } catch { /* fall through */ }
    } catch { /* summary failed — use raw */ }
  }

  const prompt = buildPopulatePrompt({
    threadTitle: opts.threadTitle,
    threadBody,
    replies,
    plans: opts.plans,
    steps: opts.steps,
    artifacts: opts.artifacts,
    lifecycle: opts.lifecycle,
    fileContents,
  });

  const raw = await callLLM(
    "You are filling AIWG project templates from thread transcripts. Return ONLY the JSON object specified — no markdown fences, no prose, no explanation.",
    prompt,
  );

  // Try to find the outermost { ... }
  const cleaned = raw.trim().replace(/```(?:json)?\s*([\s\S]*?)```/i, "$1").trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`populate agent returned no JSON. output=${raw.slice(0, 500)}`);
  const parsed = JSON.parse(jsonMatch[0]) as PopulateResult;
  if (!parsed.files || typeof parsed.files !== "object") {
    throw new Error(`populate agent returned invalid JSON. keys=${Object.keys(parsed).join(",")}`);
  }
  return parsed;
}

// ── REQUIRED-section gate ─────────────────────────────────────────

interface GateResult { passed: boolean; missing: string[] }

function checkRequiredSections(files: Record<string, string>): GateResult {
  const missing: string[] = [];
  const intakeContent = files[".aiwg/intake/project-intake.md"] || "";
  for (const section of REQUIRED_SECTIONS) {
    // Check if the section header exists AND has non-placeholder content after it
    const sectionRegex = new RegExp(
      `##\\s+${section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s|$)`,
      "i",
    );
    const match = intakeContent.match(sectionRegex);
    if (!match || !match[1]) {
      missing.push(section);
      continue;
    }
    const body = match[1].trim();
    // Strip template boilerplate and backtick values, check for meaningful content
    const meaningful = body
      .split("\n")
      .filter((line) => !line.trim().startsWith("> "))
      .join("\n")
      .replace(/`[^`]*`/g, "")
      .replace(/\|[-|\s]+\|/g, "")
      .replace(/\|/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (meaningful.length < 10) missing.push(section);
  }
  return { passed: missing.length === 0, missing };
}


async function setPromotionProgress(promotionId: string, progress: string) {
  await pool.query(
    `UPDATE thread_promotions SET progress = $1 WHERE id = $2 AND status = 'running'`,
    [progress, promotionId],
  );
}

// ── main route ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { threadId, channelId, destinationPath } = body as {
    threadId?: string;
    channelId?: string;
    destinationPath?: string;
  };

  if (!threadId || !channelId || !destinationPath?.trim()) {
    return NextResponse.json(
      { error: "threadId, channelId, and destinationPath required" },
      { status: 400 },
    );
  }

  // 1. Idempotency guard
  const metaCheck = await pool.query(
    `SELECT promoted_to FROM thread_meta WHERE thread_id = $1`,
    [threadId],
  );
  if (metaCheck.rows[0]?.promoted_to) {
    return NextResponse.json(
      { error: "already promoted", promotedTo: metaCheck.rows[0].promoted_to },
      { status: 409 },
    );
  }
  const runningCheck = await pool.query(
    `SELECT id FROM thread_promotions WHERE thread_id = $1 AND status = 'running' LIMIT 1`,
    [threadId],
  );
  if (runningCheck.rowCount && runningCheck.rowCount > 0) {
    return NextResponse.json(
      { error: "promotion already in progress", promotionId: runningCheck.rows[0].id },
      { status: 409 },
    );
  }

  // 2. Gather thread data (fast) before returning
  const rootRes = await pool.query(
    `SELECT body, author, created_at FROM messages WHERE id = $1 AND channel_id = $2`,
    [threadId, channelId],
  );
  if (!rootRes.rows[0]) {
    return NextResponse.json({ error: "thread not found" }, { status: 404 });
  }
  const threadBody = rootRes.rows[0].body as string;
  const threadTitle = threadBody.split("\n")[0].slice(0, 200) || "untitled";

  const repliesRes = await pool.query(
    `SELECT author, body FROM messages WHERE thread_id = $1 ORDER BY created_at`,
    [threadId],
  );
  const replies: { author: string; body: string }[] = repliesRes.rows.map((r) => ({
    author: String(r.author),
    body: String(r.body),
  }));

  const plansRes = await pool.query(
    `SELECT title, status FROM thread_plans WHERE thread_id = $1 ORDER BY sort_order`,
    [threadId],
  );
  const plans: { title: string; status: string }[] = plansRes.rows.map((r) => ({
    title: String(r.title),
    status: String(r.status),
  }));

  const stepsRes = await pool.query(
    `SELECT step_label, status, detail FROM thread_workflow_steps WHERE thread_id = $1`,
    [threadId],
  );
  const steps: { label: string; status: string; detail: string }[] = stepsRes.rows.map((r) => ({
    label: String(r.step_label),
    status: String(r.status),
    detail: String(r.detail || ""),
  }));

  const artifactsRes = await pool.query(
    `SELECT title, kind, content FROM thread_artifacts WHERE thread_id = $1 ORDER BY version DESC`,
    [threadId],
  );
  const artifacts: { title: string; kind: string; content: string }[] = artifactsRes.rows.map((r) => ({
    title: String(r.title),
    kind: String(r.kind),
    content: String(r.content),
  }));

  const metaRes = await pool.query(
    `SELECT lifecycle, state FROM thread_meta WHERE thread_id = $1`,
    [threadId],
  );
  const lifecycle = String(metaRes.rows[0]?.lifecycle || "coding");

  // Destination path IS the final project directory (UI default: ~/Projects/<slug>).
  const projectDir = path.resolve((destinationPath || "").replace(/^~/, os.homedir()));
  const projectName =
    slugify(path.basename(projectDir)) ||
    slugify(threadTitle) ||
    `promoted-${threadId.slice(0, 8)}`;

  if (!projectDir || projectDir === path.sep) {
    return NextResponse.json({ error: "destination path required" }, { status: 400 });
  }
  if (fs.existsSync(projectDir)) {
    return NextResponse.json(
      { error: `Destination already exists: ${projectDir}` },
      { status: 409 },
    );
  }

  const promotionId = randomUUID();
  await pool.query(
    `INSERT INTO thread_promotions
       (id, thread_id, status, agent_provider, agent_model, progress, created_at)
     VALUES ($1, $2, 'running', 'commandcode', $3, $4, $5)`,
    [promotionId, threadId, POPULATE_MODEL, "Starting…", new Date().toISOString()],
  );

  // Long work continues after the response so the phone UI can poll progress.
  after(async () => {
    let tempDir = "";
    try {
      await setPromotionProgress(promotionId, "Scaffolding AIWG project…");
      tempDir = path.join(os.tmpdir(), `promote-${randomUUID().slice(0, 12)}`);
      fs.mkdirSync(tempDir, { recursive: true });

      try {
        await execFileAsync(
          AIWG_BIN,
          ["new", projectName, "--no-agents"],
          { timeout: 30_000, cwd: tempDir, env: process.env },
        );
      } catch (err) {
        throw new Error(
          `aiwg scaffold failed (bin=${AIWG_BIN}, exists=${fs.existsSync(AIWG_BIN)}): ${String(err)}`,
        );
      }

      // `aiwg new <name>` usually nests under cwd/<name>/ — prefer that root.
      const nested = path.join(tempDir, projectName);
      const scaffoldRoot =
        fs.existsSync(path.join(nested, ".aiwg")) || fs.existsSync(path.join(nested, "CLAUDE.md"))
          ? nested
          : tempDir;

      for (const relPath of POPULATE_TARGETS) {
        if (!fs.existsSync(path.join(scaffoldRoot, relPath))) {
          throw new Error(`scaffold incomplete: missing ${relPath} under ${scaffoldRoot}`);
        }
      }

      const githubCiDest = path.join(scaffoldRoot, ".github/workflows");
      if (fs.existsSync(CI_GITHUB_SRC)) {
        fs.mkdirSync(githubCiDest, { recursive: true });
        for (const f of fs.readdirSync(CI_GITHUB_SRC)) {
          fs.copyFileSync(path.join(CI_GITHUB_SRC, f), path.join(githubCiDest, f));
        }
      }

      await setPromotionProgress(promotionId, "Filling templates with AI (this can take a minute)…");
      const populateResult = await runPopulateAgent({
        threadTitle,
        threadBody,
        replies,
        plans,
        steps,
        artifacts,
        lifecycle,
        tempDir: scaffoldRoot,
      });

      await setPromotionProgress(promotionId, "Checking required sections…");
      const gate = checkRequiredSections(populateResult.files);
      if (!gate.passed) {
        await pool.query(
          `UPDATE thread_promotions
              SET status = 'failed_required_gate', error_detail = $1, progress = $2, completed_at = $3
            WHERE id = $4`,
          [
            JSON.stringify(gate.missing),
            "Blocked — required sections incomplete",
            new Date().toISOString(),
            promotionId,
          ],
        );
        return;
      }

      await setPromotionProgress(promotionId, "Writing files & committing…");
      for (const relPath of POPULATE_TARGETS) {
        const fileContent = populateResult.files[relPath];
        if (!fileContent) continue;
        fs.writeFileSync(path.join(scaffoldRoot, relPath), scrubSecrets(fileContent), "utf-8");
      }

      try {
        // OVH service user has no global git identity — set local author for this repo only.
        const gitName = process.env.CHANNEL_GIT_AUTHOR_NAME?.trim() || "Activity Feed";
        const gitEmail = process.env.CHANNEL_GIT_AUTHOR_EMAIL?.trim() || "promote@activity-feed.local";
        await execFileAsync("git", ["config", "user.name", gitName], { timeout: 5_000, cwd: scaffoldRoot });
        await execFileAsync("git", ["config", "user.email", gitEmail], { timeout: 5_000, cwd: scaffoldRoot });
        await execFileAsync("git", ["add", "-A"], { timeout: 10_000, cwd: scaffoldRoot });
        await execFileAsync(
          "git",
          ["commit", "-m", `Promoted from activity-feed thread ${threadId}`],
          { timeout: 10_000, cwd: scaffoldRoot },
        );
      } catch (err) {
        throw new Error(`git commit failed: ${String(err)}`);
      }

      try {
        await execFileAsync("git", ["rev-parse", "HEAD"], { timeout: 5_000, cwd: scaffoldRoot });
      } catch {
        throw new Error("git verification failed — no HEAD commit");
      }

      await setPromotionProgress(promotionId, "Saving to destination…");
      fs.mkdirSync(path.dirname(projectDir), { recursive: true });
      fs.renameSync(scaffoldRoot, projectDir);
      if (scaffoldRoot !== tempDir && fs.existsSync(tempDir)) {
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* best effort */ }
      }
      const finalPath = projectDir;
      tempDir = "";

      // Register in the app-visible repos registry and link the thread.
      const now = new Date().toISOString();
      const existingRepo = await pool.query(
        `SELECT id FROM repos WHERE path = $1 LIMIT 1`,
        [finalPath],
      );
      let resolvedRepoId: string;
      if (existingRepo.rows[0]?.id) {
        resolvedRepoId = String(existingRepo.rows[0].id);
        await pool.query(
          `UPDATE repos SET name = $1 WHERE id = $2`,
          [projectName, resolvedRepoId],
        );
      } else {
        resolvedRepoId = randomUUID();
        await pool.query(
          `INSERT INTO repos (id, name, path, git_remote, created_at)
           VALUES ($1, $2, $3, NULL, $4)`,
          [resolvedRepoId, projectName, finalPath, now],
        );
      }

      await pool.query(
        `UPDATE thread_meta
            SET promoted_to = $1, repo_id = $2, archived_at = $3, updated_at = $3
          WHERE thread_id = $4`,
        [finalPath, resolvedRepoId, now, threadId],
      );
      await pool.query(
        `UPDATE thread_promotions
            SET status = 'succeeded', repo_path = $1, progress = $2, completed_at = $3
          WHERE id = $4`,
        [finalPath, "Done", now, promotionId],
      );

      // System note in the thread (app-first, not SSH-first)
      await pool.query(
        `INSERT INTO messages (id, channel_id, thread_id, author, body, created_at)
         VALUES ($1, $2, $3, 'system', $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [
          randomUUID(),
          channelId,
          threadId,
          `Promoted to project **${projectName}** (now in Projects). Thread archived (read-only).`,
          now,
        ],
      );
    } catch (err) {
      console.error("[channels/promote] background failed:", err);
      try {
        await pool.query(
          `UPDATE thread_promotions
              SET status = 'errored', error_detail = $1, progress = $2, completed_at = $3
            WHERE id = $4 AND status = 'running'`,
          [
            String(err).slice(0, 2000),
            "Failed",
            new Date().toISOString(),
            promotionId,
          ],
        );
      } catch { /* best effort */ }
      if (tempDir) {
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* best effort */ }
      }
    }
  });

  return NextResponse.json(
    { status: "running", promotionId, projectName, destination: projectDir, projectUrl: "/projects" },
    { status: 202 },
  );
}
