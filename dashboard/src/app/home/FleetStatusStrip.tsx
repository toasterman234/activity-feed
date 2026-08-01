"use client";

import { useState } from "react";
import Link from "next/link";
import { useFleetSnapshot } from "./useFleetSnapshot";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Badge, StatusChip, type UiTone } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { FleetHost, FleetHostId } from "@/lib/fleet";

// ── helpers ──

function healthTone(h: FleetHost["health"]): UiTone {
  if (h === "healthy") return "good";
  if (h === "warn") return "wait";
  if (h === "cool") return "active";
  return "neutral";
}

function barColor(value: number): string {
  if (value >= 80) return "bg-red-500";
  if (value >= 60) return "bg-amber-500";
  if (value >= 35) return "bg-sky-500";
  return "bg-emerald-500";
}

// ── A single metric bar (label + Progress) ──

function FleetMetricBar({ label, value, suffix = "%" }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 shrink-0 text-[10px] text-muted-foreground tabular-nums text-right">
        {label}
      </span>
      <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", barColor(value))}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
      <span className="w-9 shrink-0 text-right text-[10px] text-muted-foreground tabular-nums">
        {value.toFixed(value < 10 ? 1 : 0)}{suffix}
      </span>
    </div>
  );
}

// ── Host detail sheet ──

