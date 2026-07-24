#!/usr/bin/env node
// Watches the home folder and writes a row to activity_log per meaningful file change.
// Heavily filtered to avoid noise from caches, node_modules, git internals, etc.

const { spawn } = require('child_process');
const { Client } = require('pg');
const os = require('os');
const path = require('path');

const HOME = os.homedir();
const DB_URL = process.env.ACTIVITY_DB_URL || 'postgres://activity:activity@localhost:5433/activity_log';

const EXCLUDE_DIRS = [
  'node_modules', '.git', '.next', '.turbo', '.cache', 'dist', 'build',
  'Library', '.npm', '.nvm', '.local/share', '.docker', '.Trash',
  '.venv', 'venv', '__pycache__', '.pytest_cache', 'target', '.gradle',
  '.cargo', '.rustup', 'Movies', 'Music', 'Pictures', 'Downloads',
  '.claude/projects', '.vscode-server', '.DS_Store',
];

// fswatch --exclude uses regex; build one alternation pattern
const excludePattern = `(${EXCLUDE_DIRS.map(d => d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`;

const client = new Client({ connectionString: DB_URL });

// batch + throttle: collect changes, flush every 2s as one summarized row per burst
let pending = [];
let flushTimer = null;

function queueChange(filePath, evType) {
  pending.push({ filePath, evType });
  if (!flushTimer) flushTimer = setTimeout(flush, 2000);
}

async function flush() {
  flushTimer = null;
  if (pending.length === 0) return;
  const batch = pending;
  pending = [];

  // group by top-level project dir under home
  const byProject = {};
  for (const { filePath, evType } of batch) {
    const rel = path.relative(HOME, filePath);
    const project = rel.split(path.sep)[0] || rel;
    byProject[project] = byProject[project] || [];
    byProject[project].push({ file: rel, event: evType });
  }

  for (const [project, changes] of Object.entries(byProject)) {
    const summary = `${changes.length} file change(s) in ${project}`;
    try {
      await client.query(
        `INSERT INTO activity_log (source, type, summary, detail) VALUES ($1, $2, $3, $4)`,
        ['file-watcher', 'file.change', summary, JSON.stringify({ project, changes: changes.slice(0, 50) })]
      );
    } catch (err) {
      console.error('[file-watcher] insert failed:', err.message);
    }
  }
}

async function main() {
  await client.connect();
  console.log('[file-watcher] connected to activity_log, watching', HOME);

  const fsw = spawn('fswatch', [
    '-r', '-E',
    '--event', 'Created', '--event', 'Updated', '--event', 'Removed', '--event', 'Renamed',
    '-e', excludePattern,
    HOME,
  ]);

  fsw.stdout.setEncoding('utf8');
  let buf = '';
  fsw.stdout.on('data', (chunk) => {
    buf += chunk;
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (line.trim()) queueChange(line.trim(), 'change');
    }
  });

  fsw.stderr.on('data', (d) => console.error('[fswatch]', d.toString()));
  fsw.on('exit', (code) => {
    console.error('[file-watcher] fswatch exited with code', code);
    process.exit(1);
  });
}

main().catch((err) => {
  console.error('[file-watcher] fatal:', err);
  process.exit(1);
});
