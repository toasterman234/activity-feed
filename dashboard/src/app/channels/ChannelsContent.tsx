"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useChannelRows, relativeTime } from "./shapes";
import type { ShapeMaterialization } from "@electric-circuits/client";
import { writeChannelRow } from "../writeChannelRow";
import {
  LIFECYCLES,
  DEFAULT_LIFECYCLE,
  registerLifecycleDefinition,
  type Lifecycle,
} from "./lifecycles";

function uuid(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

type ChannelPulse = {
  author: string;
  snippet: string;
  createdAt: string;
};

type ChannelActivity = {
  channelId: string;
  unreadCount: number;
  states: { start: number; active: number; wait: number; proven: number };
  lastPulse: ChannelPulse | null;
};

const ACTIVITY_POLL_MS = 4000;

const STATE_CHIPS: { key: keyof ChannelActivity["states"]; label: string }[] = [
  { key: "wait", label: "wait" },
  { key: "active", label: "active" },
  { key: "start", label: "open" },
  { key: "proven", label: "proven" },
];

function useChannelActivity(pollMs = ACTIVITY_POLL_MS): Record<string, ChannelActivity> {
  const [byId, setById] = useState<Record<string, ChannelActivity>>({});

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch("/api/channels/activity?viewer=you");
        if (!res.ok || !active) return;
        const data = await res.json() as { channels?: ChannelActivity[] };
        const next: Record<string, ChannelActivity> = {};
        for (const c of data.channels || []) next[c.channelId] = c;
        if (active) setById(next);
      } catch {
        /* transient — keep last */
      }
    };
    void poll();
    const id = setInterval(() => { if (!document.hidden) void poll(); }, pollMs);
    return () => { active = false; clearInterval(id); };
  }, [pollMs]);

  return byId;
}

export function ChannelsContent({
  channelShape,
}: {
  channelShape: ShapeMaterialization;
}) {
  const channels = useChannelRows(channelShape);
  const activity = useChannelActivity();
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelLifecycle, setNewChannelLifecycle] = useState(DEFAULT_LIFECYCLE);
  const [creating, setCreating] = useState(false);
  const [, setRegistryReady] = useState(false);

  useEffect(() => {
    fetch("/api/workflows", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { templates?: Array<{ templateId: string; definition: Lifecycle }> }) => {
        for (const template of data.templates || []) {
          registerLifecycleDefinition(template.templateId, template.definition);
        }
        setRegistryReady(true);
      })
      .catch(() => setRegistryReady(true));
  }, []);

  const sortedChannels = useMemo(() => {
    return [...channels].sort((a, b) => {
      const aa = activity[a.id];
      const ba = activity[b.id];
      const aUnread = aa?.unreadCount ?? 0;
      const bUnread = ba?.unreadCount ?? 0;
      if (aUnread !== bUnread) return bUnread - aUnread;
      const aAtt = (aa?.states.wait ?? 0) + (aa?.states.active ?? 0);
      const bAtt = (ba?.states.wait ?? 0) + (ba?.states.active ?? 0);
      if (aAtt !== bAtt) return bAtt - aAtt;
      const aPulse = aa?.lastPulse?.createdAt ?? "";
      const bPulse = ba?.lastPulse?.createdAt ?? "";
      if (aPulse !== bPulse) return bPulse.localeCompare(aPulse);
      return a.name.localeCompare(b.name);
    });
  }, [channels, activity]);

  const createChannel = async () => {
    const name = newChannelName.trim();
    if (!name || creating) return;
    setCreating(true);
    const id = uuid();
    try {
      await writeChannelRow("channels", {
        id, name, description: "", default_lifecycle: newChannelLifecycle, created_at: new Date().toISOString(),
      } as Record<string, unknown>);
      setNewChannelName("");
      setNewChannelLifecycle(DEFAULT_LIFECYCLE);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-3 py-2 flex flex-col gap-2">
      <div className="flex gap-1">
        <input
          value={newChannelName}
          onChange={(e) => setNewChannelName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") createChannel(); }}
          placeholder="New channel…"
          className="min-w-0 flex-1 rounded-md border border-zinc-200 bg-white px-2 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 md:py-1 md:text-xs"
        />
        <select
          value={newChannelLifecycle}
          onChange={(e) => setNewChannelLifecycle(e.target.value)}
          className="shrink-0 rounded-md border border-zinc-200 bg-white px-2 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 md:py-1 md:text-xs"
        >
          {Object.entries(LIFECYCLES).map(([key, lc]) => (
            <option key={key} value={key}>{lc.label}</option>
          ))}
        </select>
        <button
          onClick={createChannel}
          disabled={!newChannelName.trim() || creating}
          className="shrink-0 rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:text-zinc-900 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400 md:py-1 md:text-xs"
        >
          +
        </button>
        <Link
          href="/ops/config?tab=workflows"
          title="Workflow registry"
          className="shrink-0 rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-500 hover:text-zinc-900 dark:border-zinc-700 md:py-1 md:text-xs"
        >
          Flows
        </Link>
      </div>
      <div className="space-y-0.5">
        {sortedChannels.length === 0 && (
          <p className="px-1 py-4 text-center text-xs text-zinc-400">No channels yet</p>
        )}
        {sortedChannels.map((c) => {
          const act = activity[c.id];
          const unread = act?.unreadCount ?? 0;
          const pulse = act?.lastPulse;
          return (
            <Link
              key={c.id}
              href={`/channels/${c.id}`}
              className={`flex w-full items-start gap-2 rounded-md px-2 py-2.5 text-left text-sm md:py-1.5 md:text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                unread > 0
                  ? "text-zinc-800 dark:text-zinc-100"
                  : "text-zinc-600 dark:text-zinc-400"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`truncate ${unread > 0 ? "font-semibold" : ""}`}>
                    # {c.name}
                  </span>
                  {c.default_lifecycle && c.default_lifecycle !== "coding" && (
                    <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-400 dark:bg-zinc-800">
                      {LIFECYCLES[c.default_lifecycle]?.label || c.default_lifecycle}
                    </span>
                  )}
                </div>
                {pulse ? (
                  <p className="mt-0.5 truncate text-[10px] text-zinc-400">
                    <span className="text-zinc-500 dark:text-zinc-400">{pulse.author}</span>
                    {" · "}
                    {pulse.snippet || "(no text)"}
                    {" · "}
                    {relativeTime(pulse.createdAt)}
                  </p>
                ) : (
                  <p className="mt-0.5 text-[10px] text-zinc-400">No messages yet</p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
                <div className="flex flex-wrap justify-end gap-1">
                  {act && STATE_CHIPS.map(({ key, label }) => {
                    const n = act.states[key];
                    if (!n) return null;
                    return (
                      <span
                        key={key}
                        className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] tabular-nums text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                      >
                        {label} {n}
                      </span>
                    );
                  })}
                  {unread > 0 && (
                    <span className="rounded-md bg-zinc-800 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white dark:bg-zinc-200 dark:text-zinc-900">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
