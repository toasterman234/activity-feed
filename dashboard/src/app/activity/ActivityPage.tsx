"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import type { Collection } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import type { ShapeMaterialization } from "@electric-circuits/client";
import { WindowVirtualizer } from "virtua";
import { client, ACTIVITY_LOG_SHAPE, COLLECTIONS_SHAPE, JUDGMENTS_SHAPE } from "../electric";
import { acquireShape, releaseShape } from "../shape-registry";
import { writeRow } from "../writeRow";
import { CollectionsContent } from "../collections/CollectionsContent";
import { measure } from "@/lib/perf";

const VERDICTS = [
  { emoji: "👍", label: "good" },
  { emoji: "👎", label: "bad" },
  { emoji: "⭐", label: "golden" },
  { emoji: "🐛", label: "bug" },
  { emoji: "✂️", label: "redundant" },
] as const;
type Verdict = (typeof VERDICTS)[number]["label"];

function uuid(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

// ── types ──────────────────────────────────────────────────────────

interface ActivityRow {
  id: string; source: string; type: string;
  summary: string; detail: string; created_at: string;
}

type TabId = "activity" | "projects" | "memory" | "collections";

const SOURCES = ["git", "claude-code", "pi", "setup"] as const;
const SOURCE_LABELS: Record<string, string> = {
  git: "GIT", "claude-code": "CC", pi: "PI", setup: "·",
};
const SOURCE_COLORS: Record<string, string> = {
  git: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  "claude-code": "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  pi: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  setup: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400",
};

// ── helpers ────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const d = Date.now() - Date.parse(iso); if (isNaN(d)) return iso;
  const s = Math.floor(d / 1000); if (s < 60) return "now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const dy = Math.floor(h / 24); if (dy < 7) return `${dy}d`;
  return new Date(Date.parse(iso)).toLocaleDateString();
}

function parseDetail(d: string): Record<string, unknown> | null {
  if (!d) return null; try { return JSON.parse(d); } catch { return null; }
}

const SOURCE_FULL: Record<string, string> = {
  git: "Git", "claude-code": "Claude Code", pi: "Pi", setup: "Setup",
};

function labelize(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fileBasename(f: string): string { return f.split("/").pop() || f; }
function fileExt(f: string): string {
  const base = fileBasename(f); const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(i + 1).toLowerCase() : "";
}
const EXT_DOT_COLORS: Record<string, string> = {
  ts: "bg-blue-400", tsx: "bg-blue-400", js: "bg-yellow-400", jsx: "bg-yellow-400",
  py: "bg-emerald-400", md: "bg-zinc-400", json: "bg-amber-400", css: "bg-pink-400",
  html: "bg-orange-400", yml: "bg-purple-400", yaml: "bg-purple-400", sh: "bg-teal-400",
  sql: "bg-cyan-400", rs: "bg-red-400", go: "bg-sky-400",
};
function extDotColor(ext: string): string { return EXT_DOT_COLORS[ext] ?? "bg-zinc-300 dark:bg-zinc-600"; }

function DetailValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") return <span className="text-zinc-400 italic">—</span>;
  if (typeof value === "object") return <pre className="whitespace-pre-wrap break-words text-[11px] leading-snug">{JSON.stringify(value, null, 2)}</pre>;
  return <span className="whitespace-pre-wrap break-words">{String(value)}</span>;
}

// ── data ───────────────────────────────────────────────────────────

function getShape(): Promise<ShapeMaterialization> {
  // Full activity_log is 20K+ rows / 30+MB — shaping the whole table made
  // the initial load hang (esp. over Tailscale WAN latency). Bound to the
  // most recent rows instead. Refcounted so leaving Activity frees the
  // long-poll (HTTP/1.1 only allows ~6 connections/origin).
  return acquireShape("activity-log", () =>
    fetch("/api/activity-log-cutoff")
      .then((r) => r.json())
      .then(({ cutoff, agentSince }) =>
        // Bound agents by AGENT_WINDOW_DAYS; drop claude.tool.use from the
        // agent branch (still arrives via the recent-id window). Tool-use
        // volume was drowning the initial snapshot for little feed value.
        client.shape({ ...ACTIVITY_LOG_SHAPE, where: { or: [
          { col: "id", op: "gt", value: cutoff },
          { and: [
            { col: "source", op: "eq", value: "claude-code" },
            { col: "created_at", op: "gt", value: agentSince ?? "" },
            { col: "type", op: "neq", value: "claude.tool.use" },
          ] },
          { and: [
            { col: "source", op: "eq", value: "pi" },
            { col: "created_at", op: "gt", value: agentSince ?? "" },
          ] },
        ] } })
      ),
  );
}

function getCollShape(): Promise<ShapeMaterialization> {
  return acquireShape("collections", () => client.shape(COLLECTIONS_SHAPE));
}

function getJdgShape(): Promise<ShapeMaterialization> {
  return acquireShape("judgments", () => client.shape(JUDGMENTS_SHAPE));
}

// Feeders can push many live-query updates in quick succession;
// throttle re-renders so the feed doesn't repaint on every single row.
function useThrottled<T>(value: T, delayMs: number): T {
  const [throttled, setThrottled] = useState(value);
  const lastRun = useRef(0);
  useEffect(() => {
    const now = Date.now();
    const wait = Math.max(0, delayMs - (now - lastRun.current));
    const t = setTimeout(() => { lastRun.current = Date.now(); setThrottled(value); }, wait);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return throttled;
}

function useActivityRows(m: ShapeMaterialization): ActivityRow[] {
  const coll = m.collection as Collection<ActivityRow, string>;
  const { data } = useLiveQuery(
    (q) => q.from({ a: coll }).select(({ a }) => ({
      id: a.id, source: a.source, type: a.type,
      summary: a.summary, detail: a.detail, created_at: a.created_at,
    })),
    [coll],
  );
  return useThrottled(data as ActivityRow[], 1000);
}

interface CollectionRow { id: string; name: string; kind: string; }

function useCollectionRows(m: ShapeMaterialization | null): CollectionRow[] {
  const coll = m ? (m.collection as Collection<CollectionRow, string>) : null;
  const { data } = useLiveQuery(
    (q) => {
      if (!coll) return undefined as never;
      return q.from({ c: coll }).select(({ c }) => ({
        id: c.id, name: c.name, kind: c.kind,
      }));
    },
    [coll],
  );
  return (data as CollectionRow[]) ?? [];
}

// ── page ───────────────────────────────────────────────────────────

export default function Home() {
  const [shape, setShape] = useState<ShapeMaterialization | null>(null);
  const [collShape, setCollShape] = useState<ShapeMaterialization | null>(null);
  const [jdgShape, setJdgShape] = useState<ShapeMaterialization | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let ok = true; setErr(null);
    // Only the activity shape is required to leave Connecting. Collections /
    // judgments are acquired lazily when that tab opens (SHAPE_BUDGET=4;
    // see ADR-003) — opening all three on boot left no headroom and hung
    // under HTTP/1.1 when other dashboard tabs were also open.
    let settled = false;
    const t = setTimeout(() => {
      if (ok && !settled) setErr("Timed out — close other tabs on this origin and reload");
    }, 15000);
    getShape().then((s) => {
      if (!ok) return;
      settled = true; clearTimeout(t); setShape(s);
    }).catch((e) => {
      if (!ok) return;
      settled = true; clearTimeout(t); setErr(String(e));
    });
    return () => {
      ok = false;
      clearTimeout(t);
      releaseShape("activity-log", { immediate: true });
      releaseShape("collections", { immediate: true });
      releaseShape("judgments", { immediate: true });
    };
  }, []);

  if (!shape) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <p className="text-sm text-zinc-400">{err || "Connecting…"}</p>
      </div>
    );
  }
  // Collections tab needs coll/jdg; pass null-safe placeholders until ready.
  return <Feed shape={shape} collShape={collShape} jdgShape={jdgShape} />;
}

