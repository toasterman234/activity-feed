#!/usr/bin/env node
// Watches Claude Code's own session transcripts (~/.claude/projects/**/*.jsonl)
// and writes one activity_log row per user/assistant text message, so the
// dashboard can render real message threads instead of only tool-call events.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { Client } = require('pg');

const WATCH_DIR = path.join(os.homedir(), '.claude', 'projects');
const DB_URL = process.env.ACTIVITY_DB_URL || 'postgres://activity:activity@localhost:5433/activity_log';
const MAX_TEXT = 500; // enough for feed context; full transcripts stay on disk

const client = new Client({ connectionString: DB_URL });
const offsets = new Map(); // file path -> byte offset already read

let pendingFiles = new Set();
let flushTimer = null;

function queueFile(filePath) {
  if (!filePath.endsWith('.jsonl')) return;
  pendingFiles.add(filePath);
  if (!flushTimer) flushTimer = setTimeout(flush, 1500);
}

function projectFromPath(filePath) {
  // .../.claude/projects/-Users-bencharney-ax-brain-crew/<session>.jsonl
  const dir = path.basename(path.dirname(filePath));
  const parts = dir.split('-').filter(Boolean);
  return parts.slice(-1)[0] || dir;
}

function extractText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n\n')
    .trim();
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
      continue; // file removed
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
      console.error('[claude-transcript-watcher] read failed:', err.message);
      continue;
    }
    offsets.set(filePath, stat.size);

    const lines = chunk.split('\n').filter(Boolean);
    if (lines.length === 0) continue;

    const project = projectFromPath(filePath);
    const sessionId = path.basename(filePath, '.jsonl');

    for (const line of lines) {
      let rec;
      try { rec = JSON.parse(line); } catch { continue; }
      if (rec.type !== 'user' && rec.type !== 'assistant') continue;

      const role = rec.message?.role || rec.type;
      const text = extractText(rec.message?.content);
      if (!text) continue; // skip tool-only turns with no text

      const truncated = text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) + '...[truncated]' : text;
      const summary = truncated.length > 140 ? truncated.slice(0, 140) + '…' : truncated;

      try {
        await client.query(
          `INSERT INTO activity_log (source, type, summary, detail) VALUES ($1, $2, $3, $4)`,
          [
            'claude-code',
            'claude.message',
            summary,
            JSON.stringify({ project, session_id: sessionId, role, text: truncated, event: 'message' }),
          ],
        );
      } catch (err) {
        console.error('[claude-transcript-watcher] insert failed:', err.message);
      }
    }
  }
}

async function main() {
  await client.connect();
  console.log('[claude-transcript-watcher] connected to activity_log, watching', WATCH_DIR);

  if (!fs.existsSync(WATCH_DIR)) {
    console.error('[claude-transcript-watcher] watch dir does not exist:', WATCH_DIR);
    process.exit(1);
  }

  // seed offsets at current EOF so we only pick up NEW messages going forward
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) walk(p);
      else if (f.name.endsWith('.jsonl')) {
        try { offsets.set(p, fs.statSync(p).size); } catch {}
      }
    }
  };
  walk(WATCH_DIR);

  const fsw = spawn('fswatch', ['-r', '-E', '--event', 'Created', '--event', 'Updated', WATCH_DIR]);
  fsw.stdout.setEncoding('utf8');
  let buf = '';
  fsw.stdout.on('data', (chunk) => {
    buf += chunk;
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (line.trim()) queueFile(line.trim());
    }
  });
  fsw.stderr.on('data', (d) => console.error('[fswatch]', d.toString()));
  fsw.on('exit', (code) => {
    console.error('[claude-transcript-watcher] fswatch exited with code', code);
    process.exit(1);
  });
}

main().catch((err) => {
  console.error('[claude-transcript-watcher] fatal:', err);
  process.exit(1);
});
