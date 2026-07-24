"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import type { Collection } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import type { ShapeMaterialization } from "@electric-circuits/client";
import { client, ACTIVITY_LOG_SHAPE } from "./electric";

// ── types ──────────────────────────────────────────────────────────

interface ActivityRow {
  id: string;
  source: string;
  type: string;
  summary: string;
  detail: string;
  created_at: string;
}

type TabId = "all" | "files" | "agents" | "projects" | "memory";

const SOURCES = ["file-watcher", "git", "claude-code", "pi", "setup"] as const;

const SOURCE_LABELS: Record<string, string> = {
  "file-watcher": "FW",
  git: "GIT",
  "claude-code": "CC",
  pi: "PI",
  setup: "·",
};

const SOURCE_COLORS: Record<string, string> = {
  "file-watcher": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  git: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  "claude-code": "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  pi: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  setup: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400",
};

// ── helpers ────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = Date.parse(iso);
  if (isNaN(then)) return iso;
  const diff = now - then;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(then).toLocaleDateString();
}

function parseDetail(detail: string): Record<string, unknown> | null {
  if (!detail) return null;
  try { return JSON.parse(detail); } catch { return null; }
}

// ── data layer ─────────────────────────────────────────────────────

let shapeCache: Promise<ShapeMaterialization> | null = null;
function getActivityShape(): Promise<ShapeMaterialization> {
  if (!shapeCache) shapeCache = client.shape(ACTIVITY_LOG_SHAPE);
  return shapeCache;
}

function useActivityRows(mat: ShapeMaterialization): ActivityRow[] {
  const coll = mat.collection as Collection<ActivityRow, string>;
  const { data } = useLiveQuery(
    (q) => q.from({ a: coll }).select(({ a }) => ({
      id: a.id, source: a.source, type: a.type,
      summary: a.summary, detail: a.detail, created_at: a.created_at,
    })),
    [coll],
  );
  return (data as ActivityRow[]);
}

// ── main page ──────────────────────────────────────────────────────

export default function Home() {
  const [shape, setShape] = useState<ShapeMaterialization | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setErr(null);
    const stall = setTimeout(() => {
      if (!cancelled) setErr("Timed out waiting for electric-circuits.");
    }, 12000);
    getActivityShape()
      .then((s) => { if (!cancelled) { clearTimeout(stall); setShape(s); } })
      .catch((e) => {
        if (!cancelled) {
          clearTimeout(stall);
          setErr(`shape() failed: ${(e as Error)?.message ?? String(e)}`);
        }
      });
    return () => { cancelled = true; clearTimeout(stall); };
  }, []);

  if (!shape) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <p className="text-sm text-zinc-400">
          {err ? `Failed: ${err}` : "Connecting to electric-circuits…"}
        </p>
      </div>
    );
  }

  return <Feed shape={shape} />;
}

// ── feed component ─────────────────────────────────────────────────

