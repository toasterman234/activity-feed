"use client";

import Link from "next/link";
import { useMemo } from "react";
import { StatusChip, Badge, cx, type UiTone } from "@/components/ui";
import {
  Kanban,
  KanbanBoard,
  KanbanColumn,
  KanbanColumnContent,
  KanbanItem,
  KanbanItemHandle,
  KanbanOverlay,
} from "@/components/reui/kanban";

export type HomeKanbanCard = {
  id: string;
  threadId: string;
  channelId: string;
  channelName: string;
  title: string;
  state: string;
  assignee: string | null;
  replyCount: number;
  lastAuthor: string | null;
  lastMessageAt: string | null;
  updatedAt: string | null;
};

const COLUMNS = [
  { id: "incoming", label: "Incoming", tone: "open" as UiTone },
  { id: "active", label: "Active", tone: "active" as UiTone },
  { id: "waiting", label: "Waiting", tone: "wait" as UiTone },
  { id: "done", label: "Done", tone: "good" as UiTone },
  { id: "dead", label: "Dead", tone: "neutral" as UiTone },
];

function stateToColumn(state: string | null): string {
  if (!state) return "incoming";
  const s = state.toLowerCase();
  if (s === "open" || s === "drafting" || s === "capture" || s === "drafted") return "incoming";
  if (s === "in_progress" || s === "running" || s === "triaged" || s === "searching" || s === "synthesizing" || s === "testing" || s === "resolve" || s === "resolving") return "active";
  if (s === "review" || s === "blocked" || s === "failed") return "waiting";
  if (s === "resolved" || s === "closed" || s === "shipped" || s === "verified" || s === "accepted" || s === "approved" || s === "complete") return "done";
  if (s === "wont_fix" || s === "rejected" || s === "archived") return "dead";
  return "incoming";
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - Date.parse(iso);
  if (Number.isNaN(diff)) return iso;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}

export function HomeKanbanBoard({ cards }: { cards: HomeKanbanCard[] }) {
  const columns = useMemo(() => {
    const cols: Record<string, HomeKanbanCard[]> = {};
    for (const c of COLUMNS) cols[c.id] = [];
    for (const card of cards) {
      const col = stateToColumn(card.state);
      if (!cols[col]) cols[col] = [];
      cols[col].push(card);
    }
    // Sort each column: most recent lastMessageAt first
    for (const col of Object.keys(cols)) {
      cols[col].sort((a, b) =>
        (b.lastMessageAt || b.updatedAt || "").localeCompare(a.lastMessageAt || a.updatedAt || ""),
      );
    }
    return cols;
  }, [cards]);

  return (
    <div className="space-y-2">
      <Kanban
        value={columns}
        onValueChange={() => {}}
        getItemValue={(item) => item.id}
      >
        <KanbanBoard className="flex gap-2 overflow-x-auto pb-2">
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.id}
              value={col.id}
              disabled
              className="flex w-56 shrink-0 flex-col rounded-xl border border-border bg-muted/30"
            >
              <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <StatusChip tone={col.tone}>{col.label}</StatusChip>
                  <Badge variant="secondary" className="text-[10px]">
                    {(columns[col.id] || []).length}
                  </Badge>
                </div>
              </div>
              <KanbanColumnContent value={col.id} className="flex min-h-20 flex-col gap-2 p-2">
                {(columns[col.id] || []).map((card) => (
                  <KanbanItem key={card.id} value={card.id} className="rounded-lg">
                    <KanbanItemHandle className="block w-full rounded-lg border border-border bg-card p-2.5 text-left shadow-sm select-none">
                      <Link
                        href={`/channels/${card.channelId}/${card.threadId}`}
                        className="block"
                      >
                        <p className="text-xs font-medium leading-snug text-foreground line-clamp-2">
                          {card.title}
                        </p>
                        <p className="mt-1 truncate text-[10px] text-muted-foreground">
                          # {card.channelName}
                          {card.assignee ? ` · @${card.assignee}` : ""}
                          {card.replyCount > 0 ? ` · ${card.replyCount} repl${card.replyCount === 1 ? "y" : "ies"}` : ""}
                          {" · "}
                          {relativeTime(card.lastMessageAt || card.updatedAt)}
                        </p>
                      </Link>
                    </KanbanItemHandle>
                  </KanbanItem>
                ))}
              </KanbanColumnContent>
            </KanbanColumn>
          ))}
        </KanbanBoard>
        <KanbanOverlay>
          {({ value }) => (
            <div className="w-56 rounded-lg border border-border bg-card p-2.5 shadow-lg">
              <p className="text-xs font-medium">{(columns[String(value)] || [])[0]?.title}</p>
            </div>
          )}
        </KanbanOverlay>
      </Kanban>
      <p className="px-1 text-[10px] text-muted-foreground">
        View-only board across all channels. Drag is disabled (use per-channel boards to move cards).
      </p>
    </div>
  );
}
