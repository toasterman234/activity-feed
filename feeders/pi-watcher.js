#!/usr/bin/env node
// Watches pi's subagent transcript directory and writes a summarized row to
// activity_log per burst of new transcript lines. Tracks a byte offset per
// file so it only reads newly-appended content, not the whole file each time.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Client } = require('pg');

const WATCH_DIR = '/Users/bencharney/.pi-subagents/artifacts';
const DB_URL = process.env.ACTIVITY_DB_URL || 'postgres://activity:activity@localhost:5433/activity_log';

const client = new Client({ connectionString: DB_URL });
const offsets = new Map(); // file path -> byte offset already read

let pendingFiles = new Set();
let flushTimer = null;

function queueFile(filePath) {
  if (!filePath.endsWith('_transcript.jsonl')) return;
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
      continue; // file removed
    }

    const prevOffset = offsets.get(filePath) || 0;
    if (stat.size <= prevOffset) continue; // no new content (or truncated, skip)

    let chunk;
    try {
      const fd = fs.openSync(filePath, 'r');
      const buf = Buffer.alloc(stat.size - prevOffset);
      fs.readSync(fd, buf, 0, buf.length, prevOffset);
      fs.closeSync(fd);
      chunk = buf.toString('utf8');
    } catch (err) {
      console.error('[pi-watcher] read failed:', err.message);
      continue;
    }
    offsets.set(filePath, stat.size);

    const lines = chunk.split('\n').filter(Boolean);
    if (lines.length === 0) continue;

    let agent = null, runId = null, cwd = null;
    const typeCounts = {};
    for (const line of lines) {
      try {
        const rec = JSON.parse(line);
        agent = agent || rec.agent;
        runId = runId || rec.runId;
        cwd = cwd || rec.cwd;
        typeCounts[rec.recordType] = (typeCounts[rec.recordType] || 0) + 1;
      } catch {
        // skip malformed line
      }
    }

    const project = cwd ? path.basename(cwd) : 'unknown';
    const summary = `pi subagent "${agent || 'unknown'}" active in ${project} (${lines.length} new event(s))`;

    try {
      await client.query(
        `INSERT INTO activity_log (source, type, summary, detail) VALUES ($1, $2, $3, $4)`,
        ['pi', 'pi.subagent', summary, JSON.stringify({ agent, runId, cwd, typeCounts })]
      );
    } catch (err) {
      console.error('[pi-watcher] insert failed:', err.message);
    }
  }
}

async function main() {
  await client.connect();
  console.log('[pi-watcher] connected to activity_log, watching', WATCH_DIR);

  if (!fs.existsSync(WATCH_DIR)) {
    console.error('[pi-watcher] watch dir does not exist:', WATCH_DIR);
    process.exit(1);
  }

  // seed offsets at current EOF so we only pick up NEW activity going forward
  for (const f of fs.readdirSync(WATCH_DIR)) {
    if (f.endsWith('_transcript.jsonl')) {
      const p = path.join(WATCH_DIR, f);
      try { offsets.set(p, fs.statSync(p).size); } catch {}
    }
  }

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
    console.error('[pi-watcher] fswatch exited with code', code);
    process.exit(1);
  });
}

main().catch((err) => {
  console.error('[pi-watcher] fatal:', err);
  process.exit(1);
});
