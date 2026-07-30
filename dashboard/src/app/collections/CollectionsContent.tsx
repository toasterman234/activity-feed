"use client";

import { useState, useMemo } from "react";
import type { Collection } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import type { ShapeMaterialization } from "@electric-circuits/client";
import { writeRow, deleteRow } from "../writeRow";

// ── types ──────────────────────────────────────────────────────────

interface CollectionRow {
  id: string; name: string; kind: string; description: string; created_at: string;
}
interface JudgmentRow {
  id: string; activity_id: number; span_start: string; span_end: string;
  verdict: string; comment: string; collection_id: string; created_at: string;
}
interface ActivityRow {
  id: string; source: string; type: string; summary: string; detail: string; created_at: string;
}

const KIND_LABELS: Record<string, string> = {
  eval: "Eval", dataset: "Dataset", regression: "Regression", watchlist: "Watchlist",
};

function relativeTime(iso: string): string {
  const d = Date.now() - Date.parse(iso); if (isNaN(d)) return iso;
  const s = Math.floor(d / 1000); if (s < 60) return "now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const dy = Math.floor(h / 24); if (dy < 7) return `${dy}d`;
  return new Date(Date.parse(iso)).toLocaleDateString();
}

// ── data ───────────────────────────────────────────────────────────

function useCollectionRows(m: ShapeMaterialization) {
  const coll = m.collection as Collection<CollectionRow, string>;
  const { data } = useLiveQuery(
    (q) => q.from({ c: coll }).select(({ c }) => ({
      id: c.id, name: c.name, kind: c.kind, description: c.description, created_at: c.created_at,
    })),
    [coll],
  );
  return (data as CollectionRow[]);
}

function useJudgmentRows(m: ShapeMaterialization) {
  const coll = m.collection as Collection<JudgmentRow, string>;
  const { data } = useLiveQuery(
    (q) => q.from({ j: coll }).select(({ j }) => ({
      id: j.id, activity_id: j.activity_id, span_start: j.span_start, span_end: j.span_end,
      verdict: j.verdict, comment: j.comment, collection_id: j.collection_id, created_at: j.created_at,
    })),
    [coll],
  );
  return (data as JudgmentRow[]);
}

function useActivityRows(m: ShapeMaterialization) {
  const coll = m.collection as Collection<ActivityRow, string>;
  const { data } = useLiveQuery(
    (q) => q.from({ a: coll }).select(({ a }) => ({
      id: a.id, source: a.source, type: a.type, summary: a.summary, detail: a.detail, created_at: a.created_at,
    })),
    [coll],
  );
  return (data as ActivityRow[]);
}

function VICT_EMOJI(v: string) {
  return v === "good" ? "👍" : v === "bad" ? "👎" : v === "golden" ? "⭐" : v === "bug" ? "🐛" : "✂️";
}

// Manual / inbox-style buckets get edit+delete. Bulk eval imports stay read-only.
function isEditableCollection(c: { id: string; kind: string }) {
  return c.id === "inbox" || c.kind === "dataset";
}

// ── content ────────────────────────────────────────────────────────

