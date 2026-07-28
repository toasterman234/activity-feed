"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { FLEET_HOSTS, safeCommandForHost, type FleetActionId, type FleetHost, type FleetSnapshot } from "@/lib/fleet";
import RegistryPanel from "./RegistryPanel";

type ControlMode = "observe" | "assist" | "operator";
type TelemetryMode = "snapshot" | "live" | "historical";
type Host = FleetHost;

const CONTROL_MODES: {
  key: ControlMode;
  label: string;
  title: string;
  description: string;
  badge: string;
}[] = [
  {
    key: "observe",
    label: "Observe",
    title: "Read-only by default",
    description: "Show health, load, services, and routing without exposing live control actions.",
    badge: "safe",
  },
  {
    key: "assist",
    label: "Assist",
    title: "Allowed with confirmation",
    description: "Let the page open approved surfaces and copy safe commands after a human confirm step.",
    badge: "practical",
  },
  {
    key: "operator",
    label: "Operator",
    title: "Full control surface",
    description: "Reserve stronger actions for later. The safe action rail stays live first.",
    badge: "power",
  },
];

const TELEMETRY_MODES: {
  key: TelemetryMode;
  label: string;
  title: string;
  description: string;
}[] = [
  {
    key: "snapshot",
    label: "Snapshot",
    title: "Quick state",
    description: "Fetch one compact point-in-time view with live host data.",
  },
  {
    key: "live",
    label: "Live",
    title: "Polling metrics",
    description: "Refresh periodically so the page can show current CPU, memory, disk, and load.",
  },
  {
    key: "historical",
    label: "History",
    title: "Trend view",
    description: "The shape is ready for history later; today it keeps the live snapshot visible.",
  },
];

function toneStyles(tone: Host["health"]) {
  switch (tone) {
    case "healthy":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300";
    case "warn":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300";
    case "cool":
      return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300";
    default:
      return "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300";
  }
}