// ── feed ───────────────────────────────────────────────────────────

function Feed({ shape, collShape, jdgShape }: { shape: ShapeMaterialization; collShape: ShapeMaterialization | null; jdgShape: ShapeMaterialization | null }) {
  const rows = useActivityRows(shape);
  const [tab, setTab] = useState<TabId>("activity");
  // Lazily acquire collections/judgments only when that tab is opened so Activity
  // boot holds a single live shape (ADR-003 budget).
  const [lazyColl, setLazyColl] = useState<ShapeMaterialization | null>(collShape);
  const [lazyJdg, setLazyJdg] = useState<ShapeMaterialization | null>(jdgShape);
  useEffect(() => {
    if (tab !== "collections") return;
    let ok = true;
    if (!lazyColl) getCollShape().then((s) => { if (ok) setLazyColl(s); }).catch(() => {});
    if (!lazyJdg) getJdgShape().then((s) => { if (ok) setLazyJdg(s); }).catch(() => {});
    return () => { ok = false; };
  }, [tab, lazyColl, lazyJdg]);
  const collections = useCollectionRows(lazyColl);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"newest"|"oldest"|"source">("newest");
  const [enabledSources, setEnabledSources] = useState<Set<string>>(new Set(SOURCES));
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [projectSearch, setProjectSearch] = useState("");
  const [memorySearch, setMemorySearch] = useState("");
  const [memMessagesOnly, setMemMessagesOnly] = useState(true);
  const [memSourceFilter, setMemSourceFilter] = useState<"all"|"claude-code"|"pi">("all");
  const [memSort, setMemSort] = useState<"newest"|"oldest"|"most-active">("newest");
  const [memShowCount, setMemShowCount] = useState(40);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [projSort, setProjSort] = useState<"active"|"recent"|"az">("recent");
  const [minEvents, setMinEvents] = useState(3);
  const [pinned, setPinned] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try { return new Set(JSON.parse(localStorage.getItem("pinnedProjects") || "[]")); }
    catch { return new Set(); }
  });
  const [judging, setJudging] = useState<{ row: typeof enriched[number]; verdict: Verdict } | null>(null);
  const [toolbarFor, setToolbarFor] = useState<string | null>(null);
  const [judgeComment, setJudgeComment] = useState("");
  const [judgeBucket, setJudgeBucket] = useState("inbox");
  const [newBucketName, setNewBucketName] = useState("");
  const [showNewBucket, setShowNewBucket] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailRow, setDetailRow] = useState<typeof enriched[number] | null>(null);
  const [burstExpanded, setBurstExpanded] = useState<Set<string>>(new Set());
  const [dateFilter, setDateFilter] = useState<"all"|"today"|"week"|"month">("all");
  const [bulkBucket, setBulkBucket] = useState("inbox");
  const [bulkComment, setBulkComment] = useState("");
  const [bulkShowNew, setBulkShowNew] = useState(false);
  const [bulkNewName, setBulkNewName] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // auto-dismiss toast after 3s
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const dateCutoff = useMemo(() => {
    const now = new Date();
    if (dateFilter === "today") { const d = new Date(now); d.setHours(0,0,0,0); return d.toISOString(); }
    if (dateFilter === "week") { const d = new Date(now); d.setDate(d.getDate()-7); return d.toISOString(); }
    if (dateFilter === "month") { const d = new Date(now); d.setMonth(d.getMonth()-1); return d.toISOString(); }
    return "";
  }, [dateFilter]);

  const submitJudgment = useCallback(async (row: typeof enriched[number], verdict: Verdict, comment: string, bucketId: string) => {
    setJudging(null);
    setJudgeComment("");
    setJudgeBucket("inbox");
    setShowNewBucket(false);
    setNewBucketName("");
    const id = uuid();
    // Ensure bucket exists (idempotent — may be a newly created one)
    try {
      await writeRow("judgment_collections", { id: bucketId, name: bucketId === "inbox" ? "inbox" : (collections.find(c => c.id === bucketId)?.name ?? bucketId), kind: "dataset", description: "", created_at: new Date().toISOString() });
    } catch { /* already exists */ }
    try {
      await writeRow("judgments", { id, activity_id: Number(row.id), span_start: "", span_end: "", verdict, comment, collection_id: bucketId, created_at: new Date().toISOString() });
      setToast({ message: `Annotation saved to ${bucketId}`, type: "success" });
    } catch (e) {
      console.error("judgment write failed", e);
      setToast({ message: "Save failed — check connection", type: "error" });
    }
  }, [collections]);

  useEffect(() => {
    localStorage.setItem("pinnedProjects", JSON.stringify([...pinned]));
  }, [pinned]);

  useEffect(() => {
    if (!menuOpen) return;
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [menuOpen]);

  useEffect(() => {
    if (!toolbarFor) return;
    // Must ignore presses inside the annotate UI. A bare document listener
    // closes the toolbar on the same pointerdown that hits a verdict button,
    // so the verdict onClick never fires — especially on mobile/PWA.
    const h = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("[data-annotate-ui]")) return;
      setToolbarFor(null);
    };
    document.addEventListener("pointerdown", h);
    return () => document.removeEventListener("pointerdown", h);
  }, [toolbarFor]);

  const ts = (s: string) => setEnabledSources((p) => { const n = new Set(p); n.has(s)?n.delete(s):n.add(s); return n; });
  const tx = (id: string) => setExpanded((p) => { const n = new Set(p); n.has(id)?n.delete(id):n.add(id); return n; });

  const tabSrcs: Record<TabId, string[]> = { activity: ["claude-code","pi"], projects: [...SOURCES], memory: ["claude-code","pi"], collections: [] };

  // Measured: maps every synced row and re-runs on each delta, so it is the
  // first thing to check when this page feels slow (ADR-004). See /perf.
  const enriched = useMemo(() => measure("activity.enrich", () => rows.map((r) => {
    const d = parseDetail(r.detail);
    const changes = Array.isArray(d?.changes) ? d.changes as { file?: string; event?: string }[] : [];
    return {
      ...r,
      project: (d?.project as string)||"", session_id: (d?.session_id as string)||"", tool: (d?.tool as string)||"",
      role: (d?.role as string)||"", text: (d?.text as string)||"",
      files: changes.map(c => c.file).filter((f): f is string => !!f),
    };
  }), { rows: rows.length }), [rows]);

  // counts
  const tc = useMemo(() => {
    const c: Record<TabId,number> = { activity:0,projects:0,memory:0,collections:0 };
    for (const r of rows) {
      if (tabSrcs.activity.includes(r.source)) c.activity++; c.projects++;
      if (r.source==="claude-code"||r.source==="pi") c.memory++;
    }
    return c;
  }, [rows]);

  // flat list
  const filtered = useMemo(() => measure("activity.filter", () => {
    if (tab==="projects"||tab==="memory"||tab==="collections") return [];
    const q = search.toLowerCase().trim();
    return enriched
      .filter(r=>tabSrcs[tab].includes(r.source)&&enabledSources.has(r.source))
      .filter(r=>!q||r.summary.toLowerCase().includes(q)||(r.detail&&r.detail.toLowerCase().includes(q)))
      .filter(r=>!dateCutoff||r.created_at>=dateCutoff)
      .sort((a,b)=>sort==="newest"?b.created_at.localeCompare(a.created_at):sort==="oldest"?a.created_at.localeCompare(b.created_at):a.source.localeCompare(b.source)||b.created_at.localeCompare(a.created_at));
  }, { rows: enriched.length, tab }), [enriched, tab, enabledSources, search, sort, dateCutoff]);

  // burst grouping — collapse rapid-fire same-project runs into one card, even when
  // other projects/sources interleave between them in the sorted list (which is the
  // normal case on the "All" tab).
  const BURST_WINDOW_MS = 2 * 60 * 1000;
  const bursts = useMemo(() => {
    const groups: { key: string; project: string; sources: Set<string>; rows: typeof filtered }[] = [];
    const openByProject = new Map<string, typeof groups[number]>();
    for (const r of filtered) {
      const open = r.project ? openByProject.get(r.project) : undefined;
      const lastRow = open?.rows[open.rows.length - 1];
      if (open && lastRow && Math.abs(Date.parse(lastRow.created_at) - Date.parse(r.created_at)) <= BURST_WINDOW_MS) {
        open.rows.push(r);
        open.sources.add(r.source);
      } else {
        const g = { key: r.id, project: r.project, sources: new Set([r.source]), rows: [r] };
        groups.push(g);
        if (r.project) openByProject.set(r.project, g);
      }
    }
    return groups;
  }, [filtered]);

  // projects
  const projList = useMemo(() => [...new Set(enriched.map(r=>r.project).filter(Boolean))].sort(), [enriched]);
  const visProj = useMemo(() => { const q=projectSearch.toLowerCase(); return q?projList.filter(p=>p.toLowerCase().includes(q)):projList; }, [projList,projectSearch]);
  const projSources = useMemo(() => {
    const m: Record<string, Set<string>> = {};
    for (const r of enriched) { if (!r.project) continue; (m[r.project]??=new Set()).add(r.source); }
    return m;
  }, [enriched]);
  const projGroups = useMemo(() => {
    const q = search.toLowerCase();
    const g: Record<string, typeof enriched> = {};
    for (const r of enriched) {
      if (!r.project||!visProj.includes(r.project)||!enabledSources.has(r.source)) continue;
      if (q&&!r.summary.toLowerCase().includes(q)) continue;
      (g[r.project]??=[]).push(r);
    }
    const ents = Object.entries(g).filter(([n,e])=>e.length>=minEvents||pinned.has(n));
    if (projSort==="active") ents.sort((a,b)=>b[1].length-a[1].length||(b[1][0]?.created_at||"").localeCompare(a[1][0]?.created_at||""));
    else if (projSort==="az") ents.sort((a,b)=>a[0].toLowerCase().localeCompare(b[0].toLowerCase()));
    else ents.sort((a,b)=>(b[1][0]?.created_at||"").localeCompare(a[1][0]?.created_at||""));
    const p=ents.filter(([n])=>pinned.has(n)); const u=ents.filter(([n])=>!pinned.has(n));
    for (const[,e] of [...p,...u]) e.sort((a,b)=>b.created_at.localeCompare(a.created_at));
    return [...p,...u];
  }, [enriched, visProj, enabledSources, search, projSort, minEvents, pinned]);

  // memory
  const memSessionsAll = useMemo(() => {
    const s: Record<string,{rows:typeof enriched; project?:string; source:string; tc:Record<string,number>}> = {};
    for (const r of enriched) {
      if (r.source!=="claude-code"&&r.source!=="pi") continue;
      const sid = r.session_id||`ns-${r.id}`;
      (s[sid]??={rows:[],source:r.source,tc:{}}).rows.push(r);
      if (r.project) s[sid].project=r.project;
      if (r.tool) s[sid].tc[r.tool]=(s[sid].tc[r.tool]||0)+1;
    }
    for (const v of Object.values(s)) v.rows.sort((a,b)=>b.created_at.localeCompare(a.created_at));
    return Object.entries(s).sort((a,b)=>(b[1].rows[0]?.created_at||"").localeCompare(a[1].rows[0]?.created_at||""));
  }, [enriched]);

  const memCounts = useMemo(() => {
    // counts sessions that actually have a captured message, not raw tool-call/
    // session-end pings — matches what "messages only" mode will show
    const c = { "claude-code": 0, pi: 0 };
    for (const [,v] of memSessionsAll) {
      if (!v.rows.some(r=>r.type==="claude.message"||r.type==="pi.message")) continue;
      c[v.source as "claude-code"|"pi"] = (c[v.source as "claude-code"|"pi"]||0)+1;
    }
    return c;
  }, [memSessionsAll]);

  const memSessions = useMemo(() => {
    const q = memorySearch.toLowerCase();
    const hasMsg = (v: typeof memSessionsAll[number][1]) => v.rows.some(r=>r.type==="claude.message"||r.type==="pi.message");
    const out = memSessionsAll
      .filter(([,v])=>memSourceFilter==="all"||v.source===memSourceFilter)
      // tool-only sessions (session.end pings, bare tool-use bursts with no
      // actual message) are noise in message view — hide them when messages-only
      .filter(([,v])=>!memMessagesOnly||hasMsg(v))
      .filter(([,v])=>!q||v.rows.some(r=>r.summary.toLowerCase().includes(q)||(r.text&&r.text.toLowerCase().includes(q))||(v.project&&v.project.toLowerCase().includes(q))));
    if (memSort==="oldest") out.sort((a,b)=>(a[1].rows[a[1].rows.length-1]?.created_at||"").localeCompare(b[1].rows[b[1].rows.length-1]?.created_at||""));
    else if (memSort==="most-active") out.sort((a,b)=>b[1].rows.length-a[1].rows.length);
    else out.sort((a,b)=>(b[1].rows[0]?.created_at||"").localeCompare(a[1].rows[0]?.created_at||""));
    return out;
  }, [memSessionsAll, memorySearch, memSourceFilter, memSort, memMessagesOnly]);

  // sparkline — event volume over the last 3h in 6-min buckets, for a glance before scrolling
  const SPARK_BUCKETS = 30;
  const SPARK_BUCKET_MS = 6 * 60 * 1000;
  const sparkline = useMemo(() => {
    const now = Date.now();
    const start = now - SPARK_BUCKETS * SPARK_BUCKET_MS;
    const counts = new Array(SPARK_BUCKETS).fill(0) as number[];
    for (const r of rows) {
      if (!enabledSources.has(r.source)) continue;
      const t = Date.parse(r.created_at);
      if (isNaN(t) || t < start || t > now) continue;
      const idx = Math.min(SPARK_BUCKETS - 1, Math.floor((t - start) / SPARK_BUCKET_MS));
      counts[idx]++;
    }
    return counts;
  }, [rows, enabledSources]);
  const sparkMax = Math.max(1, ...sparkline);

  const visibleCount = tab==="projects"?projGroups.reduce((s,[,e])=>s+e.length,0):tab==="memory"?memSessions.reduce((s,[,v])=>s+v.rows.length,0):filtered.length;
  const cs = tab==="memory"?memorySearch:tab==="projects"?projectSearch:search;
  const setCs = tab==="memory"?setMemorySearch:tab==="projects"?setProjectSearch:setSearch;
  const ph = tab==="memory"?"Search sessions…":tab==="projects"?"Filter projects…":"Search…";

  function renderRow(r: typeof enriched[number], opts?: { thread?: boolean }) {
    const isJudging = judging?.row.id === r.id;
    const isSelected = selected.has(r.id);
    const isMessage = r.type === "claude.message" || r.type === "pi.message";
    const isUser = r.role === "user";
    return (<div key={r.id} className={`group relative ${selectMode&&isSelected?"ring-1 ring-amber-400 rounded-lg":""}`}>
      {selectMode && (
        <button onClick={() => { const n = new Set(selected); n.has(r.id) ? n.delete(r.id) : n.add(r.id); setSelected(n); }}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 shrink-0 w-4 h-4 rounded border border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-800 flex items-center justify-center">
          {isSelected && <span className="text-[10px] text-amber-600">✓</span>}
        </button>
      )}
      {opts?.thread && isMessage ? (
        <button onClick={()=>{if(!selectMode)setDetailRow(r)}} className={`w-full text-left rounded-lg border px-3 py-2 hover:brightness-95 transition-all dark:hover:brightness-110 ${selectMode?"pl-8":""} ${isUser?"border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/40":"border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"}`}>
          <div className="flex items-center gap-1.5 mb-1">
            <span className={`text-[10px] font-semibold uppercase tracking-wide ${isUser?"text-blue-600 dark:text-blue-300":"text-zinc-500 dark:text-zinc-400"}`}>{isUser?"You":SOURCE_FULL[r.source]??r.source}</span>
            <span className="text-[10px] text-zinc-400">{relativeTime(r.created_at)}</span>
          </div>
          <p className="whitespace-pre-wrap break-words text-sm text-zinc-800 dark:text-zinc-200">{r.text||r.summary}</p>
        </button>
      ) : opts?.thread ? (
        <button onClick={()=>{if(!selectMode)setDetailRow(r)}} className={`w-full text-left rounded-md border border-dashed border-zinc-200 bg-zinc-50 px-2.5 py-1 hover:bg-zinc-100 transition-colors dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:bg-zinc-800/60 ${selectMode?"pl-8":""}`}>
          <div className="flex items-center gap-2 min-w-0"><span className="shrink-0 text-[10px] text-zinc-400">⚙</span><span className="truncate text-[11px] text-zinc-500 dark:text-zinc-400 flex-1 min-w-0">{r.summary}</span><span className="shrink-0 text-[10px] text-zinc-400">{relativeTime(r.created_at)}</span></div>
        </button>
      ) : (
      <button onClick={()=>{if(!selectMode)setDetailRow(r)}} className={`w-full text-left rounded-lg border border-zinc-200 bg-white px-3 py-2.5 hover:bg-zinc-50 transition-colors dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/60 ${selectMode?"pl-8":""}`}>
        <div className="flex items-center gap-2 min-w-0">
          <span className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-semibold leading-none ${SOURCE_COLORS[r.source]??"bg-zinc-100 text-zinc-700"}`}>{SOURCE_LABELS[r.source]??r.source}</span>
          <span className="truncate text-sm text-zinc-800 dark:text-zinc-200 flex-1 min-w-0">{r.summary}</span>
          <span className="shrink-0 text-[10px] text-zinc-400">{relativeTime(r.created_at)}</span>
        </div>
        {r.files.length>0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {r.files.slice(0,8).map((f,i)=>(
              <span key={i} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${extDotColor(fileExt(f))}`} />
                {fileBasename(f)}
              </span>
            ))}
            {r.files.length>8 && <span className="text-[10px] text-zinc-400 self-center">+{r.files.length-8} more</span>}
          </div>
        )}
      </button>
      )}
      {/* tap-to-reveal annotate button — works without hover (phone-friendly) */}
      {!selectMode&&<button
        data-annotate-ui
        onPointerDown={e=>e.stopPropagation()}
        onClick={(e)=>{e.stopPropagation(); setToolbarFor(t=>t===r.id?null:r.id);}}
        title="Annotate"
        className={`absolute right-2 top-2 z-10 flex items-center justify-center w-6 h-6 rounded-full text-xs shadow-sm transition-colors ${toolbarFor===r.id?"bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900":"bg-white/90 text-zinc-500 border border-zinc-200 dark:bg-zinc-900/90 dark:border-zinc-700 dark:text-zinc-400"}`}>
        {toolbarFor===r.id?"✕":"🏷"}
      </button>}
      {!selectMode&&toolbarFor===r.id&&<div data-annotate-ui className="absolute right-2 top-9 z-10 flex items-center gap-0.5 bg-white border border-zinc-200 dark:bg-zinc-900 dark:border-zinc-700 rounded-md px-1 py-1 shadow-lg" onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
        {/* One-tap save: tapping a verdict writes immediately. Long-press / right-click opens comment sheet. */}
        {VERDICTS.map(v=>(<button key={v.label}
          title={`${v.label} (tap to save)`}
          onPointerDown={e=>e.stopPropagation()}
          onClick={(e)=>{ e.stopPropagation(); setToolbarFor(null); void submitJudgment(r, v.label, "", judgeBucket || "inbox"); }}
          onContextMenu={(e)=>{ e.preventDefault(); e.stopPropagation(); setJudging({row:r,verdict:v.label}); setJudgeComment(""); setToolbarFor(null); }}
          className="text-base p-1.5 active:scale-90 transition-transform touch-manipulation">{v.emoji}</button>))}
      </div>}
      {/* comment / collection sheet — fixed so it can't clip inside a thread card on mobile */}
      {isJudging&&<div data-annotate-ui className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-50 mx-auto w-[min(100%,20rem)] rounded-xl border border-zinc-200 bg-white p-3 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center gap-1.5 mb-2"><span className="text-sm">{VERDICTS.find(v=>v.label===judging.verdict)?.emoji}</span><span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 capitalize">{judging.verdict}</span></div>
        <textarea value={judgeComment} onChange={e=>setJudgeComment(e.target.value)} placeholder="Comment (optional)…" rows={2} className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-800 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 resize-none" autoFocus />
        {/* bucket picker */}
        <div className="mt-2">
          <label className="text-[10px] text-zinc-400 uppercase tracking-wider">Collection</label>
          {!showNewBucket ? (
            <div className="flex items-center gap-1 mt-0.5">
              <select value={judgeBucket} onChange={e => setJudgeBucket(e.target.value)}
                className="flex-1 rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {!collections.some(c => c.id === "inbox") && <option value="inbox">inbox</option>}
                {collections.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
              <button onClick={() => setShowNewBucket(true)} title="New collection"
                className="rounded px-1.5 py-0.5 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 border border-zinc-200 dark:border-zinc-700">+</button>
            </div>
          ) : (
            <div className="flex items-center gap-1 mt-0.5">
              <input type="text" value={newBucketName} onChange={e => setNewBucketName(e.target.value)}
                placeholder="name…" autoFocus
                className="flex-1 rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-xs text-zinc-700 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200" />
              <button onClick={() => { if (newBucketName.trim()) { const id = newBucketName.trim().toLowerCase().replace(/\s+/g, "-"); setJudgeBucket(id); setShowNewBucket(false); setNewBucketName(""); } }}
                className="rounded px-1.5 py-0.5 text-xs font-medium bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-800">Add</button>
              <button onClick={() => { setShowNewBucket(false); setNewBucketName(""); }}
                className="text-[10px] text-zinc-400 hover:text-zinc-600">✕</button>
            </div>
          )}
        </div>
        <div className="flex gap-1.5 mt-2 justify-end">
          <button onClick={()=>setJudging(null)} className="rounded px-2 py-0.5 text-[10px] text-zinc-400 hover:text-zinc-600">Cancel</button>
          <button onClick={()=>submitJudgment(r,judging.verdict,judgeComment,judgeBucket)} className="rounded px-3 py-1 text-xs font-medium bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-800">Save</button>
        </div>
      </div>}
    </div>);
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-16">
      {/* toast banner */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 rounded-lg px-4 py-2 text-sm font-medium shadow-lg transition-all animate-in fade-in slide-in-from-top-2 ${toast.type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.message}
        </div>
      )}
      {/* sticky header: row 1 = tabs only (no scroll), row 2 = search + menu */}
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 pt-[env(safe-area-inset-top,0px)]">
        <div className="mx-auto max-w-5xl px-2 pt-1.5">
          {/* row 1: activity tabs, evenly spread, own row, no scroll */}
          <div className="flex w-full">
            {(["activity","projects","memory","collections"] as TabId[]).map((id) => (
              <button key={id} onClick={() => setTab(id)}
                className={`flex-1 min-w-0 px-0.5 py-1 text-[11px] font-medium rounded-md transition-colors truncate ${tab===id?"bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100":"text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"}`}>
                {id.charAt(0).toUpperCase()+id.slice(1)}
                {id!=="collections" && <span className="ml-0.5 text-[9px] text-zinc-400">{tc[id]}</span>}
              </button>
            ))}
          </div>

          {/* row 2: search + live count + menu */}
          {tab!=="collections" && <div className="flex items-center gap-2 py-1 flex-wrap">
            <input type="text" value={cs} onChange={e=>setCs(e.target.value)} placeholder={ph}
              className="flex-1 min-w-0 rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-xs text-zinc-800 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200" />

            <span className="text-[10px] text-zinc-400 shrink-0 hidden sm:inline"><span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500 mr-1"/>{visibleCount}</span>

            {tab!=="projects"&&tab!=="memory"&&(
              <button onClick={() => { setSelectMode(!selectMode); setSelected(new Set()); }}
                className={`rounded-md border px-1.5 py-0.5 text-[10px] transition-colors shrink-0 ${selectMode?"border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300":"border-zinc-200 text-zinc-400 hover:text-zinc-600 dark:border-zinc-700 dark:hover:text-zinc-300"}`}>
                {selectMode ? "Done" : "Select"}
              </button>
            )}

            <div className="relative shrink-0" ref={menuRef}>
              <button onClick={()=>setMenuOpen(!menuOpen)}
                className={`rounded-md border px-1.5 py-0.5 text-xs transition-colors ${menuOpen?"border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300":"border-zinc-200 text-zinc-400 hover:text-zinc-600 dark:border-zinc-700 dark:hover:text-zinc-300"}`}>⋯</button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-zinc-200 bg-white p-2.5 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 space-y-2.5 z-20">
                  <div className="space-y-1">
                    <p className="text-[10px] text-zinc-400 uppercase tracking-wider">Sources</p>
                    <div className="flex flex-wrap gap-1">
                      {SOURCES.map(s=>(<button key={s} onClick={()=>ts(s)} className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${enabledSources.has(s)?SOURCE_COLORS[s]??"bg-zinc-100 text-zinc-700":"bg-zinc-100 text-zinc-300 line-through dark:bg-zinc-800 dark:text-zinc-600"}`}>{SOURCE_LABELS[s]??s}</button>))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-zinc-400 uppercase tracking-wider">Sort</p>
                    <select value={sort} onChange={e=>setSort(e.target.value as any)} className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      <option value="newest">↓ Newest</option><option value="oldest">↑ Oldest</option><option value="source">By source</option>
                    </select>
                  </div>
                  {tab!=="projects"&&tab!=="memory"&&(<div className="space-y-1">
                    <p className="text-[10px] text-zinc-400 uppercase tracking-wider">Date</p>
                    <select value={dateFilter} onChange={e=>setDateFilter(e.target.value as any)} className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      <option value="all">All time</option><option value="today">Today</option><option value="week">This week</option><option value="month">This month</option>
                    </select>
                  </div>)}
                </div>
              )}
            </div>
          </div>}

          {/* row 3: activity sparkline — last 3h, 6-min buckets */}
          {tab!=="collections" && <div className="flex items-end gap-px h-6 pb-1" title="Event volume, last 3 hours">
            {sparkline.map((c, i) => (
              <div key={i} className="flex-1 min-w-0 rounded-sm bg-zinc-300 dark:bg-zinc-700"
                style={{ height: `${c === 0 ? 2 : Math.max(15, (c / sparkMax) * 100)}%` }}
                title={`${c} event${c===1?"":"s"}`} />
            ))}
          </div>}
        </div>
      </header>

      {/* content */}
      {tab==="collections" ? (
        lazyColl && lazyJdg ? (
          <CollectionsContent collShape={lazyColl} jdgShape={lazyJdg} actShape={shape} />
        ) : (
          <p className="py-12 text-center text-sm text-zinc-400">Loading collections…</p>
        )
      ) : (
      <div className="mx-auto max-w-5xl px-3 py-2">
        {/* MEMORY */}
        {tab==="memory"&&<div className="space-y-1.5">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            {/* source filter — the main ask: distinguish/toggle Claude Code vs pi */}
            <div className="flex rounded-full border border-zinc-200 dark:border-zinc-700 overflow-hidden shrink-0">
              {([
                { id: "all" as const, label: `All ${memCounts["claude-code"]+memCounts.pi}` },
                { id: "claude-code" as const, label: `CC ${memCounts["claude-code"]}` },
                { id: "pi" as const, label: `PI ${memCounts.pi}` },
              ]).map(o=>(
                <button key={o.id} onClick={()=>setMemSourceFilter(o.id)}
                  className={`px-2 py-0.5 text-[10px] font-semibold transition-colors ${memSourceFilter===o.id?(o.id==="pi"?"bg-green-600 text-white":o.id==="claude-code"?"bg-purple-600 text-white":"bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900"):"bg-white text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400"}`}>
                  {o.label}
                </button>
              ))}
            </div>
            <select value={memSort} onChange={e=>setMemSort(e.target.value as any)}
              className="rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 shrink-0">
              <option value="newest">↓ Newest</option><option value="oldest">↑ Oldest</option><option value="most-active">Most active</option>
            </select>
            <button onClick={()=>setMemMessagesOnly(m=>!m)}
              className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors shrink-0 ${memMessagesOnly?"bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200":"bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"}`}>
              {memMessagesOnly?"💬 Messages only":"⚙ Show tool calls"}
            </button>
          </div>
          {memSessions.slice(0,memShowCount).map(([sid,v])=>{
            const isMsg = (r: typeof v.rows[number]) => r.type==="claude.message"||r.type==="pi.message";
            const threadRows = memMessagesOnly ? v.rows.filter(isMsg) : v.rows;
            return (<div key={sid} className={`rounded-lg border bg-white dark:bg-zinc-900 border-l-4 ${v.source==="pi"?"border-l-green-500":"border-l-purple-500"} border-zinc-200 dark:border-zinc-800`}>
            <button onClick={()=>tx(sid)} className="w-full text-left px-3 py-1.5 flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-bold leading-none ${v.source==="pi"?"bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200":"bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"}`}>{v.source==="pi"?"PI":"CC"}</span>
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{[...v.rows].reverse().find(r=>r.role==="user")?.summary||v.rows[0]?.summary||"session"}</p>
                </div>
                <p className="text-[10px] text-zinc-400 mt-0.5">{v.rows.length}e · {Object.entries(v.tc).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([t,c])=>`${t}:${c}`).join(" · ")} · {relativeTime(v.rows[0]?.created_at||"")}</p>
              </div>
              <span className="shrink-0 text-xs text-zinc-400">{expanded.has(sid)?"▾":"▸"}</span>
            </button>
            {expanded.has(sid)&&<div className="border-t border-zinc-100 dark:border-zinc-800 p-2 space-y-1.5">{threadRows.length>0?[...threadRows].sort((a,b)=>a.created_at.localeCompare(b.created_at)).map(r=>renderRow(r,{thread:true})):<p className="py-4 text-center text-xs text-zinc-400">No messages captured for this session (tool-only)</p>}</div>}
          </div>);})}
          {memSessions.length>memShowCount&&<button onClick={()=>setMemShowCount(c=>c+40)} className="w-full py-2 text-[10px] text-zinc-400 hover:text-zinc-600 text-center">show more ({memSessions.length-memShowCount} left) ▾</button>}
          {memSessions.length===0&&<p className="py-12 text-center text-sm text-zinc-400">No matching sessions</p>}
        </div>}

        {/* PROJECTS */}
        {tab==="projects"&&<>
          {/* project sort + threshold bar */}
          <div className="flex items-center gap-2 mb-2">
            <select value={projSort} onChange={e=>setProjSort(e.target.value as any)} className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-[10px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
              <option value="recent">Recent</option><option value="active">Most active</option><option value="az">A–Z</option>
            </select>
            <select value={minEvents} onChange={e=>setMinEvents(Number(e.target.value))} className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-[10px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
              <option value={1}>All</option><option value={3}>≥3 events</option><option value={10}>≥10 events</option><option value={50}>≥50 events</option><option value={100}>≥100 events</option>
            </select>
            <span className="text-[10px] text-zinc-400 ml-auto">{projGroups.length} of {projList.length} projects</span>
          </div>
          {pinned.size>0 && <div className="mb-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {projGroups.filter(([p])=>pinned.has(p)).map(([p,e])=>(<div key={p} className="rounded-lg border border-amber-300 bg-white dark:bg-zinc-900 dark:border-amber-700">
              <div className="px-2.5 py-1.5 border-b border-amber-100 dark:border-amber-900 flex items-center justify-between"><div className="min-w-0 flex-1"><div className="flex items-center gap-1.5"><button onClick={()=>{const n=new Set(pinned);n.delete(p);setPinned(n)}} className="shrink-0 text-xs text-amber-500">★</button><p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{p}</p></div><p className="text-[10px] text-zinc-400 mt-0.5">{e.length}e · latest {relativeTime(e[0]?.created_at||"")}</p></div></div>
              <ul className="divide-y divide-zinc-50 dark:divide-zinc-800">{e.slice(0,2).map(r=>(<li key={r.id} onClick={()=>setDetailRow(r)} className="px-2.5 py-1.5 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/60">
                <div className="flex items-center gap-2"><span className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-semibold leading-none ${SOURCE_COLORS[r.source]??"bg-zinc-100 text-zinc-700"}`}>{SOURCE_LABELS[r.source]??r.source}</span><span className="truncate text-xs text-zinc-700 dark:text-zinc-300 flex-1 min-w-0">{r.summary}</span><span className="shrink-0 text-[10px] text-zinc-400">{relativeTime(r.created_at)}</span></div>
              </li>))}</ul>
              <button onClick={()=>document.getElementById(`proj-${p}`)?.scrollIntoView({behavior:"smooth",block:"start"})} className="w-full px-2.5 py-1 text-[10px] text-zinc-400 hover:text-zinc-600 text-center border-t border-zinc-50 dark:border-zinc-800">jump to full ▾</button>
            </div>))}
          </div>}
          <div className="space-y-1.5">
          {projGroups.filter(([p])=>!pinned.has(p)).map(([p,e])=>(<div key={p} id={`proj-${p}`} className="rounded-lg border bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
            <div className="px-3 py-1.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between"><div className="min-w-0 flex-1"><div className="flex items-center gap-1.5"><button onClick={()=>{const n=new Set(pinned);n.has(p)?n.delete(p):n.add(p);setPinned(n)}} className={`shrink-0 text-xs ${pinned.has(p)?"text-amber-500":"text-zinc-300 hover:text-amber-400"}`}>{pinned.has(p)?"★":"☆"}</button><p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{p}</p><div className="flex gap-0.5 shrink-0">{([...(projSources[p]??[])] as string[]).sort().map(s=>(<span key={s} className={`rounded px-1 py-0 text-[9px] font-semibold leading-snug ${SOURCE_COLORS[s]??"bg-zinc-100 text-zinc-700"}`}>{SOURCE_LABELS[s]??s}</span>))}</div></div><p className="text-[10px] text-zinc-400 mt-0.5">{e.length}e · latest {relativeTime(e[0]?.created_at||"")}</p></div></div>
            <ul className="divide-y divide-zinc-50 dark:divide-zinc-800">{e.slice(0,expanded.has(p)?e.length:5).map(r=>(<li key={r.id} onClick={()=>setDetailRow(r)} className="px-3 py-2 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/60">
              <div className="flex items-center gap-2"><span className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-semibold leading-none ${SOURCE_COLORS[r.source]??"bg-zinc-100 text-zinc-700"}`}>{SOURCE_LABELS[r.source]??r.source}</span><span className="truncate text-sm text-zinc-700 dark:text-zinc-300 flex-1 min-w-0">{r.summary}</span><span className="shrink-0 text-[10px] text-zinc-400">{relativeTime(r.created_at)}</span></div>
              {r.files.length>0 && <div className="mt-1 flex flex-wrap gap-1">{r.files.slice(0,6).map((f,i)=>(<span key={i} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${extDotColor(fileExt(f))}`} />{fileBasename(f)}</span>))}{r.files.length>6 && <span className="text-[10px] text-zinc-400 self-center">+{r.files.length-6} more</span>}</div>}
            </li>))}</ul>
            {e.length>5&&<button onClick={()=>tx(p)} className="w-full px-3 py-1.5 text-[10px] text-zinc-400 hover:text-zinc-600 text-center border-t border-zinc-50 dark:border-zinc-800">{expanded.has(p)?"collapse":`show all ${e.length} ▾`}</button>}
          </div>))}
          {projGroups.length===0&&<p className="py-12 text-center text-sm text-zinc-400">No matching projects</p>}
          </div>
        </>}

        {/* bulk action bar */}
        {selectMode && selected.size > 0 && tab!=="projects" && tab!=="memory" && (
          <div className="sticky bottom-12 z-10 mb-2 rounded-lg border border-amber-300 bg-amber-50 p-2 dark:border-amber-700 dark:bg-amber-950">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-amber-800 dark:text-amber-200">{selected.size} selected</span>
              <select value={bulkBucket} onChange={e => setBulkBucket(e.target.value)}
                className="rounded-md border border-amber-300 bg-white px-1.5 py-0.5 text-xs text-zinc-700 dark:border-amber-700 dark:bg-zinc-800 dark:text-zinc-300">
                {collections.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
              {!bulkShowNew ? (
                <button onClick={() => setBulkShowNew(true)} className="rounded px-1.5 py-0.5 text-[10px] text-amber-600 hover:text-amber-800 border border-amber-300">+ new</button>
              ) : (
                <div className="flex items-center gap-1">
                  <input type="text" value={bulkNewName} onChange={e => setBulkNewName(e.target.value)}
                    placeholder="name…" autoFocus
                    className="w-20 rounded-md border border-amber-300 bg-white px-1.5 py-0.5 text-xs text-zinc-700 placeholder:text-zinc-400" />
                  <button onClick={() => { if (bulkNewName.trim()) { setBulkBucket(bulkNewName.trim().toLowerCase().replace(/\s+/g, "-")); setBulkShowNew(false); setBulkNewName(""); } }}
                    className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-600 text-white">✓</button>
                  <button onClick={() => { setBulkShowNew(false); setBulkNewName(""); }} className="text-[10px] text-amber-400">✕</button>
                </div>
              )}
              <button onClick={async () => {
                const bucketId = bulkBucket;
                const comment = bulkComment;
                setSelected(new Set());
                setBulkComment("");
                // Ensure bucket exists
                try { await writeRow("judgment_collections", { id: bucketId, name: collections.find(c => c.id === bucketId)?.name ?? bucketId, kind: "dataset", description: "", created_at: new Date().toISOString() }); } catch {}
                for (const rid of selected) {
                  const row = filtered.find(r => r.id === rid);
                  if (!row) continue;
                  const jid = uuid();
                  try {
                    await writeRow("judgments", { id: jid, activity_id: Number(row.id), span_start: "", span_end: "", verdict: "good", comment, collection_id: bucketId, created_at: new Date().toISOString() });
                  } catch (e) {
                    console.error("bulk judgment failed", e);
                    setToast({ message: "Bulk save had errors — check console", type: "error" });
                    return;
                  }
                }
                setToast({ message: `Saved ${selected.size} annotations`, type: "success" });
              }} className="rounded px-2 py-0.5 text-[10px] font-medium bg-amber-600 text-white">Save all</button>
            </div>
            <textarea value={bulkComment} onChange={e => setBulkComment(e.target.value)} placeholder="Bulk comment (optional)…" rows={1}
              className="mt-1 w-full rounded-md border border-amber-300 bg-white px-1.5 py-0.5 text-xs text-zinc-700 placeholder:text-zinc-400 dark:border-amber-700 dark:bg-zinc-800 dark:text-zinc-200 resize-none" />
          </div>
        )}

        {/* FLAT LIST */}
        {tab!=="projects"&&tab!=="memory"&&<>
          {selectMode && filtered.length > 0 && (
            <div className="mb-1 flex items-center gap-2">
              <button onClick={() => setSelected(new Set(filtered.map(r => r.id)))}
                className="text-[10px] text-zinc-400 hover:text-zinc-600">Select all {filtered.length}</button>
              {selected.size > 0 && (
                <button onClick={() => setSelected(new Set())}
                  className="text-[10px] text-zinc-400 hover:text-zinc-600">Clear</button>
              )}
            </div>
          )}
          {filtered.length===0 ? (
            <p className="py-12 text-center text-sm text-zinc-400">No matching events</p>
          ) : (
            <WindowVirtualizer data={bursts} item="div">
              {(b) => {
                if (b.rows.length===1) return <div className="pb-0.5">{renderRow(b.rows[0])}</div>;
                const isOpen = burstExpanded.has(b.key);
                const previewFiles = [...new Set(b.rows.flatMap(r=>r.files))];
                return (<div key={b.key} className="pb-0.5">
                <div className="rounded-lg border border-zinc-200 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-900/40">
                  <button onClick={()=>setBurstExpanded(p=>{const n=new Set(p); n.has(b.key)?n.delete(b.key):n.add(b.key); return n;})}
                    className="w-full text-left px-3 py-2 block">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-0.5 shrink-0">{[...b.sources].sort().map(s=>(<span key={s} className={`rounded px-1 py-0.5 text-[10px] font-semibold leading-none ${SOURCE_COLORS[s]??"bg-zinc-100 text-zinc-700"}`}>{SOURCE_LABELS[s]??s}</span>))}</div>
                      <span className="truncate text-sm text-zinc-700 dark:text-zinc-300 flex-1 min-w-0">{b.project||"—"} <span className="text-zinc-400 font-normal">· {b.rows.length} events</span></span>
                      <span className="shrink-0 text-[10px] text-zinc-400">{relativeTime(b.rows[0].created_at)}</span>
                      <span className="shrink-0 text-xs text-zinc-400">{isOpen?"▾":"▸"}</span>
                    </div>
                    {previewFiles.length>0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {previewFiles.slice(0,8).map((f,i)=>(
                          <span key={i} className="inline-flex items-center gap-1 rounded-full bg-white px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${extDotColor(fileExt(f))}`} />
                            {fileBasename(f)}
                          </span>
                        ))}
                        {previewFiles.length>8 && <span className="text-[10px] text-zinc-400 self-center">+{previewFiles.length-8} more</span>}
                      </div>
                    )}
                  </button>
                  {isOpen && <div className="flex flex-col gap-0.5 border-t border-zinc-100 dark:border-zinc-800 px-1 py-1">{b.rows.map(r=>renderRow(r))}</div>}
                </div>
              </div>);
              }}
            </WindowVirtualizer>
          )}
        </>}
      </div>
      )}

      {detailRow && <ActivityDetailDrawer row={detailRow} onClose={() => setDetailRow(null)} />}
    </div>
  );
}

