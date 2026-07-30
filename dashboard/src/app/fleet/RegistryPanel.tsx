"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { HandlingPath, RegistryKind, RegistryRecord, RegistrySnapshot } from "@/lib/registry";
import type { Lifecycle } from "@/app/channels/lifecycles";

type RegistryResponse = RegistrySnapshot & { paths: HandlingPath[] };
type WorkflowTemplate = {
  templateId: string;
  version: number;
  label: string;
  description: string;
  definition: Lifecycle;
};

const KIND_ORDER: RegistryKind[] = [
  "Agent",
  "Skill",
  "Tool",
  "Toolset",
  "Model",
  "Workflow",
  "Lifecycle",
  "Policy",
  "Runtime",
  "Service",
];

function statusTone(status: string) {
  if (status === "live" || status === "active") return "bg-emerald-400";
  if (status === "degraded" || status === "deprecated") return "bg-amber-400";
  if (status === "retired") return "bg-red-400";
  return "bg-zinc-400";
}

type RelatedRecord = {
  record: RegistryRecord;
  direction: "uses" | "used-by";
  via: string[];
};

type AgentEvidence = {
  agentId: string;
  identity: { registryAgentId: string; sources: string[]; note: string };
  summary: {
    total: number;
    success: number;
    failed: number;
    drifted: number;
    dead_end: number;
    unknown: number;
    decided: number;
    successRate: number;
    failureRate: number;
    driftRate: number;
    avg_duration_ms: number | null;
  };
  recentRuns: Array<{
    id: string;
    sessionId: string;
    project: string;
    operation: string;
    started_at: string;
    duration_ms: number | null;
    outcome: string;
    outcome_source: string;
    headline: string | null;
    summary: string | null;
    raw_ref: string;
  }>;
  evalSuites: Array<{
    id: string;
    name: string;
    kind: string;
    description: string | null;
    judgments: number;
    passing: number;
    failing: number;
  }>;
  improvementSignals: Array<{ id: string; label: string; evidence: string; target: string }>;
};

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function outcomeTone(outcome: string) {
  if (outcome === "success") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
  if (outcome === "drifted") return "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
  if (outcome === "failed" || outcome === "dead_end") return "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300";
  return "bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400";
}