function ControlPill({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide ${
        active
          ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
          : "border-zinc-200 bg-white text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
      }`}
    >
      {label}
    </span>
  );
}

function MetricBar({ label, value, suffix = "%" }: { label: string; value: number; suffix?: string }) {
  const color =
    value >= 80 ? "bg-red-500" : value >= 60 ? "bg-amber-500" : value >= 35 ? "bg-sky-500" : "bg-emerald-500";

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
        <span>{label}</span>
        <span className="font-mono text-zinc-700 dark:text-zinc-300">
          {value.toFixed(value < 10 ? 2 : 0)}
          {suffix}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
}

function formatPct(value?: number | null) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toFixed(value < 10 ? 2 : 0)}%`;
}

function DetailPanel({
  title,
  count,
  open,
  children,
}: {
  title: string;
  count: number;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={open}
      className="rounded-xl border border-zinc-200 bg-white/80 dark:border-zinc-800 dark:bg-zinc-900/50"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-[11px] font-medium text-zinc-700 dark:text-zinc-200">
        <span>{title}</span>
        <span className="font-mono text-[10px] text-zinc-400">{count}</span>
      </summary>
      <div className="space-y-2 border-t border-zinc-200 px-3 py-3 dark:border-zinc-800">{children}</div>
    </details>
  );
}

function DetailRow({
  title,
  meta,
  value,
}: {
  title: string;
  meta?: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 px-2 py-2 dark:border-zinc-800 dark:bg-zinc-950/50">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[11px] font-medium text-zinc-800 dark:text-zinc-200">{title}</div>
          {meta ? <div className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">{meta}</div> : null}
        </div>
        <div className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">{value}</div>
      </div>
    </div>
  );
}

function HostCard({
  host,
  mode,
  selected,
  onSelect,
  onAction,
}: {
  host: Host;
  mode: ControlMode;
  selected: boolean;
  onSelect: (hostId: string) => void;
  onAction: (hostId: string, action: FleetActionId, label: string) => Promise<void>;
}) {
  const isLive = mode !== "observe";
  const processes = (host.processes || []).slice(0, 5);
  const containers = (host.containers || []).slice(0, 5);

  return (
    <article
      className={`rounded-2xl border bg-white p-4 shadow-sm transition ${
        selected
          ? "border-zinc-900 ring-1 ring-zinc-900/10 dark:border-zinc-100 dark:ring-zinc-100/10"
          : "border-zinc-200 dark:border-zinc-800"
      } dark:bg-zinc-950`}
    >
      <button
        type="button"
        onClick={() => onSelect(host.id)}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">{host.shortName}</p>
          <h2 className="mt-0.5 text-base font-semibold text-zinc-900 dark:text-zinc-100">{host.name}</h2>
          <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">{host.role}</p>
        </div>
        <span className={`rounded-full border px-2 py-1 text-[10px] font-medium ${toneStyles(host.health)}`}>
          {host.health}
        </span>
      </button>

      <div className="mt-4 space-y-3">
        <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-2 dark:border-zinc-800 dark:bg-zinc-900/60">
            <div className="text-[10px] uppercase tracking-wide text-zinc-400">Hostname</div>
            <div className="mt-0.5 font-mono text-[11px] text-zinc-700 dark:text-zinc-300">{host.hostname}</div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-2 dark:border-zinc-800 dark:bg-zinc-900/60">
            <div className="text-[10px] uppercase tracking-wide text-zinc-400">Reachability</div>
            <div className="mt-0.5 font-mono text-[11px] text-zinc-700 dark:text-zinc-300">{host.ts}</div>
          </div>
        </div>

        <MetricBar label="CPU usage" value={host.cpu} />
        <MetricBar label="Memory usage" value={host.memory} />
        <MetricBar label="Disk usage" value={host.storage} />

        <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">Live notes</div>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-400">
              load {host.load.toFixed(2)}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-5 text-zinc-500 dark:text-zinc-400">{host.highlight}</p>
          {host.sourceLabel ? (
            <div className="mt-2 text-[10px] uppercase tracking-[0.18em] text-zinc-400">{host.sourceLabel}</div>
          ) : null}
        </div>

        <div>
          <div className="mb-1.5 text-[11px] font-medium text-zinc-700 dark:text-zinc-300">What runs here</div>
          <div className="flex flex-wrap gap-1.5">
            {host.services.map((service) => (
              <ControlPill key={service} label={service} active={selected} />
            ))}
          </div>
        </div>

        {(processes.length || containers.length) ? (
          <div className="space-y-2">
            {processes.length ? (
              <DetailPanel title="Top processes" count={host.processes?.length || processes.length} open={selected}>
                {processes.map((proc) => (
                  <DetailRow
                    key={`${proc.pid}-${proc.command}`}
                    title={proc.command}
                    meta={`pid ${proc.pid} · ppid ${proc.ppid}`}
                    value={`${formatPct(proc.cpuPct)} cpu · ${formatPct(proc.memPct)} mem`}
                  />
                ))}
              </DetailPanel>
            ) : null}
            {containers.length ? (
              <DetailPanel title="Top containers" count={host.containers?.length || containers.length} open={selected}>
                {containers.map((container) => (
                  <DetailRow
                    key={container.name}
                    title={container.name}
                    meta={`${container.status || "running"}${container.image ? ` · ${container.image}` : ""}`}
                    value={[
                      container.cpuPct == null ? "— cpu" : `${formatPct(container.cpuPct)} cpu`,
                      container.memPct == null ? "— mem" : `${formatPct(container.memPct)} mem`,
                    ].join(" · ")}
                  />
                ))}
              </DetailPanel>
            ) : null}
          </div>
        ) : null}

        <div>
          <div className="mb-1.5 text-[11px] font-medium text-zinc-700 dark:text-zinc-300">Controls</div>
          <div className="flex flex-wrap gap-2">
            {host.controls.map((control) => {
              const enabled = isLive && (control.level === "assist" || mode === "operator");
              return (
                <button
                  key={control.label}
                  type="button"
                  disabled={!enabled}
                  onClick={() => enabled && onAction(host.id, control.action, control.label)}
                  className={`rounded-lg border px-3 py-2 text-[11px] font-medium transition ${
                    enabled
                      ? "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      : "cursor-not-allowed border-dashed border-zinc-200 bg-zinc-50 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-600"
                  }`}
                >
                  {control.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </article>
  );
}

export default function FleetPage() {
  const [fleetView, setFleetView] = useState<"machines" | "registry">("machines");
  const [controlMode, setControlMode] = useState<ControlMode>("assist");
  const [telemetryMode, setTelemetryMode] = useState<TelemetryMode>("live");
  const [selectedHost, setSelectedHost] = useState("zima");
  const [statusLine, setStatusLine] = useState("Loading live fleet snapshot…");
  const [snapshot, setSnapshot] = useState<FleetSnapshot | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);

  const mergedHosts = useMemo(() => {
    const liveById = new Map((snapshot?.hosts || []).map((host) => [host.id, host]));
    return FLEET_HOSTS.map((host) => {
      const live = liveById.get(host.id);
      return live ? { ...host, ...live } : host;
    });
  }, [snapshot]);

  const activeHost = useMemo(
    () => mergedHosts.find((host) => host.id === selectedHost) ?? mergedHosts[0],
    [mergedHosts, selectedHost],
  );

  const recommendedHost = useMemo(() => {
    const candidates = mergedHosts.filter((host) => host.health !== "offline");
    return [...candidates].sort((a, b) => a.cpu + a.memory + a.load * 10 - (b.cpu + b.memory + b.load * 10))[0] ?? mergedHosts[0];
  }, [mergedHosts]);

  const recommendedCommand = useMemo(
    () => safeCommandForHost(recommendedHost.id, "open-session"),
    [recommendedHost.id],
  );
  const recommendedSessionCommand = recommendedCommand.kind === "command" ? recommendedCommand.value : "";

  async function loadSnapshot(reason: "snapshot" | "poll" = "snapshot") {
    try {
      const res = await fetch("/api/fleet", { cache: "no-store" });
      const data = (await res.json()) as FleetSnapshot;
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setSnapshot(data);
      setSnapshotError(null);
      setStatusLine(
        reason === "poll"
          ? `Live fleet snapshot updated at ${new Date(data.generatedAt).toLocaleTimeString()}.`
          : `Loaded fleet snapshot from ${new Date(data.generatedAt).toLocaleTimeString()}.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSnapshotError(message);
      setStatusLine(`Fleet telemetry unavailable right now: ${message}`);
    }
  }

  async function runAction(hostId: string, action: FleetActionId, label: string) {
    setStatusLine(`Running ${label.toLowerCase()} for ${hostId}…`);
    try {
      const res = await fetch("/api/fleet/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hostId, action }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      if (data.kind === "snapshot") {
        setSnapshot(data.snapshot as FleetSnapshot);
        setStatusLine(data.message || `Refreshed ${hostId}.`);
        return;
      }
      if (data.kind === "url" && data.value) {
        window.open(data.value, "_blank", "noopener,noreferrer");
        setStatusLine(data.message || `Opened ${label.toLowerCase()}.`);
        return;
      }
      if (data.kind === "command" && data.value) {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(data.value).catch(() => {});
        }
        setStatusLine(`${data.message || "Copied command."} ${data.value}`);
        return;
      }
      setStatusLine(data.message || `${label} completed.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusLine(`Action failed: ${message}`);
    }
  }

  useEffect(() => {
    void loadSnapshot(telemetryMode === "live" ? "poll" : "snapshot");
    if (telemetryMode !== "live") return;
    const timer = window.setInterval(() => {
      void loadSnapshot("poll");
    }, 15000);
    return () => window.clearInterval(timer);
  }, [telemetryMode]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(228,228,231,0.75),_rgba(250,250,250,1)_36%,_rgba(244,244,245,1)_100%)] pb-16 dark:bg-[radial-gradient(circle_at_top,_rgba(39,39,42,0.6),_rgba(9,9,11,1)_40%,_rgba(9,9,11,1)_100%)]">
      <div className="mx-auto max-w-6xl space-y-4 px-3 py-3 pt-[env(safe-area-inset-top,0px)]">
        <nav className="sticky top-2 z-20 mx-auto flex w-fit rounded-full border border-zinc-300 bg-white/90 p-1 shadow-sm backdrop-blur dark:border-zinc-700 dark:bg-zinc-950/90" aria-label="Fleet views">
          <button type="button" onClick={() => setFleetView("machines")} className={`rounded-full px-4 py-2 text-[11px] font-medium ${fleetView === "machines" ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950" : "text-zinc-500"}`}>Machines</button>
          <button type="button" onClick={() => setFleetView("registry")} className={`rounded-full px-4 py-2 text-[11px] font-medium ${fleetView === "registry" ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950" : "text-zinc-500"}`}>Registry</button>
        </nav>
        {fleetView === "registry" ? <RegistryPanel /> : <>
        <header className="overflow-hidden rounded-3xl border border-zinc-200 bg-zinc-950 text-zinc-50 shadow-lg shadow-zinc-950/10 dark:border-zinc-800">
          <div className="bg-gradient-to-r from-zinc-950 via-zinc-900 to-slate-900 px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="max-w-2xl">
                <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-zinc-400">Fleet control</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                  One screen for Mac, Zima, and OVH
                </h1>
                <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-300">
                  A control room for unified compute and agent sessions. It answers three questions at a glance:
                  where the load is, what is running, and what is safe to do next.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-[10px] font-medium">
                <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-emerald-200">
                  Tailnet only
                </span>
                <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-sky-200">
                  Live metrics
                </span>
                <span className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-zinc-300">
                  Safe actions first
                </span>
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-4">
              <div className="rounded-2xl border border-zinc-700/80 bg-white/5 p-3">
                <div className="text-[10px] uppercase tracking-wide text-zinc-400">Selected host</div>
                <div className="mt-1 text-lg font-semibold text-white">{activeHost.name}</div>
                <div className="mt-0.5 text-[11px] text-zinc-400">{activeHost.role}</div>
              </div>
              <div className="rounded-2xl border border-zinc-700/80 bg-white/5 p-3">
                <div className="text-[10px] uppercase tracking-wide text-zinc-400">Control mode</div>
                <div className="mt-1 text-lg font-semibold text-white">
                  {CONTROL_MODES.find((mode) => mode.key === controlMode)?.title}
                </div>
                <div className="mt-0.5 text-[11px] text-zinc-400">
                  {controlMode === "observe" ? "Read-only" : controlMode === "assist" ? "Confirm first" : "Operator access"}
                </div>
              </div>
              <div className="rounded-2xl border border-zinc-700/80 bg-white/5 p-3">
                <div className="text-[10px] uppercase tracking-wide text-zinc-400">Telemetry</div>
                <div className="mt-1 text-lg font-semibold text-white">
                  {TELEMETRY_MODES.find((mode) => mode.key === telemetryMode)?.title}
                </div>
                <div className="mt-0.5 text-[11px] text-zinc-400">
                  {snapshot ? `Updated ${new Date(snapshot.generatedAt).toLocaleTimeString()}` : "Waiting for live data."}
                </div>
              </div>
              <div className="rounded-2xl border border-zinc-700/80 bg-white/5 p-3">
                <div className="text-[10px] uppercase tracking-wide text-zinc-400">Current hint</div>
                <div className="mt-1 text-[11px] leading-5 text-zinc-300">{statusLine}</div>
              </div>
            </div>
            {snapshotError ? (
              <div className="mt-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] leading-5 text-amber-100">
                Telemetry bridge issue: {snapshotError}
              </div>
            ) : null}
          </div>
        </header>

        <section className="grid gap-3 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">How much power should this page have?</h2>
                <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                  The safety model stays visible even while the data becomes live.
                </p>
              </div>
              <Link href="/ops/config?tab=perf" className="text-[10px] font-medium text-blue-600 dark:text-blue-400">
                Perf
              </Link>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {CONTROL_MODES.map((mode) => {
                const active = controlMode === mode.key;
                return (
                  <button
                    key={mode.key}
                    type="button"
                    onClick={() => {
                      setControlMode(mode.key);
                      setStatusLine(`Control mode set to ${mode.label.toLowerCase()}.`);
                    }}
                    className={`rounded-2xl border p-3 text-left transition ${
                      active
                        ? "border-zinc-900 bg-zinc-950 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                        : "border-zinc-200 bg-zinc-50/80 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-medium uppercase tracking-[0.2em] opacity-70">{mode.badge}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] ${active ? "border-current" : "border-current/20"}`}>
                        {mode.label}
                      </span>
                    </div>
                    <div className="mt-2 text-sm font-semibold">{mode.title}</div>
                    <p className="mt-1 text-[11px] leading-5 opacity-80">{mode.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Telemetry options</h2>
                <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                  Choose whether the snapshot refreshes once, polls live, or simply stays in the same shape for later history.
                </p>
              </div>
              <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">live</span>
            </div>
            <div className="mt-3 space-y-2">
              {TELEMETRY_MODES.map((mode) => {
                const active = telemetryMode === mode.key;
                return (
                  <button
                    key={mode.key}
                    type="button"
                    onClick={() => {
                      setTelemetryMode(mode.key);
                      setStatusLine(`Telemetry switched to ${mode.label.toLowerCase()}.`);
                    }}
                    className={`w-full rounded-2xl border px-3 py-2 text-left transition ${
                      active
                        ? "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-100"
                        : "border-zinc-200 bg-zinc-50/70 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold">{mode.title}</div>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] ${active ? "border-current" : "border-current/20"}`}>
                        {mode.label}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-5 opacity-80">{mode.description}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">What the page shows</h2>
              <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                The live snapshot now fills in the numbers instead of the old mock values.
              </p>
            </div>
            <Link href="/ops/config" className="text-[10px] font-medium text-blue-600 dark:text-blue-400">
              Config
            </Link>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {[
              ["Identity", "Hostname, tailnet IP, reachability, and role."],
              ["Usage", "CPU, memory, disk, load average, and recent pressure."],
              ["Running", "Herdr, Cronicle, workers, and any attached sessions."],
              ["Actions", "Open shell, attach sessions, inspect, or jump to services."],
              ["Recent", "Last snapshot, load change, and why a host was chosen."],
              ["Safety", "Confirm steps, auth scope, and whether control is read-only."],
              ["Policy", "Per-host permissions and host-specific deny lists."],
              ["Notes", "Why this machine is preferred or avoided right now."],
            ].map(([title, body]) => (
              <div key={title} className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
                <div className="text-[11px] font-semibold text-zinc-800 dark:text-zinc-200">{title}</div>
                <p className="mt-1 text-[11px] leading-5 text-zinc-500 dark:text-zinc-400">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Machines</h2>
              <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                Pick the machine to inspect or control. The selected one gets the strongest border.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <ControlPill label="Mac" active={selectedHost === "mac"} />
              <ControlPill label="Zima" active={selectedHost === "zima"} />
              <ControlPill label="OVH" active={selectedHost === "ovh"} />
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-3">
            {mergedHosts.map((host) => (
              <HostCard
                key={host.id}
                host={host}
                mode={controlMode}
                selected={selectedHost === host.id}
                onSelect={setSelectedHost}
                onAction={runAction}
              />
            ))}
          </div>
        </section>

        <section className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Enablement options</h2>
                <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                  The safest path from prototype to something you can trust day to day.
                </p>
              </div>
              <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">safety</span>
            </div>
            <div className="mt-3 space-y-2">
              {[
                {
                  title: "Read-only by default",
                  body: "Show live usage, services, and routing without any command surface.",
                },
                {
                  title: "Tailnet-only actions",
                  body: "Allow actions only when the app is on the private tailnet and a human confirm is present.",
                },
                {
                  title: "Per-host permissions",
                  body: "Let the Mac support lighter actions while Zima and OVH keep stronger controls.",
                },
                {
                  title: "Two-step destructive actions",
                  body: "Restart, reboot, and service control should require one click to arm and a second to execute.",
                },
              ].map((item) => (
                <div key={item.title} className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
                  <div className="text-[11px] font-semibold text-zinc-800 dark:text-zinc-200">{item.title}</div>
                  <p className="mt-1 text-[11px] leading-5 text-zinc-500 dark:text-zinc-400">{item.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-zinc-950 p-4 text-zinc-50 shadow-sm dark:border-zinc-800">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-white">Safe action rail</h2>
                <p className="mt-0.5 text-[11px] text-zinc-400">Refresh, open, and copy safe commands first.</p>
              </div>
              <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] font-medium text-zinc-300">
                {activeHost.shortName}
              </span>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {[
                {
                  title: "Observe",
                  body: "Refresh host health and show a compact summary for each machine.",
                },
                {
                  title: "Monitor",
                  body: "Track CPU, memory, storage, load average, and current services.",
                },
                {
                  title: "Control",
                  body: "Open shell, attach herdr, inspect metrics, or jump to the right service.",
                },
                {
                  title: "Explain",
                  body: "Show why the launcher picked a host and what it avoided.",
                },
              ].map((item) => (
                <div key={item.title} className="rounded-2xl border border-zinc-800 bg-white/5 p-3">
                  <div className="text-[11px] font-semibold text-white">{item.title}</div>
                  <p className="mt-1 text-[11px] leading-5 text-zinc-400">{item.body}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-400">Latest message</div>
              <div className="mt-2 text-sm leading-6 text-zinc-200">{statusLine}</div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setStatusLine("Read-only monitoring is the safe default. The page uses live snapshots but keeps the action rail safe-first.")}
                className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-[11px] font-medium text-zinc-200 hover:bg-zinc-800"
              >
                Recommend read-only
              </button>
              <button
                type="button"
                onClick={() => setStatusLine("Tailnet-only plus confirm gives you useful control without making the page too risky.")}
                className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-[11px] font-medium text-zinc-200 hover:bg-zinc-800"
              >
                Recommend assist mode
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Load routing</h2>
                <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                  The next interactive session should land on the lightest box first.
                </p>
              </div>
              <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">balanced</span>
            </div>
            <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
              <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-400">Recommended next target</div>
              <div className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">{recommendedHost.name}</div>
              <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                {recommendedHost.highlight}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => runAction(recommendedHost.id, "open-session", "Route next session")}
                  className="rounded-xl border border-zinc-900 bg-zinc-950 px-3 py-2 text-[11px] font-medium text-white hover:bg-zinc-800 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  Route next session here
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (recommendedSessionCommand && navigator.clipboard?.writeText) {
                      await navigator.clipboard.writeText(recommendedSessionCommand).catch(() => {});
                    }
                    setStatusLine(`Copied recommended session command: ${recommendedSessionCommand}`);
                  }}
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  Copy session command
                </button>
              </div>
            </div>
          </div>
        </section>
        </>}
      </div>
    </div>
  );
}