function Feed({ shape }: { shape: ShapeMaterialization }) {
  const rows = useActivityRows(shape);

  const [tab, setTab] = useState<TabId>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "source">("newest");
  const [enabledSources, setEnabledSources] = useState<Set<string>>(new Set(SOURCES));
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [projectSearch, setProjectSearch] = useState("");
  const [memorySearch, setMemorySearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    if (menuOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const toggleSource = (s: string) => {
    setEnabledSources((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const tabSourceMap: Record<TabId, string[]> = {
    all: SOURCES as unknown as string[],
    files: ["file-watcher"], agents: ["claude-code", "pi"],
    projects: SOURCES as unknown as string[], memory: ["claude-code"],
  };
  const activeSourcesForTab = useMemo(() => new Set(tabSourceMap[tab]), [tab]);

  const enrichedRows = useMemo(
    () => rows.map((r) => {
      const d = parseDetail(r.detail);
      return { ...r, project: (d?.project as string) || "", session_id: (d?.session_id as string) || "", tool: (d?.tool as string) || "" };
    }),
    [rows],
  );

  // ── projects tab data ──────────────────────────────────────────

  const projectList = useMemo(() => {
    const s = new Set<string>();
    for (const r of enrichedRows) if (r.project) s.add(r.project);
    return [...s].sort();
  }, [enrichedRows]);

  const visibleProjects = useMemo(() => {
    const q = projectSearch.toLowerCase().trim();
    return q ? projectList.filter((p) => p.toLowerCase().includes(q)) : projectList;
  }, [projectList, projectSearch]);

  const projectGroups = useMemo(() => {
    const q = search.toLowerCase().trim();
    const groups: Record<string, (typeof enrichedRows)[number][]> = {};
    for (const r of enrichedRows) {
      if (!r.project || !visibleProjects.includes(r.project)) continue;
      if (!enabledSources.has(r.source)) continue;
      if (q && !r.summary.toLowerCase().includes(q)) continue;
      if (!groups[r.project]) groups[r.project] = [];
      groups[r.project].push(r);
    }
    const sorted = Object.entries(groups).sort((a, b) =>
      (b[1][0]?.created_at || "").localeCompare(a[1][0]?.created_at || ""));
    for (const [, evts] of sorted) evts.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return sorted;
  }, [enrichedRows, visibleProjects, enabledSources, search]);

  // ── memory tab data ────────────────────────────────────────────

  const memorySessions = useMemo(() => {
    const sessions: Record<string, { rows: (typeof enrichedRows)[number][]; project?: string; toolCounts: Record<string, number> }> = {};
    for (const r of enrichedRows) {
      if (r.source !== "claude-code") continue;
      const sid = r.session_id || `no-session-${r.id}`;
      if (!sessions[sid]) sessions[sid] = { rows: [], toolCounts: {} };
      sessions[sid].rows.push(r);
      if (r.project) sessions[sid].project = r.project;
      if (r.tool) sessions[sid].toolCounts[r.tool] = (sessions[sid].toolCounts[r.tool] || 0) + 1;
    }
    for (const s of Object.values(sessions)) s.rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
    const q = memorySearch.toLowerCase().trim();
    return Object.entries(sessions)
      .filter(([, s]) => {
        if (!q) return true;
        return s.rows.some((r) => r.summary.toLowerCase().includes(q) || (s.project && s.project.toLowerCase().includes(q)));
      })
      .sort((a, b) => (b[1].rows[0]?.created_at || "").localeCompare(a[1].rows[0]?.created_at || ""));
  }, [enrichedRows, memorySearch]);

  // ── flat list ──────────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (tab === "projects" || tab === "memory") return [];
    const q = search.toLowerCase().trim();
    return enrichedRows
      .filter((r) => activeSourcesForTab.has(r.source) && enabledSources.has(r.source))
      .filter((r) => q === "" ? true : r.summary.toLowerCase().includes(q) || (r.detail && r.detail.toLowerCase().includes(q)))
      .sort((a, b) => {
        switch (sort) {
          case "newest": return b.created_at.localeCompare(a.created_at);
          case "oldest": return a.created_at.localeCompare(b.created_at);
          case "source": return a.source.localeCompare(b.source) || b.created_at.localeCompare(a.created_at);
          default: return 0;
        }
      });
  }, [enrichedRows, activeSourcesForTab, enabledSources, search, sort, tab]);

  // ── tab counts ─────────────────────────────────────────────────

  const tabCounts = useMemo(() => {
    const c: Record<TabId, number> = { all: 0, files: 0, agents: 0, projects: 0, memory: 0 };
    for (const r of rows) {
      c.all++;
      if (tabSourceMap.files.includes(r.source)) c.files++;
      if (tabSourceMap.agents.includes(r.source)) c.agents++;
      c.projects++;
      if (r.source === "claude-code") c.memory++;
    }
    return c;
  }, [rows, tabSourceMap]);

  const visibleCount =
    tab === "projects" ? projectGroups.reduce((s, [, e]) => s + e.length, 0) :
    tab === "memory" ? memorySessions.reduce((s, [, se]) => s + se.rows.length, 0) :
    filtered.length;

  // current search value (switches per tab)
  const currentSearch = tab === "memory" ? memorySearch : tab === "projects" ? projectSearch : search;
  const setCurrentSearch = tab === "memory" ? setMemorySearch : tab === "projects" ? setProjectSearch : setSearch;
  const searchPlaceholder = tab === "memory" ? "Search sessions…" : tab === "projects" ? "Filter projects…" : "Search…";

  // ── render ─────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      {/* compact sticky header: all in one row */}
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
        <div className="mx-auto max-w-5xl px-4 py-2 flex items-center gap-3">
          {/* title + live indicator */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Activity</span>
            <span className="flex items-center gap-1 text-[10px] text-zinc-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />{visibleCount}
            </span>
          </div>

          {/* tabs */}
          <div className="flex gap-0.5 overflow-x-auto no-scrollbar">
            {(["all","files","agents","projects","memory"] as TabId[]).map((id) => (
              <button key={id} onClick={() => setTab(id)}
                className={`shrink-0 px-2.5 py-1 text-[12px] font-medium rounded-md transition-colors ${
                  tab === id
                    ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                    : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                }`}>
                {id.charAt(0).toUpperCase() + id.slice(1)}
                <span className="ml-1 text-[10px] text-zinc-400 tabular-nums">{tabCounts[id]}</span>
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {/* search */}
          <input type="text" value={currentSearch}
            onChange={(e) => setCurrentSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-36 sm:w-48 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[12px] text-zinc-800 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200" />

          {/* menu button */}
          <div className="relative" ref={menuRef}>
            <button onClick={() => setMenuOpen(!menuOpen)}
              className={`rounded-lg border px-2 py-1 text-[12px] transition-colors ${
                menuOpen
                  ? "border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                  : "border-zinc-200 text-zinc-400 hover:text-zinc-600 dark:border-zinc-700 dark:hover:text-zinc-300"
              }`}>
              ⋯
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-52 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 space-y-3 z-20">
                {/* source toggles */}
                <div className="space-y-1">
                  <p className="text-[10px] text-zinc-400 uppercase tracking-wider">Sources</p>
                  <div className="flex flex-wrap gap-1">
                    {SOURCES.map((s) => (
                      <button key={s} onClick={() => toggleSource(s)}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                          enabledSources.has(s) ? SOURCE_COLORS[s] ?? "bg-zinc-100 text-zinc-700"
                            : "bg-zinc-100 text-zinc-300 line-through dark:bg-zinc-800 dark:text-zinc-600"}`}>
                        {SOURCE_LABELS[s] ?? s}
                      </button>
                    ))}
                  </div>
                </div>
                {/* sort */}
                <div className="space-y-1">
                  <p className="text-[10px] text-zinc-400 uppercase tracking-wider">Sort</p>
                  <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}
                    className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-[12px] text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    <option value="newest">↓ Newest</option>
                    <option value="oldest">↑ Oldest</option>
                    <option value="source">By source</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* content */}
      <div className="mx-auto max-w-5xl px-4 py-3">
        {/* ── MEMORY TAB ──────────────────────────────────────── */}
        {tab === "memory" && (
          <div className="space-y-2">
            {memorySessions.map(([sid, session]) => (
              <div key={sid} className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                <button onClick={() => toggleExpand(sid)}
                  className="w-full text-left px-3 py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-zinc-800 dark:text-zinc-200 truncate">
                      {session.project && <span className="mr-1.5 text-[10px] text-zinc-400 font-normal">{session.project}</span>}
                      {session.rows[0]?.summary || "session"}
                    </p>
                    <p className="text-[10px] text-zinc-400 mt-0.5">
                      {session.rows.length}e · {Object.entries(session.toolCounts).sort((a,b) => b[1]-a[1]).slice(0,3).map(([t,c]) => `${t}:${c}`).join(" · ")} · {relativeTime(session.rows[0]?.created_at || "")}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-zinc-400">{expanded.has(sid) ? "▾" : "▸"}</span>
                </button>
                {expanded.has(sid) && (
                  <ul className="border-t border-zinc-100 dark:border-zinc-800 divide-y divide-zinc-50 dark:divide-zinc-800">
                    {session.rows.map((row) => (
                      <li key={row.id} className="px-3 py-1.5 flex items-center gap-2 text-sm">
                        <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold leading-none ${SOURCE_COLORS[row.source] ?? "bg-zinc-100 text-zinc-700"}`}>{SOURCE_LABELS[row.source] ?? row.source}</span>
                        <span className="truncate text-[12px] text-zinc-700 dark:text-zinc-300 flex-1 min-w-0">{row.summary}</span>
                        <span className="shrink-0 text-[10px] text-zinc-400">{row.type.replace("claude.","")}</span>
                        <span className="shrink-0 text-[10px] text-zinc-400 w-12 text-right">{relativeTime(row.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {memorySessions.length === 0 && <p className="py-12 text-center text-[13px] text-zinc-400">No matching sessions</p>}
          </div>
        )}

        {/* ── PROJECTS TAB ────────────────────────────────────── */}
        {tab === "projects" && (
          <div className="space-y-2">
            {projectGroups.map(([project, evts]) => (
              <div key={project} className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-medium text-zinc-800 dark:text-zinc-200">{project}</p>
                    <p className="text-[10px] text-zinc-400">{evts.length}e · latest {relativeTime(evts[0]?.created_at || "")}</p>
                  </div>
                </div>
                <ul className="divide-y divide-zinc-50 dark:divide-zinc-800">
                  {evts.slice(0, expanded.has(project) ? evts.length : 4).map((row) => (
                    <li key={row.id} className="px-3 py-1.5 flex items-center gap-2 text-sm">
                      <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold leading-none ${SOURCE_COLORS[row.source] ?? "bg-zinc-100 text-zinc-700"}`}>{SOURCE_LABELS[row.source] ?? row.source}</span>
                      <span className="truncate text-[12px] text-zinc-700 dark:text-zinc-300 flex-1 min-w-0">{row.summary}</span>
                      <span className="shrink-0 text-[10px] text-zinc-400">{relativeTime(row.created_at)}</span>
                    </li>
                  ))}
                </ul>
                {evts.length > 4 && (
                  <button onClick={() => toggleExpand(project)}
                    className="w-full px-3 py-1.5 text-[10px] text-zinc-400 hover:text-zinc-600 text-center border-t border-zinc-50 dark:border-zinc-800">
                    {expanded.has(project) ? "collapse" : `show all ${evts.length} ▾`}
                  </button>
                )}
              </div>
            ))}
            {projectGroups.length === 0 && <p className="py-12 text-center text-[13px] text-zinc-400">No matching projects</p>}
          </div>
        )}

        {/* ── FLAT LIST (all / files / agents) ─────────────────── */}
        {tab !== "projects" && tab !== "memory" && (
          <ul className="flex flex-col gap-0.5">
            {filtered.map((row) => {
              const isExpanded = expanded.has(row.id);
              return (
                <li key={row.id}>
                  <button onClick={() => toggleExpand(row.id)}
                    className="w-full text-left rounded-lg border border-zinc-200 bg-white px-3 py-1.5 hover:bg-zinc-50 transition-colors dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/60">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold leading-none ${SOURCE_COLORS[row.source] ?? "bg-zinc-100 text-zinc-700"}`}>{SOURCE_LABELS[row.source] ?? row.source}</span>
                      <span className="truncate text-[12px] text-zinc-800 dark:text-zinc-200 flex-1 min-w-0">{row.summary}</span>
                      <span className="shrink-0 text-[10px] text-zinc-400">{relativeTime(row.created_at)}</span>
                    </div>
                    {isExpanded && (
                      <div className="mt-1.5 space-y-1 border-t border-zinc-100 pt-1.5 dark:border-zinc-800">
                        <div className="flex gap-2 text-[10px] text-zinc-500">
                          <span>{row.type}</span><span>{new Date(row.created_at).toLocaleString()}</span>
                        </div>
                        {row.detail && <p className="text-[11px] text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap break-words">{row.detail}</p>}
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 && <li className="py-12 text-center text-[13px] text-zinc-400">No matching events</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
