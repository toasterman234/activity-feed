"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Kanban,
  KanbanBoard,
  KanbanColumn,
  KanbanColumnContent,
  KanbanItem,
  KanbanItemHandle,
  KanbanOverlay,
  type KanbanCommitMeta,
} from "@/components/reui/kanban";
import { Badge, StatusChip, cx, type UiTone } from "@/components/ui";
import { LIFECYCLES } from "./lifecycles";
import { relativeTime, type MessageRow, type ThreadMetaRow } from "./shapes";

export type ChannelKanbanCard = {
  id: string;
  title: string;
  state: string;
  author: string;
  assignee: string | null;
  replies: number;
  createdAt: string;
  lastActivityAt: string;
};

function stateTone(state: string): UiTone {
  const s = state.toLowerCase();
  if (s === "in_progress" || s === "running" || s === "drafting" || s === "searching" || s === "synthesizing" || s === "testing") {
    return "active";
  }
  if (s === "review" || s === "triaged") return "wait";
  if (s === "blocked" || s === "failed" || s === "rejected" || s === "wont_fix") return "danger";
  if (s === "resolved" || s === "verified" || s === "accepted" || s === "closed") return "good";
  return "open";
}

function buildColumns(
  lifecycleKey: string,
  cards: ChannelKanbanCard[],
): Record<string, ChannelKanbanCard[]> {
  const lc = LIFECYCLES[lifecycleKey] || LIFECYCLES.coding;
  const columns: Record<string, ChannelKanbanCard[]> = {};
  for (const stateId of Object.keys(lc.states)) {
    columns[stateId] = [];
  }
  // Catch-all for unknown / missing meta states
  if (!columns.open && !columns.drafted) {
    columns._other = [];
  }
  for (const card of cards) {
    const key = columns[card.state] ? card.state : (columns._other ? "_other" : Object.keys(columns)[0]);
    if (!columns[key]) columns[key] = [];
    columns[key].push(card);
  }
  for (const key of Object.keys(columns)) {
    columns[key].sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
  }
  return columns;
}

export function buildKanbanCards(opts: {
  roots: MessageRow[];
  channelMessages: MessageRow[];
  metaByThread: Record<string, ThreadMetaRow>;
  defaultLifecycle: string;
}): ChannelKanbanCard[] {
  const { roots, channelMessages, metaByThread, defaultLifecycle } = opts;
  return roots
    .filter((msg) => !metaByThread[msg.id]?.archived_at)
    .map((msg) => {
      const meta = metaByThread[msg.id];
      const replies = channelMessages.filter((m) => m.thread_id === msg.id);
      const last = [...replies].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      return {
        id: msg.id,
        title: msg.body ? msg.body.slice(0, 80) : "(no title)",
        state: meta?.state || LIFECYCLES[defaultLifecycle]?.initial || "open",
        author: msg.author,
        assignee: meta?.assignee || null,
        replies: replies.length,
        createdAt: msg.created_at,
        lastActivityAt: last?.created_at || msg.created_at,
      };
    });
}

