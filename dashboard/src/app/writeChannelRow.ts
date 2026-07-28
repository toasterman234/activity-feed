// Writes channels/channel_members/messages through the server route, which
// inserts directly into Postgres (the source of truth). Do not use the
// electric-circuits client's write() for these tables — see
// src/app/api/channels/write/route.ts for why.
export async function writeChannelRow(
  table: "channels" | "channel_members" | "messages" | "thread_plans" | "thread_workflow_steps" | "thread_artifacts" | "thread_meta" | "thread_promotions" | "channel_read_state",
  row: Record<string, unknown>
) {
  const res = await fetch("/api/channels/write", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ table, row }),
  });
  if (!res.ok) throw new Error(`writeChannelRow ${table} failed: ${res.status}`);
  return res.json();
}

/** Advance the viewer's channel read cursor (true unread). */
export async function markChannelRead(channelId: string, viewerId = "you") {
  return writeChannelRow("channel_read_state", {
    viewer_id: viewerId,
    channel_id: channelId,
    last_read_at: new Date().toISOString(),
  });
}