// ── detail drawer ─────────────────────────────────────────────────

function ActivityDetailDrawer({ row, onClose }: { row: ReturnType<typeof useActivityRows>[number] & { project: string; session_id: string; tool: string }; onClose: () => void }) {
  const parsed = parseDetail(row.detail);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative h-full w-full max-w-sm overflow-y-auto border-l border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-800 dark:bg-zinc-950 pb-[calc(env(safe-area-inset-bottom)+3rem)]">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none ${SOURCE_COLORS[row.source]??"bg-zinc-100 text-zinc-700"}`}>{SOURCE_FULL[row.source]??row.source}</span>
            <p className="mt-1.5 text-sm font-medium text-zinc-900 dark:text-zinc-100 break-words">{row.summary}</p>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-md border border-zinc-200 px-1.5 py-0.5 text-xs text-zinc-400 hover:text-zinc-700 dark:border-zinc-700 dark:hover:text-zinc-200">✕</button>
        </div>

        <dl className="space-y-2 text-xs">
          <div className="flex gap-2"><dt className="w-20 shrink-0 text-zinc-400">Type</dt><dd className="text-zinc-700 dark:text-zinc-300">{row.type}</dd></div>
          <div className="flex gap-2"><dt className="w-20 shrink-0 text-zinc-400">Time</dt><dd className="text-zinc-700 dark:text-zinc-300">{new Date(row.created_at).toLocaleString()}</dd></div>
          {row.project && <div className="flex gap-2"><dt className="w-20 shrink-0 text-zinc-400">Project</dt><dd className="text-zinc-700 dark:text-zinc-300 break-words">{row.project}</dd></div>}
          {row.session_id && <div className="flex gap-2"><dt className="w-20 shrink-0 text-zinc-400">Session</dt><dd className="text-zinc-700 dark:text-zinc-300 break-all">{row.session_id}</dd></div>}
          {row.tool && <div className="flex gap-2"><dt className="w-20 shrink-0 text-zinc-400">Tool</dt><dd className="text-zinc-700 dark:text-zinc-300">{row.tool}</dd></div>}
        </dl>

        <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <p className="mb-1.5 text-[10px] uppercase tracking-wider text-zinc-400">Detail</p>
          {parsed ? (
            <dl className="space-y-2 text-xs">
              {Object.entries(parsed).map(([k, v]) => (
                <div key={k} className="flex gap-2"><dt className="w-20 shrink-0 text-zinc-400">{labelize(k)}</dt><dd className="min-w-0 flex-1 text-zinc-700 dark:text-zinc-300"><DetailValue value={v} /></dd></div>
              ))}
            </dl>
          ) : row.detail ? (
            <pre className="whitespace-pre-wrap break-words rounded-md bg-zinc-50 p-2 text-[11px] leading-snug text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">{row.detail}</pre>
          ) : (
            <p className="text-zinc-400 italic">No additional detail</p>
          )}
        </div>
      </div>
    </div>
  );
}