export function ChannelKanbanBoard({
  channelId,
  lifecycleKey,
  cards,
  onTransitioned,
}: {
  channelId: string;
  lifecycleKey: string;
  cards: ChannelKanbanCard[];
  onTransitioned?: () => void;
}) {
  const lc = LIFECYCLES[lifecycleKey] || LIFECYCLES.coding;
  const [columns, setColumns] = useState(() => buildColumns(lifecycleKey, cards));
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    setColumns(buildColumns(lifecycleKey, cards));
  }, [lifecycleKey, cards]);

  const columnIds = useMemo(() => Object.keys(columns), [columns]);

  const persistMove = useCallback(
    async (next: Record<string, ChannelKanbanCard[]>, meta: KanbanCommitMeta<ChannelKanbanCard>) => {
      if (meta.kind !== "item") {
        // Column reorder is visual-only for now.
        return;
      }
      if (meta.activeContainer === meta.overContainer) {
        // Same-column reorder — no server state to update.
        return;
      }

      const moved = next[meta.overContainer]?.[meta.overIndex];
      if (!moved) return;

      const from = meta.activeContainer;
      const to = meta.overContainer;
      const allowed = lc.transitions[from] || [];
      if (!allowed.includes(to)) {
        setError(`Can't move from ${lc.states[from]?.label || from} → ${lc.states[to]?.label || to}`);
        setColumns(meta.previousValue);
        return;
      }

      setBusyId(moved.id);
      setError(null);
      try {
        const res = await fetch("/api/channels/transition", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            threadId: moved.id,
            channelId,
            toState: to,
            actor: "you (board)",
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) {
          setError(data.error || data.detail || `Transition failed (${res.status})`);
          setColumns(meta.previousValue);
          return;
        }
        onTransitioned?.();
      } catch (e) {
        setError(String(e));
        setColumns(meta.previousValue);
      } finally {
        setBusyId(null);
      }
    },
    [channelId, lc, onTransitioned],
  );

  return (
    <div className="space-y-2">
      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
          {error}
        </p>
      )}
      <Kanban
        value={columns}
        onValueChange={setColumns}
        getItemValue={(item) => item.id}
        onValueCommit={(value, meta) => {
          void persistMove(value, meta);
        }}
        className="w-full"
      >
        <KanbanBoard className="flex gap-2 overflow-x-auto pb-2">
          {columnIds.map((columnId) => {
            const stateDef = lc.states[columnId];
            const label = columnId === "_other" ? "Other" : stateDef?.label || columnId;
            const items = columns[columnId] || [];
            return (
              <KanbanColumn
                key={columnId}
                value={columnId}
                className="flex w-64 shrink-0 flex-col rounded-xl border border-border bg-muted/30"
              >
                <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <StatusChip tone={stateTone(columnId)}>{label}</StatusChip>
                    <Badge variant="secondary" className="text-[10px]">{items.length}</Badge>
                  </div>
                </div>
                <KanbanColumnContent value={columnId} className="flex min-h-24 flex-col gap-2 p-2">
                  {items.map((card) => (
                    <KanbanItem key={card.id} value={card.id} className="rounded-lg">
                      <KanbanItemHandle
                        className={cx(
                          "block w-full cursor-grab rounded-lg border border-border bg-card p-2.5 text-left shadow-sm active:cursor-grabbing",
                          busyId === card.id && "opacity-50",
                        )}
                      >
                        <Link
                          href={`/channels/${channelId}/${card.id}`}
                          className="block"
                          onClick={(e) => {
                            // Allow drag; only navigate on plain click without drag intent.
                            if (busyId) e.preventDefault();
                          }}
                        >
                          <p className="text-xs font-medium leading-snug text-foreground line-clamp-3">
                            {card.title}
                          </p>
                          <p className="mt-1 truncate text-[10px] text-muted-foreground">
                            {card.author}
                            {card.assignee ? ` · @${card.assignee}` : ""}
                            {" · "}
                            {card.replies} repl{card.replies === 1 ? "y" : "ies"}
                            {" · "}
                            {relativeTime(card.lastActivityAt)}
                          </p>
                        </Link>
                      </KanbanItemHandle>
                    </KanbanItem>
                  ))}
                </KanbanColumnContent>
              </KanbanColumn>
            );
          })}
        </KanbanBoard>
        <KanbanOverlay>
          {({ value, variant }) => {
            if (variant === "column") {
              return (
                <div className="w-64 rounded-xl border border-border bg-card p-3 text-xs font-medium shadow-lg">
                  {lc.states[String(value)]?.label || String(value)}
                </div>
              );
            }
            // Find card across columns
            let card: ChannelKanbanCard | undefined;
            for (const list of Object.values(columns)) {
              card = list.find((c) => c.id === String(value));
              if (card) break;
            }
            if (!card) return null;
            return (
              <div className="w-64 rounded-lg border border-border bg-card p-2.5 shadow-lg">
                <p className="text-xs font-medium line-clamp-3">{card.title}</p>
              </div>
            );
          }}
        </KanbanOverlay>
      </Kanban>
      <p className="px-1 text-[10px] text-muted-foreground">
        Drag cards between columns to change stage. Illegal moves are blocked by the lifecycle.
      </p>
    </div>
  );
}