function HostDetailSheet({
  host,
  open,
  onOpenChange,
  onRefresh,
}: {
  host: FleetHost;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh: () => void;
}) {
  const procs = host.processes ?? [];
  const ctns = host.containers ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto pt-14 pb-20">
        <SheetHeader className="px-0">
          <div className="flex items-center gap-2">
            <StatusChip tone={healthTone(host.health)}>{host.health}</StatusChip>
            <SheetTitle>{host.name}</SheetTitle>
          </div>
          <SheetDescription>{host.role} — {host.hostname}</SheetDescription>
        </SheetHeader>

        {/* Metric bars */}
        <div className="space-y-1.5 px-4">
          <FleetMetricBar label="CPU" value={host.cpu} />
          <FleetMetricBar label="Mem" value={host.memory} />
          <FleetMetricBar label="Disk" value={host.storage} />
          <div className="text-[10px] text-muted-foreground pt-0.5">
            Load avg: {host.load} · Transport: {host.transport}
          </div>
        </div>

        {/* Services */}
        {host.services.length > 0 && (
          <div className="px-4">
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Services
            </h4>
            <div className="flex flex-wrap gap-1">
              {host.services.map((s) => (
                <Badge key={s} variant="secondary" className="text-[10px]">
                  {s}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="px-4">
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            Actions
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {host.controls.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={async (e) => {
                  e.preventDefault();
                  try {
                    const res = await fetch("/api/fleet/action", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ hostId: host.id, action: c.action }),
                    });
                    const result = await res.json();
                    if (!res.ok || !result.ok) throw new Error(result?.error || "Failed");
                    if (result.kind === "url" && result.value) {
                      window.open(result.value, "_blank", "noopener,noreferrer");
                    } else if (result.kind === "command" && result.value) {
                      await navigator.clipboard?.writeText(result.value).catch(() => {});
                    }
                    onRefresh();
                  } catch {
                    // silently ignore
                  }
                }}
                className="rounded-md border border-border px-2 py-1 text-[10px] font-medium text-foreground hover:bg-muted/50 transition-colors"
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Processes table */}
        {procs.length > 0 && (
          <div className="px-4">
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Processes ({procs.length})
            </h4>
            <div className="rounded-md border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-[10px] w-12">PID</TableHead>
                    <TableHead className="text-[10px]">Command</TableHead>
                    <TableHead className="text-[10px] text-right w-14">CPU</TableHead>
                    <TableHead className="text-[10px] text-right w-14">Mem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {procs.map((p) => (
                    <TableRow key={p.pid} className="border-border/50">
                      <TableCell className="text-[10px] font-mono text-muted-foreground">{p.pid}</TableCell>
                      <TableCell className="text-[10px] font-mono truncate max-w-[180px]">{p.command}</TableCell>
                      <TableCell className="text-[10px] text-right tabular-nums">{p.cpuPct?.toFixed(1)}%</TableCell>
                      <TableCell className="text-[10px] text-right tabular-nums">{p.memPct?.toFixed(1)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Containers table */}
        {ctns.length > 0 && (
          <div className="px-4">
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Containers ({ctns.length})
            </h4>
            <div className="rounded-md border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-[10px]">Name</TableHead>
                    <TableHead className="text-[10px] text-right w-16">Status</TableHead>
                    <TableHead className="text-[10px] text-right w-14">CPU</TableHead>
                    <TableHead className="text-[10px] text-right w-14">Mem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ctns.map((c) => (
                    <TableRow key={c.name} className="border-border/50">
                      <TableCell className="text-[10px] font-mono truncate max-w-[160px]">{c.name}</TableCell>
                      <TableCell className="text-[10px] text-right">
                        <span
                          className={cn(
                            "inline-block rounded-full px-1.5 py-0.5 text-[9px] font-medium",
                            c.status === "running" || !c.status
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                              : c.status === "exited"
                                ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                                : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                          )}
                        >
                          {c.status || "running"}
                        </span>
                      </TableCell>
                      <TableCell className="text-[10px] text-right tabular-nums">
                        {c.cpuPct != null ? `${c.cpuPct.toFixed(1)}%` : "—"}
                      </TableCell>
                      <TableCell className="text-[10px] text-right tabular-nums">
                        {c.memPct != null ? `${c.memPct.toFixed(1)}%` : c.memUsage || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <SheetFooter>
          <Link
            href="/ops/fleet"
            className="text-center text-[11px] text-primary hover:underline"
          >
            Open full fleet page →
          </Link>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ── Fleet status strip ──

function FleetStatusStripInner() {
  const { mergedHosts, error, loading, data, refresh } = useFleetSnapshot();
  const [selectedHostId, setSelectedHostId] = useState<FleetHostId | null>(null);
  const selectedHost = mergedHosts.find((h) => h.id === selectedHostId) ?? null;

  const updatedText = data
    ? `updated ${new Date(data.generatedAt).toLocaleTimeString()}`
    : "connecting…";

  return (
    <section className="space-y-1.5">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Fleet
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-muted-foreground">{updatedText}</span>
          <button
            onClick={() => void refresh()}
            className="text-[10px] font-medium text-primary hover:underline"
          >
            Refresh
          </button>
          <Link
            href="/ops/fleet"
            className="text-[10px] text-muted-foreground hover:text-foreground"
          >
            Full fleet →
          </Link>
        </div>
      </div>

      {/* Skeleton */}
      {loading && !data && (
        <div className="rounded-xl border border-border bg-card px-3 py-3 space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="h-3 w-16 rounded bg-muted" />
              <div className="h-1.5 flex-1 rounded bg-muted" />
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && !data && (
        <div className="rounded-lg border border-amber-300/50 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Fleet offline: {error}
        </div>
      )}

      {/* Host rows */}
      {mergedHosts.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {mergedHosts.map((host, i) => (
            <button
              key={host.id}
              type="button"
              onClick={() => setSelectedHostId(host.id)}
              className={cn(
                "w-full px-3 py-2 text-left hover:bg-muted/40 transition-colors flex items-center gap-3 min-w-0",
                i !== 0 && "border-t border-border/50"
              )}
            >
              <StatusChip tone={healthTone(host.health)} className="shrink-0">
                {host.health}
              </StatusChip>
              <span className="text-sm font-semibold text-foreground shrink-0 w-20 truncate">
                {host.name}
              </span>
              <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:inline w-28 truncate">
                {host.role}
              </span>
              <div className="flex-1 hidden sm:grid grid-cols-3 gap-3 min-w-0">
                <FleetMetricBar label="CPU" value={host.cpu} />
                <FleetMetricBar label="Mem" value={host.memory} />
                <FleetMetricBar label="Disk" value={host.storage} />
              </div>
              <div className="flex-1 sm:hidden flex items-center gap-1 min-w-0">
                <span className="text-[9px] tabular-nums text-muted-foreground">
                  C{host.cpu.toFixed(0)} M{host.memory.toFixed(0)} D{host.storage.toFixed(0)}
                </span>
              </div>
              <span className="text-[9px] text-muted-foreground shrink-0">▸</span>
            </button>
          ))}
        </div>
      )}

      {/* Host detail sheet */}
      {selectedHost && (
        <HostDetailSheet
          host={selectedHost}
          open={!!selectedHost}
          onOpenChange={(open) => {
            if (!open) setSelectedHostId(null);
          }}
          onRefresh={() => void refresh()}
        />
      )}
    </section>
  );
}

export default function FleetStatusStrip() {
  return <FleetStatusStripInner />;
}