export function CollectionsContent({
  collShape, jdgShape, actShape,
}: {
  collShape: ShapeMaterialization; jdgShape: ShapeMaterialization; actShape: ShapeMaterialization;
}) {
  const collections = useCollectionRows(collShape);
  const judgments = useJudgmentRows(jdgShape);
  const activities = useActivityRows(actShape);
  const [expand, setExpand] = useState<string | null>(null);
  const [sort, setSort] = useState<"name" | "recent" | "count">("recent");
  const [runResult, setRunResult] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const runEval = async (collectionId: string, collectionName: string, kind: string) => {
    setRunning(collectionId);
    setRunResult(null);
    try {
      const res = await fetch("/api/run-eval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection_id: collectionId, collection_name: collectionName, kind, run: true }),
      });
      const data = await res.json();
      if (data.results) {
        setRunResult(data.results.summary);
      } else {
        setRunResult(`Exported ${data.exported} case${data.exported !== 1 ? "s" : ""}`);
      }
    } catch (e) {
      setRunResult(`Error: ${String(e)}`);
    } finally {
      setRunning(null);
    }
  };

  const saveNote = async (j: JudgmentRow) => {
    setBusyId(j.id);
    setActionError(null);
    try {
      await writeRow("judgments", {
        id: j.id,
        activity_id: Number(j.activity_id),
        span_start: j.span_start ?? "",
        span_end: j.span_end ?? "",
        verdict: j.verdict,
        comment: editNote,
        collection_id: j.collection_id || "inbox",
        created_at: j.created_at,
      });
      setEditingId(null);
    } catch (e) {
      setActionError(`Save note failed: ${String(e)}`);
    } finally {
      setBusyId(null);
    }
  };

  const removeJudgment = async (j: JudgmentRow) => {
    if (!confirm("Delete this annotation?")) return;
    setBusyId(j.id);
    setActionError(null);
    try {
      await deleteRow("judgments", j.id);
      if (editingId === j.id) setEditingId(null);
    } catch (e) {
      setActionError(`Delete failed: ${String(e)}`);
    } finally {
      setBusyId(null);
    }
  };

  const judgmentMap = useMemo(() => {
    const m: Record<string, JudgmentRow[]> = {};
    for (const j of judgments) {
      const cid = j.collection_id || "inbox";
      (m[cid] ??= []).push(j);
    }
    return m;
  }, [judgments]);

  const activityMap = useMemo(() => {
    const m: Record<number, ActivityRow> = {};
    for (const a of activities) m[Number(a.id)] = a;
    return m;
  }, [activities]);

  const sorted = useMemo(() => {
    const byId = new Map(collections.map(c => [c.id, c]));
    // Judgments can land in a collection_id before/without a collections row
    // (or after a ghost delete). Surface those buckets too so saves aren't invisible.
    for (const cid of Object.keys(judgmentMap)) {
      if (!byId.has(cid)) {
        byId.set(cid, {
          id: cid,
          name: cid,
          kind: "dataset",
          description: "",
          created_at: judgmentMap[cid][0]?.created_at ?? new Date(0).toISOString(),
        });
      }
    }
    const cs = [...byId.values()].map(c => ({
      ...c,
      count: judgmentMap[c.id]?.length ?? 0,
      latest: judgmentMap[c.id]?.slice(-1)[0]?.created_at ?? c.created_at,
    }));
    if (sort === "name") cs.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "count") cs.sort((a, b) => b.count - a.count);
    else cs.sort((a, b) => b.latest.localeCompare(a.latest));
    return cs;
  }, [collections, judgmentMap, sort]);

  return (
    <div className="mx-auto max-w-5xl px-3 py-2">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] text-zinc-400">{sorted.length} bucket{sorted.length !== 1 ? "s" : ""} · {judgments.length} judgment{judgments.length !== 1 ? "s" : ""}</p>
        <select value={sort} onChange={e => setSort(e.target.value as "name" | "recent" | "count")}
          className="rounded-md border border-zinc-200 bg-card px-2 py-1 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
          <option value="recent">Recent</option>
          <option value="count">Most judged</option>
          <option value="name">A–Z</option>
        </select>
      </div>

      {actionError && (
        <p className="mb-2 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{actionError}</p>
      )}

      {sorted.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-sm text-zinc-400 mb-2">No collections yet</p>
          <p className="text-xs text-zinc-400">Judge some activities from the feed and they&apos;ll appear here.</p>
        </div>
      )}

      <div className="space-y-1.5">
        {sorted.map(c => {
          const js = judgmentMap[c.id] || [];
          const open = expand === c.id;
          const editable = isEditableCollection(c);
          return (
            <div key={c.id} className="rounded-lg border border-zinc-200 bg-card dark:border-zinc-800 dark:bg-zinc-900">
              <div role="button" tabIndex={0}
                onClick={() => setExpand(open ? null : c.id)}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpand(open ? null : c.id); } }}
                className="w-full text-left px-3 py-2 flex items-center justify-between gap-2 cursor-pointer">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{c.name}</span>
                    <span className="shrink-0 rounded px-1 py-0 text-[9px] font-medium bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">{KIND_LABELS[c.kind] || c.kind}</span>
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-0.5">{js.length} judgment{js.length !== 1 ? "s" : ""} · updated {relativeTime(c.latest)}</p>
                  {c.description && <p className="text-xs text-zinc-400 mt-0.5 truncate">{c.description}</p>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {(c.kind === "eval" || c.kind === "regression") && js.length > 0 && (
                    <button onClick={e => { e.stopPropagation(); runEval(c.id, c.name, c.kind); }} title="Run eval"
                      disabled={running === c.id}
                      className="rounded px-1.5 py-0.5 text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                      {running === c.id ? "…" : "▶"}
                    </button>
                  )}
                  {js.length > 0 && (
                    <button onClick={e => {
                      e.stopPropagation();
                      const lines = js.map(j => {
                        const act = activityMap[j.activity_id];
                        return JSON.stringify({
                          id: j.id,
                          input: act?.summary ?? "",
                          output: act?.detail ?? "",
                          verdict: j.verdict,
                          comment: j.comment,
                          source_activity_id: j.activity_id,
                          bucket: c.name,
                        });
                      });
                      const blob = new Blob([lines.join("\n") + "\n"], { type: "application/jsonl" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url; a.download = `${c.name}.jsonl`;
                      a.click(); URL.revokeObjectURL(url);
                    }} title="Export JSONL"
                      className="rounded px-1.5 py-0.5 text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 border border-zinc-200 dark:border-zinc-700">↓</button>
                  )}
                  <span className="text-xs text-zinc-400">{open ? "▾" : "▸"}</span>
                </div>
              </div>

              {open && (
                <div className="border-t border-zinc-100 dark:border-zinc-800">
                  {runResult && (
                    <div className="px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-100 dark:border-zinc-800">{runResult}</div>
                  )}
                  {js.length === 0 ? (
                    <p className="px-3 py-4 text-center text-xs text-zinc-400">No judgments in this collection</p>
                  ) : (
                    <ul className="divide-y divide-zinc-50 dark:divide-zinc-800">
                      {[...js].reverse().map(j => {
                        const act = activityMap[j.activity_id];
                        const isEditing = editingId === j.id;
                        const busy = busyId === j.id;
                        return (
                          <li key={j.id} className="px-3 py-2">
                            <div className="flex items-start gap-2">
                              <span className="shrink-0 text-sm mt-px">{VICT_EMOJI(j.verdict)}</span>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs text-zinc-700 dark:text-zinc-300 truncate">
                                  {act ? `${act.source} · ${act.summary}` : `Activity #${j.activity_id}`}
                                </p>
                                {!isEditing && j.comment && (
                                  <p className="text-[10px] text-zinc-400 mt-0.5 whitespace-pre-wrap">{j.comment}</p>
                                )}
                                {isEditing && (
                                  <div className="mt-1.5 space-y-1.5">
                                    <textarea
                                      value={editNote}
                                      onChange={e => setEditNote(e.target.value)}
                                      rows={2}
                                      placeholder="Add a note…"
                                      autoFocus
                                      className="w-full rounded-md border border-zinc-200 bg-card px-2 py-1 text-xs text-zinc-800 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 resize-none"
                                    />
                                    <div className="flex justify-end gap-1.5">
                                      <button
                                        disabled={busy}
                                        onClick={() => setEditingId(null)}
                                        className="rounded px-2 py-0.5 text-[10px] text-zinc-400 hover:text-zinc-600"
                                      >Cancel</button>
                                      <button
                                        disabled={busy}
                                        onClick={() => void saveNote(j)}
                                        className="rounded px-2 py-0.5 text-[10px] font-medium bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-800 disabled:opacity-50"
                                      >{busy ? "…" : "Save note"}</button>
                                    </div>
                                  </div>
                                )}
                              </div>
                              <div className="shrink-0 flex flex-col items-end gap-1">
                                <span className="text-[10px] text-zinc-400">{relativeTime(j.created_at)}</span>
                                {editable && (
                                  <div className="flex items-center gap-1">
                                    <button
                                      disabled={busy}
                                      title={j.comment ? "Edit note" : "Add note"}
                                      onClick={() => { setEditingId(j.id); setEditNote(j.comment || ""); setActionError(null); }}
                                      className="rounded px-1.5 py-0.5 text-[10px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 border border-zinc-200 dark:border-zinc-700"
                                    >{j.comment ? "✎" : "+note"}</button>
                                    <button
                                      disabled={busy}
                                      title="Delete annotation"
                                      onClick={() => void removeJudgment(j)}
                                      className="rounded px-1.5 py-0.5 text-[10px] text-red-400 hover:text-red-600 border border-zinc-200 dark:border-zinc-700"
                                    >✕</button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
