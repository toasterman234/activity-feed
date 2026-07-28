#!/usr/bin/env node
// Watches pi's subagent transcript directories and writes a summarized row to
// activity_log per burst of new transcript lines. Tracks a byte offset per
// file so it only reads newly-appended content, not the whole file each time.
//
// Pi writes transcripts per-project (<project>/.pi-subagents/artifacts/), not
// just under $HOME/.pi-subagents — so this watches the whole home directory
// (like file-watcher.js) filtered down to *_transcript.jsonl paths, instead
// of one fixed directory.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { Client } = require('pg');

const HOME = os.homedir();
const DB_URL = process.env.ACTIVITY_DB_URL || 'postgres://activity:activity@localhost:5433/activity_log';

// Mirrors file-watcher.js's exclude list, plus backup/archive dirs that
// duplicate real transcripts under timestamped snapshot paths.
const EXCLUDE_DIRS = [
  'node_modules', '.git', '.next', '.turbo', '.cache', 'dist', 'build',
  'Library', '.npm', '.nvm', '.local/share', '.docker', '.Trash',
  '.venv', 'venv', '__pycache__', '.pytest_cache', 'target', '.gradle',
  '.cargo', '.rustup', 'Movies', 'Music', 'Pictures', 'Downloads',
  '.claude/projects', '.vscode-server', '.DS_Store', '-backups',
];
const excludePattern = `(${EXCLUDE_DIRS.map(d => d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`;

const client = new Client({ connectionString: DB_URL });
const offsets = new Map(); // file path -> byte offset already read

let pendingFiles = new Set();
let flushTimer = null;

function queueFile(filePath) {
  if (!filePath.endsWith('_transcript.jsonl')) return;
  if (!filePath.includes('.pi-subagents' + path.sep + 'artifacts')) return;
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
    const messages = [];
    for (const line of lines) {
      try {
        const rec = JSON.parse(line);
        agent = agent || rec.agent;
        runId = runId || rec.runId;
        cwd = cwd || rec.cwd;
        typeCounts[rec.recordType] = (typeCounts[rec.recordType] || 0) + 1;
        if (rec.recordType === 'message' && typeof rec.text === 'string' && rec.text.trim()) {
          messages.push({ role: rec.role, text: rec.text });
        }
      } catch {
        // skip malformed line
      }
    }

    const project = cwd ? path.basename(cwd) : 'unknown';
    const sessionId = runId ? `${runId}:${agent || 'unknown'}` : undefined;
    const summary = `pi subagent "${agent || 'unknown'}" active in ${project} (${lines.length} new event(s))`;

    try {
      await client.query(
        `INSERT INTO activity_log (source, type, summary, detail) VALUES ($1, $2, $3, $4)`,
        ['pi', 'pi.subagent', summary, JSON.stringify({ project, session_id: sessionId, agent, runId, cwd, typeCounts })]
      );
    } catch (err) {
      console.error('[pi-watcher] insert failed:', err.message);
    }

    for (const m of messages) {
      const truncated = m.text.length > 4000 ? m.text.slice(0, 4000) + '...[truncated]' : m.text;
      const msgSummary = truncated.length > 140 ? truncated.slice(0, 140) + '…' : truncated;
      try {
        await client.query(
          `INSERT INTO activity_log (source, type, summary, detail) VALUES ($1, $2, $3, $4)`,
          ['pi', 'pi.message', msgSummary, JSON.stringify({ project, session_id: sessionId, agent, role: m.role, text: truncated })]
        );
      } catch (err) {
        console.error('[pi-watcher] message insert failed:', err.message);
      }
    }
  }
}

async function main() {
  await client.connect();
  console.log('[pi-watcher] connected to activity_log, watching', HOME, '(all *.pi-subagents/artifacts dirs)');

  // seed offsets at current EOF so we only pick up NEW activity going forward
  // (existing history is backfilled separately by pi-backfill.js, not here)
  //
  // IMPORTANT: unpruned `find $HOME -type d -name .pi-subagents` crawls every
  // directory under home — node_modules, Library, .Trash, external mounts —
  // and can take many minutes or effectively hang. It previously did exactly
  // that: pi-watcher sat blocked in this synchronous seed step for 28+
  // minutes, never reaching the fswatch spawn below, so it silently stopped
  // picking up new pi sessions entirely. Prune the same heavy dirs
  // file-watcher.js already excludes, and cap the search with a timeout so a
  // future slow filesystem degrades to "skip seeding" instead of "hang
  // forever and watch nothing".
  try {
    // find's -name only matches a bare basename — entries like '.local/share'
    // in EXCLUDE_DIRS never match anything via -name, so prune '.local'
    // wholesale instead (uv/pipx tool venvs live under there and are large).
    const pruneNames = [...new Set(EXCLUDE_DIRS.filter((d) => !d.includes('/')).concat('.local'))];
    const pruneArgs = pruneNames.flatMap((d) => ['-name', d, '-o']);
    pruneArgs.pop(); // drop trailing -o
    const found = execFileSync('find', [
      HOME, '(', ...pruneArgs, ')', '-prune', '-o', '-type', 'd', '-name', '.pi-subagents', '-print',
    ], {
      encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024, timeout: 60_000,
    }).split('\n').filter(Boolean).filter((d) => !d.includes('-backups'));
    for (const dir of found) {
      const artifactsDir = path.join(dir, 'artifacts');
      if (!fs.existsSync(artifactsDir)) continue;
      for (const f of fs.readdirSync(artifactsDir)) {
        if (f.endsWith('_transcript.jsonl')) {
          const p = path.join(artifactsDir, f);
          try { offsets.set(p, fs.statSync(p).size); } catch {}
        }
      }
    }
    console.log('[pi-watcher] seeded offsets for', offsets.size, 'existing transcript file(s) across', found.length, 'project(s)');
  } catch (err) {
    console.error('[pi-watcher] offset seed failed:', err.message);
  }

  const fsw = spawn('fswatch', ['-r', '-E', '--exclude', excludePattern, '--event', 'Created', '--event', 'Updated', HOME]);
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
