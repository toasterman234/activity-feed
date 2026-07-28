#!/usr/bin/env node
// One-off: import EXISTING pi CLI session transcript history
// (~/.pi/agent/sessions/<cwd>/*.jsonl) into activity_log. Covers both
// terminal-run `pi` and Paseo-launched pi agents, which write into this same
// directory (Paseo just points its nativeHandle here) - a completely
// different tree from the *.pi-subagents/artifacts format pi-backfill.js
// covers. pi-session-watcher.js only tails new appends going forward; this
// covers everything written before the watcher started.
// Idempotent - re-running skips any (source, type, detail) already present.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { Client } = require('pg');

const HOME = os.homedir();
const SESSIONS_DIR = path.join(HOME, '.pi', 'agent', 'sessions');
const DB_URL = process.env.ACTIVITY_DB_URL || 'postgres://activity:activity@localhost:5433/activity_log';

// Truncating at a fixed char length can split a UTF-16 surrogate pair (e.g.
// mid-emoji), leaving a lone surrogate that Postgres's json parser rejects.
function stripLoneSurrogates(s) {
  return s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
}

function textFromContent(content) {
  if (!Array.isArray(content)) return '';
  return content.filter((c) => c && c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text).join('\n').trim();
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.name.endsWith('.jsonl')) out.push(p);
  }
}

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  const canon = (obj) => JSON.stringify(
    Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))),
  );
  const existing = new Set(
    (await client.query(`SELECT type, detail FROM activity_log WHERE source = 'pi' AND type = 'pi.message'`)).rows
      .map((r) => `${r.type} ${canon(r.detail)}`),
  );

  if (!fs.existsSync(SESSIONS_DIR)) {
    console.log('[pi-session-backfill] sessions dir does not exist, nothing to do');
    await client.end();
    return;
  }

  const files = [];
  walk(SESSIONS_DIR, files);

  let fileCount = 0, msgCount = 0, skipCount = 0;

  for (const filePath of files) {
    fileCount++;
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
    let sessionId = path.basename(filePath, '.jsonl');
    let cwd = null;
    const messages = [];
    for (const line of lines) {
      let rec;
      try { rec = JSON.parse(line); } catch { continue; }
      if (rec.type === 'session') {
        sessionId = rec.id || sessionId;
        cwd = rec.cwd || cwd;
      } else if (rec.type === 'message' && rec.message) {
        const role = rec.message.role;
        if (role !== 'user' && role !== 'assistant') continue;
        const text = textFromContent(rec.message.content);
        if (text) messages.push({ role, text, ts: rec.timestamp });
      }
    }
    if (messages.length === 0) continue;

    const project = cwd ? path.basename(cwd) : path.basename(path.dirname(filePath));
    const fileStat = fs.statSync(filePath);

    for (const m of messages) {
      const truncated = stripLoneSurrogates(m.text.length > 4000 ? m.text.slice(0, 4000) + '...[truncated]' : m.text);
      const msgSummary = truncated.length > 140 ? truncated.slice(0, 140) + '…' : truncated;
      const msgObj = { project, session_id: sessionId, cwd, role: m.role, text: truncated };
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

  console.log(`[pi-session-backfill] scanned ${fileCount} session file(s): inserted ${msgCount} new message(s), skipped ${skipCount} already-present`);
  await client.end();
}

main().catch((err) => { console.error('[pi-session-backfill] fatal:', err); process.exit(1); });
