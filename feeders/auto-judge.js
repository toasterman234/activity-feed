#!/usr/bin/env node
// Auto-judge: grades agent_runs sessions with an LLM rubric.
// Reads unjudged (outcome_source='hook') sessions, loads their transcripts,
// sends a grading prompt to commandcode, and writes results to both
// agent_runs and judgments tables.
//
// Idempotent — skips sessions already graded by human or auto_judge.
// Batch — grades up to BATCH_SIZE sessions per run, logs skipped count.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { Client } = require('pg');
const { execFileSync } = require('child_process');

const HOME = os.homedir();
const DB_URL = process.env.ACTIVITY_DB_URL || 'postgres://activity:activity@localhost:5433/activity_log';
const COMMANDCODE_BASE = 'http://127.0.0.1:8787/v1';
const GRADING_MODEL = 'deepseek/deepseek-v4-flash';
const BATCH_SIZE = process.env.AUTO_JUDGE_BATCH_SIZE ? parseInt(process.env.AUTO_JUDGE_BATCH_SIZE, 10) : 20;
const MAX_TRANSCRIPT_CHARS = 8000; // cap transcript context sent to the LLM

// ── DB ─────────────────────────────────────────────────────────────

async function getUnjudgedSessions(client) {
  const { rows } = await client.query(
    `SELECT id, source, agent_id, project, cwd, operation,
            started_at, ended_at, duration_ms, prompt_count, error,
            outcome, drifted, dead_end, headline, summary, raw_ref,
            judged_at, outcome_source
     FROM agent_runs
     WHERE outcome_source != 'human'
       AND (judged_at IS NULL
            OR judged_at < ended_at
            OR outcome_source = 'hook')
       AND (duration_ms IS NULL OR duration_ms > 30000)
       AND (prompt_count IS NULL OR prompt_count >= 2)
     ORDER BY started_at DESC NULLS LAST
     LIMIT $1`,
    [BATCH_SIZE],
  );
  return rows;
}

