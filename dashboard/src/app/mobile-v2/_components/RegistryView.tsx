"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import type { RegistryKind, RegistryRecord } from "@/lib/registry";
import { useV2Registry } from "../_hooks/useV2Registry";

const KIND_ORDER: RegistryKind[] = [
  "Agent", "Skill", "Tool", "Toolset", "Model",
  "Workflow", "Lifecycle", "Policy", "Runtime", "Service",
];

function statusDot(status: string) {
  if (status === "live" || status === "active") return "bg-emerald-400";
  if (status === "degraded" || status === "deprecated") return "bg-amber-400";
  if (status === "retired") return "bg-red-400";
  return "bg-zinc-400";
}

function RecordRow({ record, onSelect }: { record: RegistryRecord; onSelect: (r: RegistryRecord) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(record)}
      className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--muted)]"
    >
      <span className={`inline-block size-1.5 shrink-0 rounded-full ${statusDot(record.observed?.status || record.metadata.status)}`} />
      <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[var(--foreground)]">
        {record.metadata.name}
      </span>
      <span className="shrink-0 rounded-md border border-[var(--border)] bg-[var(--muted)] px-1.5 py-0.5 text-[9px] text-[var(--muted-foreground)]">
        {record.kind}
      </span>
    </button>
  );
}

function RecordDetail({ record, onClose }: { record: RegistryRecord; onClose: () => void }) {
  return (
    <div className="border-t border-[var(--border)] bg-[var(--muted)] px-3 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--muted-foreground)]">{record.metadata.id}</p>
          <h3 className="mt-0.5 text-sm font-semibold text-[var(--foreground)]">{record.metadata.name}</h3>
          <div className="mt-1 flex items-center gap-1.5 text-[10px] text-[var(--muted-foreground)]">
            <span className={`inline-block size-1.5 rounded-full ${statusDot(record.observed?.status || record.metadata.status)}`} />
            <span>{record.observed?.status || record.metadata.status}</span>
            <span>·</span>
            <span>{record.kind}</span>
            {record.metadata.version ? <><span>·</span><span>v{record.metadata.version}</span></> : null}
          </div>
        </div>
        <button onClick={onClose} className="shrink-0 rounded-md border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--muted-foreground)]">Close</button>
      </div>

      {record.metadata.description && (
        <p className="mt-2 text-[11px] leading-5 text-[var(--muted-foreground)]">{record.metadata.description}</p>
      )}

      {/* Capabilities */}
      {record.spec.capabilities.length > 0 && (
        <div className="mt-2">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Capabilities</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {record.spec.capabilities.map((c) => (
              <span key={c} className="rounded-md border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 text-[9px] text-[var(--foreground)]">{c}</span>
            ))}
          </div>
        </div>
      )}

      {/* Relations summary */}
      {record.spec.relations.length > 0 && (
        <div className="mt-2">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            Relations ({record.spec.relations.length})
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {record.spec.relations.slice(0, 12).map((rel, i) => (
              <span key={i} className="rounded-md border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 text-[9px] text-[var(--muted-foreground)]">
                {rel.type} → {rel.target.split(":").slice(1).join(":") || rel.target}
              </span>
            ))}
            {record.spec.relations.length > 12 && (
              <span className="px-1 text-[9px] text-[var(--muted-foreground)]">+{record.spec.relations.length - 12} more</span>
            )}
          </div>
        </div>
      )}

      {/* Source */}
      <div className="mt-2 flex gap-4 text-[9px] text-[var(--muted-foreground)]">
        <span>{record.metadata.source.adapter}</span>
        <span className="truncate font-mono">{record.metadata.source.locator}</span>
      </div>
    </div>
  );
}

export default function RegistryView() {
  const {
    data,
    error,
    query,
    setQuery,
    kind,
    counts,
    visible,
    submitSearch,
    selectKind,
  } = useV2Registry();
  const [selected, setSelected] = useState<RegistryRecord | null>(null);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-[var(--muted-foreground)]">Registry</p>
        <h2 className="mt-1 text-lg font-semibold text-[var(--foreground)]">Capability registry</h2>
        {data && (
          <p className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">
            {data.records.length} records · {new Date(data.generatedAt).toLocaleString()}
          </p>
        )}
      </div>

      {/* Search */}
      <form
        onSubmit={(e) => { e.preventDefault(); submitSearch(query); }}
        className="flex gap-1.5"
      >
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search registry…"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] py-2 pl-8 pr-3 text-[11px] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
          />
        </div>
        <button type="submit" className="shrink-0 rounded-lg bg-[var(--primary)] px-3 py-2 text-[11px] font-semibold text-white">
          Go
        </button>
      </form>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-600">{error}</div>
      )}

      {/* Kind pills */}
      <div className="flex flex-wrap gap-1">
        <button
          onClick={() => selectKind("All")}
          className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] transition ${
            kind === "All" ? "border-[var(--foreground)] bg-[var(--foreground)] text-[var(--card)]" : "border-[var(--border)] text-[var(--muted-foreground)]"
          }`}
        >
          All {data?.records.length || 0}
        </button>
        {KIND_ORDER.filter((k) => counts.has(k)).map((k) => (
          <button
            key={k}
            onClick={() => selectKind(k)}
            className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] transition ${
              kind === k ? "border-[var(--foreground)] bg-[var(--foreground)] text-[var(--card)]" : "border-[var(--border)] text-[var(--muted-foreground)]"
            }`}
          >
            {k} {counts.get(k)}
          </button>
        ))}
      </div>

      {/* Selected detail */}
      {selected && (
        <RecordDetail record={selected} onClose={() => setSelected(null)} />
      )}

      {/* Record list */}
      <div className="divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)]">
        {visible.map((record) => (
          <RecordRow key={record.metadata.id} record={record} onSelect={setSelected} />
        ))}
        {visible.length === 0 && !error && (
          <div className="px-3 py-8 text-center text-sm text-[var(--muted-foreground)]">
            {data ? "No matching records." : "Loading…"}
          </div>
        )}
      </div>
    </div>
  );
}
