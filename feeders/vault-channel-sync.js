#!/usr/bin/env node
// Mirrors channels/channel_members/messages (Postgres) into the Obsidian
// vault, one markdown note per thread — same "note per thread" convention as
// the Slack vault bridge's vault/<project>/threads/<thread-ts>/transcript.md.
// Polls on an interval rather than LISTEN/NOTIFY: this dataset is tiny
// (personal channel chat), so a full re-render of all threads every cycle is
// simpler and more robust than incremental diffing, and cheap enough to run
// every 15s indefinitely.

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DB_URL = process.env.ACTIVITY_DB_URL || 'postgres://activity:activity@localhost:5433/activity_log';
const VAULT_DIR = process.env.VAULT_DIR
  || '/Volumes/Extra Storage Crucial 1TB SSD/Projects/Infrastructure/obsidian-vault/Vault-v2';
const CHANNELS_DIR = path.join(VAULT_DIR, '90 System', 'Ax Crew', 'Channels');
const POLL_MS = Number(process.env.VAULT_CHANNEL_SYNC_POLL_MS || 15_000);

const pool = new Pool({ connectionString: DB_URL });

// thread key ("channelId:threadId") -> last-written content hash, so we skip
// rewriting (and don't spam Obsidian's file watcher / re-index) when nothing
// in that thread changed since the last poll.
const lastHash = new Map();

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'untitled';
}

function hashOf(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
  return h;
}

function fmtTime(iso) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toISOString().replace('T', ' ').slice(0, 19) + 'Z';
}

function renderThread(channel, members, topMsg, replies) {
  const memberLines = members.length
    ? members.map((m) => `  - ${m.member_type}: ${m.member_name}`).join('\n')
    : '  []';
  const fm = [
    '---',
    `channel: "${channel.name}"`,
    `channel_id: ${channel.id}`,
    `thread_id: ${topMsg.id}`,
    `created_at: ${topMsg.created_at}`,
    `updated_at: ${(replies[replies.length - 1] || topMsg).created_at}`,
    `reply_count: ${replies.length}`,
    'members:',
    memberLines,
    'source: activity-feed channels (auto-synced)',
    '---',
    '',
  ].join('\n');

  const lines = [fm, `# ${channel.name} — thread`, ''];
  lines.push(`**${topMsg.author}** · ${fmtTime(topMsg.created_at)}`);
  lines.push('');
  lines.push(topMsg.body);
  lines.push('');
  if (replies.length) {
    lines.push('---');
    lines.push('');
    lines.push('## Replies');
    lines.push('');
    for (const r of replies) {
      lines.push(`**${r.author}** · ${fmtTime(r.created_at)}`);
      lines.push('');
      lines.push(r.body);
      lines.push('');
    }
  }
  return lines.join('\n');
}

async function syncOnce() {
  const [channelsRes, membersRes, messagesRes] = await Promise.all([
    pool.query('SELECT id, name, description, created_at FROM channels'),
    pool.query('SELECT id, channel_id, member_type, member_name FROM channel_members'),
    pool.query('SELECT id, channel_id, thread_id, author, body, created_at FROM messages ORDER BY created_at ASC'),
  ]);

  const membersByChannel = new Map();
  for (const m of membersRes.rows) {
    if (!membersByChannel.has(m.channel_id)) membersByChannel.set(m.channel_id, []);
    membersByChannel.get(m.channel_id).push(m);
  }

  const messagesByChannel = new Map();
  for (const m of messagesRes.rows) {
    if (!messagesByChannel.has(m.channel_id)) messagesByChannel.set(m.channel_id, []);
    messagesByChannel.get(m.channel_id).push(m);
  }

  let written = 0;
  const seenThreadKeys = new Set();

  for (const channel of channelsRes.rows) {
    const channelMsgs = messagesByChannel.get(channel.id) || [];
    const topLevel = channelMsgs.filter((m) => !m.thread_id);
    const repliesOf = (id) => channelMsgs.filter((m) => m.thread_id === id);
    if (!topLevel.length) continue;

    const channelDir = path.join(CHANNELS_DIR, slugify(channel.name));
    fs.mkdirSync(channelDir, { recursive: true });

    for (const topMsg of topLevel) {
      const replies = repliesOf(topMsg.id);
      const threadKey = `${channel.id}:${topMsg.id}`;
      seenThreadKeys.add(threadKey);

      const content = renderThread(channel, membersByChannel.get(channel.id) || [], topMsg, replies);
      const h = hashOf(content);
      if (lastHash.get(threadKey) === h) continue;

      const fileName = `${topMsg.created_at.slice(0, 10)} — ${slugify(topMsg.body)} — ${topMsg.id.slice(0, 8)}.md`;
      fs.writeFileSync(path.join(channelDir, fileName), content, 'utf-8');
      lastHash.set(threadKey, h);
      written++;
    }
  }

  // drop hash entries for threads that no longer exist (e.g. deleted rows) —
  // doesn't delete vault files, just stops tracking them, so re-adding never
  // causes divergence.
  for (const key of [...lastHash.keys()]) {
    if (!seenThreadKeys.has(key)) lastHash.delete(key);
  }

  if (written) console.log(`[vault-channel-sync] wrote ${written} thread note(s)`);
}

async function main() {
  await pool.query('SELECT 1');
  console.log('[vault-channel-sync] connected, syncing into', CHANNELS_DIR);
  fs.mkdirSync(CHANNELS_DIR, { recursive: true });

  const loop = async () => {
    try {
      await syncOnce();
    } catch (err) {
      console.error('[vault-channel-sync] sync failed:', err.message);
    }
    setTimeout(loop, POLL_MS);
  };
  await loop();
}

main().catch((err) => {
  console.error('[vault-channel-sync] fatal:', err);
  process.exit(1);
});