async function upsertJudgment(client, run) {
  // Precedence: never overwrite human
  const existing = await client.query(
    `SELECT outcome_source FROM agent_runs WHERE id = $1`,
    [run.id],
  );
  if (existing.rows[0]?.outcome_source === 'human') {
    return { action: 'skipped', reason: 'human-protected' };
  }

  // Update agent_runs
  await client.query(
    `UPDATE agent_runs SET
       outcome = $2, outcome_score = $3, outcome_source = $4,
       drifted = $5, dead_end = $6,
       headline = COALESCE(NULLIF($7, ''), headline),
       judged_at = $8
     WHERE id = $1`,
    [
      run.id,
      run.judged_outcome,
      run.judged_score,
      'auto_judge',
      run.judged_drifted || false,
      run.judged_dead_end || false,
      run.judged_reason || '',
      new Date().toISOString(),
    ],
  );

  // Write judgment row (idempotent — use activity_id derived from the run id)
  // For timeline.db sources, the raw_ref is "source:id" — extract just the id.
  // For the dashboard's activity_log table, rows are int ids — we use a uuid.
  const judgmentId = `auto-${run.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  try {
    await client.query(
      `INSERT INTO judgments (id, activity_id, span_start, span_end, verdict, comment, collection_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING`,
      [
        judgmentId,
        0, // placeholder — activity_id links to activity_log, which we may not have
        run.started_at || null,
        run.ended_at || null,
        run.judged_outcome === 'success' ? 'good' :
          run.judged_outcome === 'failed' ? 'bad' :
            run.judged_outcome === 'bug' ? 'bug' : 'bad',
        run.judged_reason || '',
        'eval-auto-judge',
        new Date().toISOString(),
      ],
    );
  } catch {
    // judgment write is best-effort; the agent_runs row is the canonical outcome
  }

  return { action: 'graded', outcome: run.judged_outcome, score: run.judged_score };
}

// ── Transcript loading ─────────────────────────────────────────────

function loadClaudeTranscript(sessionId) {
  // Claude sessions are spread across ~/.claude/projects/<project-dir>/<uuid>.jsonl
  // Search all project directories for the matching file.
  const projectsDir = path.join(HOME, '.claude', 'projects');
  if (!fs.existsSync(projectsDir)) return null;

  const shortId = sessionId.includes(':') ? sessionId.split(':').pop() : sessionId;

  try {
    const dirs = fs.readdirSync(projectsDir, { withFileTypes: true });
    for (const entry of dirs) {
      if (!entry.isDirectory()) continue;
      const filePath = path.join(projectsDir, entry.name, `${shortId}.jsonl`);
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf-8');
      }
    }
  } catch {
    return null;
  }
  return null;
}

function loadPiTranscript(agentId, cwd) {
  // Pi sessions are under ~/.pi/agent/sessions/<cwd>/
  // Look for transcript files (*_transcript.jsonl or similar)
  if (!cwd) return null;
  const sessionsDir = path.join(HOME, '.pi', 'agent', 'sessions');
  // The directory naming scheme uses -- as path separator
  const dirName = cwd.replace(/\//g, '--');
  const dirPath = path.join(sessionsDir, dirName);
  if (!fs.existsSync(dirPath)) return null;

  // Find any jsonl files
  let files = [];
  try {
    files = fs.readdirSync(dirPath).filter(f => f.endsWith('.jsonl'));
  } catch { return null; }
  if (files.length === 0) return null;

  // Concatenate all transcript files (reasonably small)
  const chunks = [];
  for (const f of files.slice(0, 5)) {
    const p = path.join(dirPath, f);
    if (fs.statSync(p).size < 500_000) {
      chunks.push(fs.readFileSync(p, 'utf-8'));
    }
  }
  return chunks.join('\n');
}

function loadTranscript(run) {
  // raw_ref is "source:id" e.g. "claude-code:016d474f-..."
  const id = run.raw_ref?.includes(':') ? run.raw_ref.split(':').pop() : run.id.replace(/^[^:]+:/, '');
  if (run.source === 'claude-code') {
    return loadClaudeTranscript(id);
  }
  if (run.source === 'pi') {
    return loadPiTranscript(run.agent_id, run.cwd);
  }
  // omp, cursor, codex, open-webui — no transcript path, grade from metadata only
  return null;
}

// ── Transcript condensation ────────────────────────────────────────

function condenseTranscript(raw, source) {
  if (!raw) return null;
  const lines = raw.split('\n').filter(Boolean);
  const important = [];
  let totalChars = 0;
  const MAX = MAX_TRANSCRIPT_CHARS;

  for (const line of lines) {
    if (totalChars > MAX) break;
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }

    if (source === 'claude-code') {
      // Claude transcripts: type=user, assistant, result, system
      if (rec.type === 'user' && rec.message?.content) {
        const text = extractTextContent(rec.message.content);
        if (text) {
          important.push(`USER: ${text.slice(0, 500)}`);
          totalChars += text.length;
        }
      } else if (rec.type === 'result') {
        const result = rec.result || rec.subtype;
        const duration = rec.duration_ms ? ` (${rec.duration_ms}ms)` : '';
        important.push(`RESULT: ${result}${duration}`);
        totalChars += 100;
      } else if (rec.type === 'system' && rec.subtype === 'init') {
        const model = rec.model || rec.cwd || '';
        important.push(`SESSION: model=${model} cwd=${rec.cwd || ''}`);
        totalChars += 120;
      }
    } else if (source === 'pi') {
      // Pi transcripts: recordType=message (role: user/assistant), tool_call, etc
      if (rec.recordType === 'message' && rec.text) {
        const role = rec.role === 'user' ? 'USER' : 'ASSISTANT';
        important.push(`${role}: ${rec.text.slice(0, 500)}`);
        totalChars += rec.text.length;
      } else if (rec.recordType === 'tool_call' && rec.tool) {
        important.push(`TOOL: ${rec.tool}(${rec.status || '?'})`);
        totalChars += 80;
      } else if (rec.recordType === 'error') {
        important.push(`ERROR: ${rec.text || rec.message || 'unknown'}`);
        totalChars += 100;
      }
    }
  }

  return important.join('\n').slice(0, MAX_TRANSCRIPT_CHARS);
}

function extractTextContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

// ── LLM grading ────────────────────────────────────────────────────

async function gradeWithLLM(run, condensed) {
  const metadata = [
    `Source: ${run.source}`,
    `Agent: ${run.agent_id || 'unknown'}`,
    `Project: ${run.project || 'unknown'}`,
    `CWD: ${run.cwd || 'unknown'}`,
    `Operation: ${run.operation || 'unknown'}`,
    `Duration: ${run.duration_ms ? `${Math.round(run.duration_ms / 1000)}s` : 'unknown'}`,
    `Prompts: ${run.prompt_count || 'unknown'}`,
    `Error: ${run.error || 'none'}`,
    `Started: ${run.started_at || 'unknown'}`,
    `Ended: ${run.ended_at || 'unknown'}`,
  ].join('\n');

  const transcript = condensed
    ? `\n\n## Session Transcript (condensed)\n${condensed}`
    : '\n\n(No transcript available — grade from metadata only)';

  const prompt = `You are grading an AI coding agent's session. Your job is to determine the session's OUTCOME based on what the agent was asked to do and what it accomplished.

## Session Metadata
${metadata}
${transcript}

## Grading Rubric

Score the session on these dimensions (1-10 each) and determine the final outcome:

1. **Task Completion** — Did the agent finish what was asked? Was the deliverable produced?
2. **Focus** — Did the agent stay on task, or wander into unrelated work (drift)?
3. **Error Handling** — Did the agent encounter errors? Did it recover or get stuck?
4. **Efficiency** — Was the session duration and tool use reasonable for the task?

## Outcome Categories

- **success** — Task completed, deliverable produced, no significant issues
- **drifted** — Agent went off-task, did unrelated work, or did something different from what was asked
- **failed** — Task not completed, errors prevented progress, or agent gave up
- **dead_end** — Agent hit an unrecoverable error, got stuck in a loop, or produced nothing usable
- **unknown** — Not enough information to determine (rare — use only if truly ambiguous)

## Response Format (JSON only, no markdown)

Return a single JSON object:
{
  "outcome": "success|drifted|failed|dead_end|unknown",
  "score": 0.0 to 1.0 (overall quality score),
  "dimensions": { "completion": 1-10, "focus": 1-10, "error_handling": 1-10, "efficiency": 1-10 },
  "drifted": true/false,
  "dead_end": true/false,
  "one_line_reason": "<1 sentence explaining the outcome>"
}`;

  try {
    const response = await fetch(`${COMMANDCODE_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GRADING_MODEL,
        messages: [
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 800,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => '');
      return { error: `HTTP ${response.status}: ${err.slice(0, 200)}` };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content || content.trim() === '') return { error: 'Empty response from model' };

    let parsed;
    try {
      // Handle raw JSON, markdown-wrapped JSON, and truncated/incomplete JSON
      const jsonStr = content.replace(/```json\s*|\s*```/g, '').trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      // Try regex extraction as fallback for truncated responses
      const outcomeMatch = content.match(/"outcome"\s*:\s*"([^"]+)"/);
      const scoreMatch = content.match(/"score"\s*:\s*([0-9.]+)/);
      const reasonMatch = content.match(/"one_line_reason"\s*:\s*"([^"]*)/);
      if (outcomeMatch) {
        parsed = {
          outcome: outcomeMatch[1],
          score: scoreMatch ? parseFloat(scoreMatch[1]) : null,
          one_line_reason: reasonMatch ? reasonMatch[1] : '',
          drifted: content.includes('"drifted"') ? content.match(/"drifted"\s*:\s*true/i) !== null : false,
          dead_end: content.includes('"dead_end"') ? content.match(/"dead_end"\s*:\s*true/i) !== null : false,
          dimensions: {},
        };
      } else {
        return { error: `Failed to parse JSON: ${content.slice(0, 200)}` };
      }
    }

    return {
      outcome: parsed.outcome || 'unknown',
      score: typeof parsed.score === 'number' ? Math.max(0, Math.min(1, parsed.score)) : null,
      graduated_drifted: parsed.drifted === true,
      graduated_dead_end: parsed.dead_end === true,
      one_line_reason: parsed.one_line_reason || '',
      dimensions: parsed.dimensions || {},
    };
  } catch (e) {
    return { error: String(e) };
  }
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  const client = new Client({
    connectionString: DB_URL,
    connectionTimeoutMillis: 10_000,
  });
  await client.connect();

  // Ensure the eval collection exists
  try {
    await client.query(
      `INSERT INTO judgment_collections (id, name, kind, description, created_at)
       VALUES ('eval-auto-judge', 'auto-judge (gemini)', 'eval', 'Automated session grading via gemini-3.5-flash', $1)
       ON CONFLICT (id) DO NOTHING`,
      [new Date().toISOString()],
    );
  } catch { /* ok if table doesn't exist yet in dev */ }

  const sessions = await getUnjudgedSessions(client);
  if (sessions.length === 0) {
    console.log('[auto-judge] no unjudged sessions in batch');
    await client.end();
    return;
  }

  console.log(`[auto-judge] grading ${sessions.length} session(s)...`);
  let graded = 0, skipped = 0, errors = 0;

  for (const run of sessions) {
    const raw = loadTranscript(run);
    const condensed = condenseTranscript(raw, run.source);

    const result = await gradeWithLLM(run, condensed);

    if (result.error) {
      console.log(`[auto-judge] ${run.id.slice(0, 20)}... ERROR: ${result.error}`);
      errors++;
      continue;
    }

    run.judged_outcome = result.outcome;
    run.judged_score = result.score;
    run.judged_drifted = result.graduated_drifted;
    run.judged_dead_end = result.graduated_dead_end;
    run.judged_reason = result.one_line_reason;

    const upsertResult = await upsertJudgment(client, run);
    if (upsertResult.action === 'skipped') {
      skipped++;
    } else {
      console.log(`[auto-judge] ${run.id.slice(0, 20)}... ${result.outcome} (score=${result.score}) ${result.one_line_reason}`);
      graded++;
    }

    // Rate-limit: small delay between grading calls
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`[auto-judge] done: ${graded} graded, ${skipped} skipped, ${errors} errors`);
  await client.end();
}

main().catch((err) => {
  console.error('[auto-judge] fatal:', err);
  process.exit(1);
});
