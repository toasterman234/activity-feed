#!/usr/bin/env node
// Watches pi's own CLI session transcripts (~/.pi/agent/sessions/<cwd>/*.jsonl),
// written for both terminal-run `pi` and Paseo-launched pi agents (Paseo just
// points at a nativeHandle under this same directory). Distinct from
// pi-watcher.js, which only covers the *.pi-subagents/artifacts subagent
// format — that format never gets written for these sessions.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { Client } = require('pg');

const HOME = os.homedir();
// fswatch/FSEvents reports resolved (real) paths, so if ~/.pi is a symlink
// (e.g. -> ~/pi/agent-config/.pi-live) we must watch/compare against the
// resolved path, not the symlink path, or every event is silently dropped.
const SESSIONS_DIR = fs.realpathSync(path.join(HOME, '.pi', 'agent', 'sessions'));
const DB_URL = process.env.ACTIVITY_DB_URL || 'postgres://activity:activity@localhost:5433/activity_log';

const client = new Client({ connectionString: DB_URL });
const offsets = new Map(); // file path -> byte offset already read
const sessionMeta = new Map(); // file path -> { sessionId, cwd }

let pendingFiles = new Set();
let flushTimer = null;

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

function queueFile(filePath) {
  if (!filePath.endsWith('.jsonl')) return;
  if (!filePath.startsWith(SESSIONS_DIR + path.sep)) return;
  pendingFiles.add(filePath);
  if (!flushTimer) flushTimer = setTimeout(flush, 3000);
}

async function flush() {
  flushTimer = null;
  const files = [...pendingFiles];
  pendingFiles = new Set();

  for (const filePath of files) {
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      continue;
    }

    const prevOffset = offsets.get(filePath) || 0;
    if (stat.size <= prevOffset) continue;

    let chunk;
    try {
      const fd = fs.openSync(filePath, 'r');
      const buf = Buffer.alloc(stat.size - prevOffset);
      fs.readSync(fd, buf, 0, buf.length, prevOffset);
      fs.closeSync(fd);
      chunk = buf.toString('utf8');
    } catch (err) {
      console.error('[pi-session-watcher] read failed:', err.message);
      continue;
    }
    offsets.set(filePath, stat.size);

    const lines = chunk.split('\n').filter(Boolean);
    if (lines.length === 0) continue;

    let meta = sessionMeta.get(filePath) || {};
    const messages = [];
    for (const line of lines) {
      let rec;
      try {
        rec = JSON.parse(line);
      } catch {
        continue;
      }
      if (rec.type === 'session') {
        meta = { sessionId: rec.id, cwd: rec.cwd };
        sessionMeta.set(filePath, meta);
      } else if (rec.type === 'message' && rec.message) {
        const role = rec.message.role;
        if (role !== 'user' && role !== 'assistant') continue;
        const text = textFromContent(rec.message.content);
        if (text) messages.push({ role, text });
      }
    }
    if (messages.length === 0) continue;

    const project = meta.cwd ? path.basename(meta.cwd) : path.basename(path.dirname(filePath));
    const sessionId = meta.sessionId || path.basename(filePath, '.jsonl');

    for (const m of messages) {
      const truncated = stripLoneSurrogates(m.text.length > 500 ? m.text.slice(0, 500) + '…' : m.text);
      const msgSummary = truncated.length > 140 ? truncated.slice(0, 140) + '…' : truncated;
      try {
        await client.query(
          `INSERT INTO activity_log (source, type, summary, detail) VALUES ($1, $2, $3, $4)`,
          ['pi', 'pi.message', msgSummary, JSON.stringify({ project, session_id: sessionId, cwd: meta.cwd, role: m.role, text: truncated })]
        );
      } catch (err) {
        console.error('[pi-session-watcher] insert failed:', err.message);
      }
    }
  }
}

async function main() {
  await client.connect();
  console.log('[pi-session-watcher] connected to activity_log, watching', SESSIONS_DIR);

  if (!fs.existsSync(SESSIONS_DIR)) {
    console.error('[pi-session-watcher] sessions dir does not exist, exiting');
    process.exit(1);
  }

  // seed offsets at current EOF so we only pick up NEW activity going forward
  // (existing history is backfilled separately by pi-session-backfill.js)
  try {
    const found = execFileSync('find', [SESSIONS_DIR, '-name', '*.jsonl'], {
      encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024, timeout: 60_000,
    }).split('\n').filter(Boolean);
    for (const p of found) {
      try { offsets.set(p, fs.statSync(p).size); } catch {}
    }
    console.log('[pi-session-watcher] seeded offsets for', offsets.size, 'existing session file(s)');
  } catch (err) {
    console.error('[pi-session-watcher] offset seed failed:', err.message);
  }

  const fsw = spawn('fswatch', ['-r', '--event', 'Created', '--event', 'Updated', SESSIONS_DIR]);
  fsw.stdout.setEncoding('utf8');
  let buf = '';
  fsw.stdout.on('data', (data) => {
    buf += data;
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (line.trim()) queueFile(line.trim());
    }
  });
  fsw.stderr.on('data', (d) => console.error('[fswatch]', d.toString()));
  fsw.on('exit', (code) => {
    console.error('[pi-session-watcher] fswatch exited with code', code);
    process.exit(1);
  });
}

main().catch((err) => {
  console.error('[pi-session-watcher] fatal:', err);
  process.exit(1);
});
