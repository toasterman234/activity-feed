#!/usr/bin/env node
// One-off: import EXISTING pi subagent transcript history into activity_log.
// pi-watcher.js only tails new appends going forward; this covers everything
// written before the watcher started watching the right directories.
// Idempotent - re-running skips any (source, type, detail) already present,
// so it's safe to re-run whenever new transcript files show up.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { Client } = require('pg');

const HOME = os.homedir();
const DB_URL = process.env.ACTIVITY_DB_URL || 'postgres://activity:activity@localhost:5433/activity_log';

// Same prune list as pi-watcher.js - an unpruned find over $HOME crawls
// node_modules/Library/etc. and can take 20+ minutes.
const EXCLUDE_DIRS = [
  'node_modules', '.git', '.next', '.turbo', '.cache', 'dist', 'build',
  'Library', '.npm', '.nvm', '.local', '.docker', '.Trash',
  '.venv', 'venv', '__pycache__', '.pytest_cache', 'target', '.gradle',
  '.cargo', '.rustup', 'Movies', 'Music', 'Pictures', 'Downloads',
  '.claude/projects', '.vscode-server', '.DS_Store',
];

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  // node-pg auto-parses jsonb into objects, and object key order isn't
  // guaranteed to match what we'd freshly build - canonicalize (sorted
  // top-level keys) on both sides before comparing, or "already present"
  // checks silently never match.
  const canon = (obj) => JSON.stringify(
    Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))),
  );
  const existing = new Set(
    (await client.query(`SELECT type, detail FROM activity_log WHERE source = 'pi'`)).rows
      .map((r) => `${r.type} ${canon(r.detail)}`),
  );

  const pruneNames = [...new Set(EXCLUDE_DIRS.filter((d) => !d.includes('/')))];
  const pruneArgs = pruneNames.flatMap((d) => ['-name', d, '-o']);
  pruneArgs.pop();
  const dirs = execFileSync('find', [
    HOME, '(', ...pruneArgs, ')', '-prune', '-o', '-type', 'd', '-name', '.pi-subagents', '-print',
  ], { encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024, timeout: 60_000 })
    .split('\n').filter(Boolean).filter((d) => !d.includes('-backups'));

  let fileCount = 0, msgCount = 0, subagentCount = 0, skipCount = 0;

  for (const dir of dirs) {
    const artifactsDir = path.join(dir, 'artifacts');
    if (!fs.existsSync(artifactsDir)) continue;
    for (const f of fs.readdirSync(artifactsDir)) {
      if (!f.endsWith('_transcript.jsonl')) continue;
      const filePath = path.join(artifactsDir, f);
      fileCount++;

      const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
      let agent = null, runId = null, cwd = null;
      const typeCounts = {};
      const messages = [];
      for (const line of lines) {
        let rec;
        try { rec = JSON.parse(line); } catch { continue; }
        agent = agent || rec.agent;
        runId = runId || rec.runId;
        cwd = cwd || rec.cwd;
        typeCounts[rec.recordType] = (typeCounts[rec.recordType] || 0) + 1;
        if (rec.recordType === 'message' && typeof rec.text === 'string' && rec.text.trim()) {
          messages.push({ role: rec.role, text: rec.text, ts: rec.timestamp });
        }
      }
      if (!agent && messages.length === 0) continue;

      const project = cwd ? path.basename(cwd) : 'unknown';
      const sessionId = runId ? `${runId}:${agent || 'unknown'}` : undefined;
      const fileStat = fs.statSync(filePath);
      const summary = `pi subagent "${agent || 'unknown'}" ran in ${project} (${lines.length} event(s), backfilled)`;
      const subagentObj = { project, session_id: sessionId, agent, runId, cwd, typeCounts };

      if (existing.has(`pi.subagent ${canon(subagentObj)}`)) {
        skipCount++;
      } else {
        const subagentDetail = JSON.stringify(subagentObj);
        await client.query(
          `INSERT INTO activity_log (source, type, summary, detail, created_at) VALUES ($1, $2, $3, $4, $5)`,
          ['pi', 'pi.subagent', summary, subagentDetail, fileStat.mtime.toISOString()],
        );
        existing.add(`pi.subagent ${canon(subagentObj)}`);
        subagentCount++;
      }

      for (const m of messages) {
        const truncated = m.text.length > 4000 ? m.text.slice(0, 4000) + '...[truncated]' : m.text;
        const msgSummary = truncated.length > 140 ? truncated.slice(0, 140) + '...' : truncated;
        const msgObj = { project, session_id: sessionId, agent, role: m.role, text: truncated };
        if (existing.has(`pi.message ${canon(msgObj)}`)) { skipCount++; continue; }
        const msgDetail = JSON.stringify(msgObj);
        await client.query(
          `INSERT INTO activity_log (source, type, summary, detail, created_at) VALUES ($1, $2, $3, $4, $5)`,
          ['pi', 'pi.message', msgSummary, msgDetail, m.ts || fileStat.mtime.toISOString()],
        );
        existing.add(`pi.message ${canon(msgObj)}`);
        msgCount++;
      }
    }
  }

  console.log(`[pi-backfill] scanned ${fileCount} transcript file(s) across ${dirs.length} project(s): inserted ${subagentCount} new row(s) + ${msgCount} new message(s), skipped ${skipCount} already-present`);
  await client.end();
}

main().catch((err) => { console.error('[pi-backfill] fatal:', err); process.exit(1); });