function AgentEvidencePanel({ agentId }: { agentId: string }) {
  const [evidence, setEvidence] = useState<AgentEvidence | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"runs" | "evals" | "improve">("runs");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/registry?agentEvidence=${encodeURIComponent(agentId)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
        setEvidence(body);
      })
      .catch((reason) => {
        if (reason?.name !== "AbortError") setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => controller.abort();
  }, [agentId]);

  if (error) return <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">{error}</p>;
  if (!evidence) return <p className="mt-3 animate-pulse text-xs text-zinc-400">Loading run and eval evidence…</p>;

  const stats = [
    ["Runs", evidence.summary.total],
    ["Success", percent(evidence.summary.successRate)],
    ["Drift", percent(evidence.summary.driftRate)],
    ["Unknown", evidence.summary.unknown],
  ];

  return (
    <section className="mt-6 border-t border-zinc-300 pt-4 dark:border-zinc-800">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">Evidence & evolution</h3>
          <p className="mt-1 text-xs text-zinc-500">{evidence.identity.sources.join(" · ")} sessions resolved to this system.</p>
        </div>
        <Link href="/ops/runs" className="rounded-lg border border-zinc-300 px-2.5 py-1.5 text-[10px] font-medium dark:border-zinc-700">All runs</Link>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-zinc-200 bg-card/70 px-2 py-2 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-base font-semibold">{value}</div>
            <div className="text-[9px] text-zinc-400">{label}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex gap-1 rounded-xl bg-zinc-200/70 p-1 dark:bg-zinc-900">
        {([
          ["runs", "Sessions"],
          ["evals", "Eval suites"],
          ["improve", "Improve"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
            className={`flex-1 rounded-lg px-2 py-2 text-[10px] font-medium transition ${tab === value ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-700 dark:text-white" : "text-zinc-500"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "runs" ? (
        <div className="mt-3 space-y-1.5">
          {evidence.recentRuns.map((run) => (
            <div key={run.id} className="rounded-xl border border-zinc-200 bg-card/70 p-3 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">{run.headline || run.operation || run.project || "Untitled session"}</p>
                  <p className="mt-1 truncate font-mono text-[9px] text-zinc-400">{run.project || "unknown project"} · {run.sessionId.slice(0, 8)}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] ${outcomeTone(run.outcome)}`}>{run.outcome}</span>
              </div>
              <p className="mt-2 text-[10px] text-zinc-400">{new Date(run.started_at).toLocaleString()} · {run.outcome_source}</p>
            </div>
          ))}
        </div>
      ) : null}

      {tab === "evals" ? (
        <div className="mt-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] text-zinc-500">Available evidence sets; execution is configured in Collections.</p>
            <Link href="/ops/activity?tab=collections" className="text-[10px] font-semibold text-sky-600 dark:text-sky-400">Open workspace →</Link>
          </div>
          <div className="space-y-1.5">
            {evidence.evalSuites.map((suite) => (
              <div key={suite.id} className="rounded-xl border border-zinc-200 bg-card/70 p-3 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium">{suite.name}</p>
                    <p className="mt-0.5 text-[9px] uppercase tracking-wide text-zinc-400">{suite.kind}</p>
                  </div>
                  <span className="font-mono text-[10px] text-zinc-400">{suite.judgments} cases</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                  <div className="h-full bg-emerald-400" style={{ width: `${suite.judgments ? (suite.passing / suite.judgments) * 100 : 0}%` }} />
                </div>
                <p className="mt-1 text-[9px] text-zinc-400">{suite.passing} passing labels · {suite.failing} failing labels</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {tab === "improve" ? (
        <div className="mt-3">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
            <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">Candidate changes require review</p>
            <p className="mt-1 text-[10px] leading-4 text-amber-700 dark:text-amber-300">These are evidence-backed starting points. The live config is never rewritten from this screen.</p>
          </div>
          <div className="mt-2 space-y-1.5">
            {evidence.improvementSignals.map((signal) => (
              <div key={signal.id} className="rounded-xl border border-zinc-200 bg-card/70 p-3 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium">{signal.label}</p>
                    <p className="mt-1 text-[10px] text-zinc-400">{signal.evidence}</p>
                  </div>
                  <span className="rounded-full border border-zinc-200 px-2 py-1 font-mono text-[9px] text-zinc-400 dark:border-zinc-700">{signal.target}</span>
                </div>
              </div>
            ))}
          </div>
          <Link href="/ops/activity?tab=collections" className="mt-3 block rounded-xl bg-zinc-950 px-3 py-3 text-center text-xs font-semibold text-white dark:bg-white dark:text-zinc-950">
            Build an evaluation set
          </Link>
        </div>
      ) : null}
    </section>
  );
}

function collectRelated(record: RegistryRecord, records: RegistryRecord[]): RelatedRecord[] {
  const byId = new Map(records.map((row) => [row.metadata.id, row]));
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const row of records) {
    for (const relation of row.spec.relations) {
      outgoing.set(row.metadata.id, [...(outgoing.get(row.metadata.id) || []), relation.target]);
      incoming.set(relation.target, [...(incoming.get(relation.target) || []), row.metadata.id]);
    }
  }

  const result = new Map<string, RelatedRecord>();
  function walk(direction: "uses" | "used-by", graph: Map<string, string[]>) {
    const queue = [{ id: record.metadata.id, via: [] as string[], depth: 0 }];
    const seen = new Set([record.metadata.id]);
    while (queue.length) {
      const current = queue.shift()!;
      if (current.depth >= 3) continue;
      for (const targetId of graph.get(current.id) || []) {
        if (seen.has(targetId)) continue;
        seen.add(targetId);
        const target = byId.get(targetId);
        if (!target) continue;
        const via = [...current.via, target.metadata.name];
        result.set(`${direction}:${targetId}`, { record: target, direction, via: via.slice(0, -1) });
        queue.push({ id: targetId, via, depth: current.depth + 1 });
      }
    }
  }
  walk("uses", outgoing);
  walk("used-by", incoming);
  return [...result.values()];
}

function RecordDrawer({ record, records, onClose, onSelect }: {
  record: RegistryRecord;
  records: RegistryRecord[];
  onClose: () => void;
  onSelect: (record: RegistryRecord) => void;
}) {
  const related = useMemo(() => collectRelated(record, records), [record, records]);
  const relatedGroups = useMemo(() => {
    const groups = new Map<RegistryKind, RelatedRecord[]>();
    for (const row of related) groups.set(row.record.kind, [...(groups.get(row.record.kind) || []), row]);
    return groups;
  }, [related]);
  const dependents = related.filter((row) => row.direction === "used-by");

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-zinc-950/45 backdrop-blur-sm" onClick={onClose}>
      <aside
        className="h-full w-full max-w-lg overflow-y-auto border-l border-zinc-200 bg-[#f7f5ef] p-4 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">{record.metadata.id}</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-white">{record.metadata.name}</h2>
            <div className="mt-2 flex items-center gap-2 text-[11px] text-zinc-500">
              <span className={`h-2 w-2 rounded-full ${statusTone(record.observed?.status || record.metadata.status)}`} />
              <span>{record.observed?.status || record.metadata.status}</span>
              <span>·</span>
              <span>{record.kind}</span>
              {record.metadata.version ? <><span>·</span><span>v{record.metadata.version}</span></> : null}
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-zinc-300 px-3 py-1 text-xs dark:border-zinc-700">Close</button>
        </div>

        {record.metadata.description ? (
          <p className="mt-5 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{record.metadata.description}</p>
        ) : null}

        {record.kind === "Agent" && (record.metadata.id === "agent:pi" || record.metadata.id === "agent:claude") ? (
          <AgentEvidencePanel agentId={record.metadata.id} />
        ) : null}

        <section className="mt-6 border-t border-zinc-300 pt-4 dark:border-zinc-800">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">Capabilities</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {record.spec.capabilities.length ? record.spec.capabilities.map((capability) => (
              <span key={capability} className="rounded-full border border-zinc-300 bg-card/70 px-2 py-1 font-mono text-[10px] dark:border-zinc-700 dark:bg-zinc-900">{capability}</span>
            )) : <span className="text-xs text-zinc-400">No explicit capabilities yet.</span>}
          </div>
        </section>

        <section className="mt-6 border-t border-zinc-300 pt-4 dark:border-zinc-800">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">Relationships</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Direct and inherited connections, followed up to three steps through runtimes and toolsets.
          </p>
          <div className="mt-3 space-y-4">
            {KIND_ORDER.filter((item) => relatedGroups.has(item)).map((item) => (
              <div key={item}>
                <div className="mb-1.5 flex items-center justify-between">
                  <h4 className="text-xs font-semibold">{item === "Agent" && record.kind !== "Agent" ? "Agents tied to this" : `${item}s`}</h4>
                  <span className="font-mono text-[10px] text-zinc-400">{relatedGroups.get(item)!.length}</span>
                </div>
                <div className="space-y-1.5">
                  {relatedGroups.get(item)!.map((row) => (
                    <button key={`${row.direction}:${row.record.metadata.id}`} type="button" onClick={() => onSelect(row.record)} className="flex w-full items-center justify-between rounded-xl border border-zinc-300 bg-card/70 px-3 py-2 text-left dark:border-zinc-800 dark:bg-zinc-900">
                      <span className="min-w-0">
                        <span className="text-[10px] text-zinc-400">{row.direction}{row.via.length ? ` · via ${row.via.join(" → ")}` : ""}</span>
                        <br/><span className="block truncate text-xs font-medium">{row.record.metadata.name}</span>
                      </span>
                      <span className="text-zinc-400">→</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {!related.length ? <p className="text-xs text-zinc-400">No resolved relationships yet.</p> : null}
          </div>
        </section>

        <section className="mt-6 border-t border-zinc-300 pt-4 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">Impact preview</h3>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700 dark:bg-amber-950 dark:text-amber-300">read-only</span>
          </div>
          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
            Changing this record may affect <strong>{dependents.length}</strong> registered {dependents.length === 1 ? "dependent" : "dependents"} within three relationship steps.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {dependents.map((row) => (
              <button key={`${row.direction}:${row.record.metadata.id}`} type="button" onClick={() => onSelect(row.record)} className="rounded-full border border-zinc-300 px-2 py-1 text-[10px] dark:border-zinc-700">{row.record.metadata.name}</button>
            ))}
          </div>
        </section>

        <section className="mt-6 border-t border-zinc-300 pt-4 dark:border-zinc-800">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">Authority</h3>
          <dl className="mt-2 grid grid-cols-[80px_1fr] gap-2 text-xs">
            <dt className="text-zinc-400">Adapter</dt><dd>{record.metadata.source.adapter}</dd>
            <dt className="text-zinc-400">Source</dt><dd className="break-all font-mono text-[10px]">{record.metadata.source.locator}</dd>
            <dt className="text-zinc-400">Observed</dt><dd>{record.metadata.source.observedAt ? new Date(record.metadata.source.observedAt).toLocaleString() : "unknown"}</dd>
          </dl>
        </section>
      </aside>
    </div>
  );
}

function AgentSystemsView({ records, onSelect }: { records: RegistryRecord[]; onSelect: (record: RegistryRecord) => void }) {
  const systems = ["agent:pi", "agent:claude"]
    .map((id) => records.find((record) => record.metadata.id === id))
    .filter((record): record is RegistryRecord => Boolean(record));

  return (
    <div data-active-kind="Agent" className="grid gap-3 lg:grid-cols-2">
      {systems.map((system) => {
        const related = collectRelated(system, records);
        const subagents = system.spec.relations
          .filter((relation) => relation.type === "contains" && relation.target.startsWith("agent:"))
          .map((relation) => records.find((record) => record.metadata.id === relation.target))
          .filter(Boolean);
        const count = (kind: RegistryKind) => new Set(related.filter((row) => row.record.kind === kind).map((row) => row.record.metadata.id)).size;
        return (
          <button
            key={system.metadata.id}
            type="button"
            data-registry-id={system.metadata.id}
            onClick={() => onSelect(system)}
            className="group overflow-hidden rounded-3xl border border-zinc-200 bg-card text-left shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className={`h-1.5 ${system.metadata.id === "agent:pi" ? "bg-sky-400" : "bg-orange-400"}`} />
            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">Primary agent system</p>
                  <h3 className="mt-1 text-2xl font-semibold tracking-tight">{system.metadata.name}</h3>
                </div>
                <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">live</span>
              </div>
              <p className="mt-3 min-h-12 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{system.metadata.description}</p>
              <div className="mt-4 grid grid-cols-4 gap-1.5">
                {[
                  ["Subagents", subagents.length],
                  ["Skills", count("Skill")],
                  ["Tools", count("Tool")],
                  ["Models", count("Model")],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-zinc-200 bg-zinc-50 px-2 py-2 text-center dark:border-zinc-800 dark:bg-zinc-900">
                    <div className="text-base font-semibold">{value}</div>
                    <div className="text-[9px] text-zinc-400">{label}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <p className="mb-1.5 text-[10px] uppercase tracking-wide text-zinc-400">Subagents</p>
                <div className="flex flex-wrap gap-1">
                  {subagents.slice(0, 8).map((record) => (
                    <span key={record!.metadata.id} className="rounded-full border border-zinc-200 px-2 py-1 text-[9px] dark:border-zinc-700">{record!.metadata.name}</span>
                  ))}
                  {subagents.length > 8 ? <span className="rounded-full border border-zinc-200 px-2 py-1 text-[9px] text-zinc-400 dark:border-zinc-700">+{subagents.length - 8}</span> : null}
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3 text-[10px] dark:border-zinc-800">
                <span className="font-mono text-zinc-400">{system.metadata.source.locator}</span>
                <span className="font-medium text-zinc-700 transition group-hover:translate-x-1 dark:text-zinc-200">Open system →</span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default function RegistryPanel() {
  const [data, setData] = useState<RegistryResponse | null>(null);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [kind, setKind] = useState<RegistryKind | "All">("All");
  const [selected, setSelected] = useState<RegistryRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [workflowTemplates, setWorkflowTemplates] = useState<WorkflowTemplate[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/registry${submittedQuery ? `?q=${encodeURIComponent(submittedQuery)}` : ""}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json() as RegistryResponse;
        if (!response.ok) throw new Error(body.warnings?.[0] || `HTTP ${response.status}`);
        setData(body);
        setError(null);
      })
      .catch((reason) => {
        if (reason?.name !== "AbortError") setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => controller.abort();
  }, [submittedQuery]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/workflows", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as { templates?: WorkflowTemplate[]; error?: string };
        if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
        setWorkflowTemplates(body.templates || []);
      })
      .catch((reason) => {
        if (reason?.name !== "AbortError") setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => controller.abort();
  }, []);

  const counts = useMemo(() => {
    const result = new Map<RegistryKind, number>();
    for (const record of data?.records || []) result.set(record.kind, (result.get(record.kind) || 0) + 1);
    return result;
  }, [data]);

  const visible = useMemo(() => {
    const records = data?.records || [];
    if (kind === "Agent") return [];
    return (kind === "All" ? records : records.filter((record) => record.kind === kind)).slice(0, 160);
  }, [data, kind]);

  function selectKind(nextKind: RegistryKind | "All") {
    setKind(nextKind);
    setSubmittedQuery("");
    setSelected(null);
  }

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[28px] border border-zinc-800 bg-[#11120f] text-[#f1f0e8] shadow-xl">
        <div className="relative px-4 py-6 sm:px-6 sm:py-8">
          <div className="absolute right-[-45px] top-[-55px] h-44 w-44 rounded-full border border-lime-300/15 bg-lime-300/5" />
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-lime-300">Capability registry · read model</p>
          <h1 className="mt-2 max-w-2xl text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">What do you need handled?</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Find a live handling path, then inspect its agents, skills, tools, models, workflows, lifecycle, and authority.
          </p>
          <form onSubmit={(event) => { event.preventDefault(); setSubmittedQuery(query.trim()); }} className="relative mt-5 flex gap-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="debug CI, research a company, write to the vault…"
              className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-lime-300"
            />
            <button type="submit" className="rounded-xl bg-lime-300 px-4 py-3 text-xs font-semibold text-zinc-950">Resolve</button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2">
            {["debug CI", "research", "vault notes", "coding", "planning"].map((example) => (
              <button key={example} type="button" onClick={() => { setQuery(example); setSubmittedQuery(example); }} className="rounded-full border border-zinc-700 px-2.5 py-1 text-[10px] text-zinc-400 hover:border-zinc-500 hover:text-zinc-200">{example}</button>
            ))}
          </div>
        </div>
      </section>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">{error}</div> : null}

      <section className="rounded-2xl border border-sky-200 bg-sky-50/70 p-3 dark:border-sky-900 dark:bg-sky-950/30">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-sky-600 dark:text-sky-400">Workflow registry</p>
            <h2 className="mt-0.5 text-lg font-semibold">Lifecycle templates</h2>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              Versioned stage flows used by Channels. Running tasks stay pinned to the version they started with.
            </p>
          </div>
          <Link
            href="/ops/config?tab=workflows"
            className="shrink-0 rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-700"
          >
            Build or modify
          </Link>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {workflowTemplates.map((template) => {
            const stages = Object.values(template.definition.states);
            const moduleCount = stages.reduce((total, stage) => total + (stage.modules?.length || 0), 0);
            return (
              <Link
                key={`${template.templateId}:${template.version}`}
                href="/ops/config?tab=workflows"
                className="rounded-xl border border-sky-200 bg-card/80 p-3 transition hover:border-sky-400 dark:border-sky-900 dark:bg-zinc-950/70"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{template.label}</p>
                    <p className="mt-0.5 font-mono text-[9px] text-zinc-400">{template.templateId} · v{template.version}</p>
                  </div>
                  <span className="rounded-full bg-sky-100 px-2 py-1 text-[9px] text-sky-700 dark:bg-sky-950 dark:text-sky-300">published</span>
                </div>
                <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-zinc-500">{template.description}</p>
                <div className="mt-2 flex items-center gap-2 font-mono text-[9px] text-zinc-400">
                  <span>{stages.length} stages</span>
                  <span>·</span>
                  <span>{moduleCount} modules</span>
                </div>
              </Link>
            );
          })}
          {!workflowTemplates.length ? (
            <p className="rounded-xl border border-dashed border-sky-200 p-3 text-xs text-zinc-400 dark:border-sky-900">
              Loading lifecycle templates…
            </p>
          ) : null}
        </div>
      </section>

      {submittedQuery && data?.paths.length ? (
        <section>
          <div className="mb-2 flex items-end justify-between gap-3">
            <div><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">Resolved paths</p><h2 className="text-lg font-semibold">Best routes for “{submittedQuery}”</h2></div>
            <span className="text-[10px] text-zinc-400">{data.paths.length} matches</span>
          </div>
          <div className="grid gap-2 lg:grid-cols-2">
            {data.paths.map((path, index) => (
              <button key={path.id} type="button" onClick={() => setSelected(path.entrypoint)} className="group rounded-2xl border border-zinc-200 bg-card p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex items-start gap-3">
                  <span className="font-mono text-xl text-zinc-300 dark:text-zinc-700">0{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${statusTone(path.availability)}`} /><span className="text-[10px] uppercase tracking-wide text-zinc-400">{path.availability}</span></div>
                    <p className="mt-1 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{path.label}</p>
                    <p className="mt-1 text-[10px] text-zinc-400">{path.matchedCapabilities.join(" · ") || "Matched by name and metadata"}</p>
                  </div>
                  <span className="text-zinc-300 transition group-hover:translate-x-1">→</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : submittedQuery && data ? (
        <p className="rounded-xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-800">No registered handling path matched “{submittedQuery}”. Browse the catalog below to inspect coverage.</p>
      ) : null}

      <section>
        <div className="flex items-end justify-between gap-3">
          <div><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">Browse registry</p><h2 className="text-lg font-semibold">{kind === "All" ? `${data?.records.length || 0} normalized records` : kind === "Agent" ? "2 primary agent systems" : `${counts.get(kind) || 0} ${kind.toLowerCase()} records`}</h2></div>
          <p className="text-right text-[10px] text-zinc-400">Snapshot {data ? new Date(data.generatedAt).toLocaleString() : "loading…"}</p>
        </div>
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-2">
          <button type="button" aria-pressed={kind === "All"} onClick={() => selectKind("All")} className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] ${kind === "All" ? "border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-zinc-950" : "border-zinc-300 dark:border-zinc-700"}`}>All {data?.records.length || 0}</button>
          {KIND_ORDER.filter((item) => counts.has(item)).map((item) => (
            <button key={item} type="button" aria-pressed={kind === item} onClick={() => selectKind(item)} className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] ${kind === item ? "border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-zinc-950" : "border-zinc-300 dark:border-zinc-700"}`}>{item} {item === "Agent" ? 2 : counts.get(item)}</button>
          ))}
        </div>
        {kind === "Agent" && data ? <AgentSystemsView records={data.records} onSelect={setSelected} /> : (
        <div key={kind} data-active-kind={kind} className="mt-2 divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 bg-card dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
          {visible.map((record) => (
            <button key={record.metadata.id} data-registry-id={record.metadata.id} type="button" onClick={() => setSelected(record)} className="grid w-full grid-cols-[1fr_auto] gap-3 px-3 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900">
              <div className="min-w-0">
                <div className="flex items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full ${statusTone(record.observed?.status || record.metadata.status)}`} /><span className="truncate text-xs font-medium">{record.metadata.name}</span></div>
                <p className="mt-1 truncate font-mono text-[9px] text-zinc-400">{record.metadata.id} · {record.metadata.source.adapter}</p>
              </div>
              <span data-registry-kind className="self-center rounded-full bg-zinc-100 px-2 py-1 text-[9px] text-zinc-500 dark:bg-zinc-900">{record.kind}</span>
            </button>
          ))}
        </div>
        )}
      </section>

      {selected && data ? <RecordDrawer record={selected} records={data.records} onClose={() => setSelected(null)} onSelect={setSelected} /> : null}
    </div>
  );
}
