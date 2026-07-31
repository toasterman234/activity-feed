import os from "os";
import { execFileNoStdin } from "@/lib/execFileNoStdin";
import {
  FLEET_HOSTS,
  type FleetContainer,
  type FleetHost,
  type FleetHostId,
  type FleetHealth,
  type FleetProcess,
  type FleetSnapshot,
} from "./fleet";

const FLEET_METRICS_URLS = {
  mac: process.env.MAC_FLEET_METRICS_URL || "http://100.71.118.10:18190/mac/resources",
  zima: process.env.ZIMA_FLEET_METRICS_URL || "http://100.71.118.10:18190/zima/resources",
} as const;

const FLEET_TIMEOUT_MS = {
  mac: Number(process.env.MAC_FLEET_TIMEOUT_MS || 5000),
  zima: Number(process.env.ZIMA_FLEET_TIMEOUT_MS || 5000),
} as const;

type RemotePayload = {
  ok?: boolean;
  host?: string;
  generated_epoch?: number;
  load?: number[];
  cpus?: number;
  load_pct?: number;
  cpu_pct?: number;
  uptime_seconds?: number;
  uptime?: string;
  mem_pct?: number;
  mem?: { total_mb?: number; used_mb?: number; available_mb?: number };
  disks?: { mount?: string; use_pct?: string; used?: string; size?: string; avail?: string }[];
  processes?: Array<{ pid?: number; ppid?: number; cpu_pct?: number; mem_pct?: number; command?: string }>;
  containers?: Array<{
    name?: string;
    status?: string;
    image?: string;
    cpu_pct?: number;
    mem_pct?: number;
    mem_usage?: string;
    stack?: string;
    unhealthy?: boolean;
  }>;
  container_count?: number;
  unhealthy_count?: number;
  stacks?: { stack: string; count: number; unhealthy: number }[];
  services?: string[];
  error?: string;
};

type LocalDisk = {
  mount: string;
  used: string;
  size: string;
  avail: string;
  usePct: number | null;
};

type HostStats = {
  cpu: number;
  memory: number;
  storage: number;
  load: number;
  health: FleetHealth;
  highlight: string;
  source: string;
  sourceLabel: string;
  updatedAt: string;
  services: string[];
};

function parsePct(value: string | number | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const match = value.match(/([0-9.]+)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDiskRow(line: string): LocalDisk | null {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 6) return null;
  const usePct = parsePct(parts[4]);
  if (usePct == null) return null;
  return {
    mount: parts[5] || "",
    size: parts[1] || "",
    used: parts[2] || "",
    avail: parts[3] || "",
    usePct,
  };
}

function parseProcessRow(line: string): FleetProcess | null {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 5) return null;
  const pid = Number(parts[0]);
  const ppid = Number(parts[1]);
  const cpuPct = Number(parts[2]);
  const memPct = Number(parts[3]);
  if (![pid, ppid, cpuPct, memPct].every(Number.isFinite)) return null;
  return {
    pid,
    ppid,
    cpuPct: Number(cpuPct.toFixed(1)),
    memPct: Number(memPct.toFixed(1)),
    command: parts.slice(4).join(" "),
  };
}

function pickDiskUsage(diskList: Array<LocalDisk | null>) {
  const disks = diskList.filter(Boolean) as LocalDisk[];
  const preferred =
    disks.find((disk) => disk.mount === "/DATA") ??
    disks.find((disk) => disk.mount === "/System/Volumes/Data") ??
    disks[0];
  return preferred ? preferred.usePct ?? 0 : 0;
}

function parseContainerStatsRow(line: string) {
  const parts = line.split("|");
  if (!parts[0]) return null;
  return {
    name: parts[0],
    cpuPct: parsePct(parts[1]),
    memPct: parsePct(parts[2]),
    memUsage: parts[3] || "",
  };
}

function normalizeProcess(proc: RemotePayload["processes"][number]): FleetProcess {
  return {
    pid: Number(proc?.pid || 0),
    ppid: Number(proc?.ppid || 0),
    cpuPct: Number((Number(proc?.cpu_pct || 0)).toFixed(1)),
    memPct: Number((Number(proc?.mem_pct || 0)).toFixed(1)),
    command: String(proc?.command || ""),
  };
}

function normalizeContainer(container: RemotePayload["containers"][number]): FleetContainer {
  return {
    name: String(container?.name || ""),
    status: String(container?.status || ""),
    image: String(container?.image || ""),
    cpuPct: typeof container?.cpu_pct === "number" ? container.cpu_pct : null,
    memPct: typeof container?.mem_pct === "number" ? container.mem_pct : null,
    memUsage: String(container?.mem_usage || ""),
    stack: String(container?.stack || ""),
    unhealthy: Boolean(container?.unhealthy),
  };
}

function formatHighlight(host: FleetHost, stats: HostStats) {
  const parts = [];
  if (stats.health === "healthy" || stats.health === "cool") {
    parts.push("Live and reachable");
  } else if (stats.health === "warn") {
    parts.push("Reachable but busy");
  } else {
    parts.push("Offline or unreachable");
  }
  if (stats.load >= 1) parts.push(`load ${stats.load.toFixed(2)}`);
  if (stats.memory >= 80) parts.push(`memory ${stats.memory}%`);
  if (stats.storage >= 90) parts.push(`disk ${stats.storage}%`);
  parts.push(host.services.slice(0, 2).join(", "));
  return parts.join(" · ");
}

function computeHealth(cpu: number, memory: number, storage: number, load: number, reachable: boolean): FleetHealth {
  if (!reachable) return "offline";
  if (storage >= 90 || memory >= 92 || cpu >= 95 || load >= 4) return "warn";
  if (storage >= 75 || memory >= 75 || cpu >= 65 || load >= 2) return "cool";
  return "healthy";
}

async function fetchJson(url: string, timeoutMs = 5000): Promise<RemotePayload | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
        headers: { accept: "application/json" },
      });
      if (!res.ok) return null;
      return (await res.json()) as RemotePayload;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

function mergeContainers(
  base: Array<{ name?: string; status?: string; image?: string; stack?: string; unhealthy?: boolean }>,
  stats: Array<{ name: string; cpuPct: number | null; memPct: number | null; memUsage: string }>,
): FleetContainer[] {
  const statsByName = new Map(stats.map((row) => [row.name, row]));
  return base.map((row) => {
    const stat = statsByName.get(row.name || "");
    return {
      name: row.name || "",
      status: row.status,
      image: row.image,
      stack: row.stack,
      unhealthy: row.unhealthy,
      cpuPct: stat?.cpuPct ?? null,
      memPct: stat?.memPct ?? null,
      memUsage: stat?.memUsage || "",
    };
  });
}

function formatHostStats(host: FleetHost, stats: HostStats): FleetHost {
  return {
    ...host,
    ...stats,
    controls: host.controls,
    services: stats.services.length ? stats.services : host.services,
  };
}

async function readLocalProcessAndContainerData() {
  try {
    const probe = await execFileNoStdin(
      "sh",
      [
        "-lc",
        [
          "echo '=PROCS='",
          "ps -ax -o pid= -o ppid= -o pcpu= -o pmem= -o comm= 2>/dev/null | sort -k3 -nr | head -n 12",
          "echo '=CONTAINERS='",
          "if command -v docker >/dev/null 2>&1; then docker ps --format '{{.Names}}|{{.Status}}|{{.Image}}' 2>/dev/null; fi",
        ].join("; "),
      ],
      { timeout: 1500, maxBuffer: 128 * 1024 },
    );

    let section: "PROCS" | "CONTAINERS" | null = null;
    const processes: FleetProcess[] = [];
    const containers: Array<{ name?: string; status?: string; image?: string; stack?: string; unhealthy?: boolean }> = [];

    for (const rawLine of probe.stdout.split("\n")) {
      const line = rawLine.trimEnd();
      if (!line) continue;
      if (line === "=PROCS=" || line === "=CONTAINERS=") {
        section = line.slice(1, -1) as typeof section;
        continue;
      }
      if (section === "PROCS") {
        const parsed = parseProcessRow(line);
        if (parsed) processes.push(parsed);
        continue;
      }
      if (section === "CONTAINERS") {
        const [name, status = "", image = ""] = line.split("|");
        if (!name) continue;
        containers.push({
          name,
          status,
          image,
          stack: name.split("-")[0] || name,
          unhealthy: status.toLowerCase().includes("unhealthy"),
        });
        continue;
      }
    }

    return {
      processes,
      containers: mergeContainers(containers, []),
    };
  } catch {
    return { processes: [], containers: [] };
  }
}

async function readOvhMetrics(host: FleetHost): Promise<FleetHost> {
  const load = os.loadavg();
  const cpus = Math.max(1, os.cpus().length || 1);
  const cpu = Math.round((load[0] / cpus) * 100);
  const memory = Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100);
  const uptimeHours = Math.floor(os.uptime() / 3600);
  const uptime = uptimeHours >= 24 ? `${Math.floor(uptimeHours / 24)}d ${uptimeHours % 24}h` : `${uptimeHours}h`;

  const { processes, containers } = await readLocalProcessAndContainerData();
  const diskProbe = await execFileNoStdin("df", ["-Ph", "/"], { timeout: 3000, maxBuffer: 64 * 1024 });
  const diskRow = diskProbe.stdout.split("\n").map(parseDiskRow).find(Boolean) as LocalDisk | undefined;
  const storage = diskRow?.usePct ?? 0;
  const health = computeHealth(cpu, memory, storage, load[0], true);
  const stacks = new Map<string, { stack: string; count: number; unhealthy: number }>();
  for (const container of containers) {
    const stack = container.stack || container.name.split("-")[0] || container.name;
    const row = stacks.get(stack) || { stack, count: 0, unhealthy: 0 };
    row.count += 1;
    if (container.unhealthy) row.unhealthy += 1;
    stacks.set(stack, row);
  }
  const stats: HostStats = {
    cpu,
    memory,
    storage,
    load: load[0],
    health,
    highlight: formatHighlight(host, {
      cpu,
      memory,
      storage,
      load: load[0],
      health,
      highlight: "",
      source: "local",
      sourceLabel: "local",
      updatedAt: new Date().toISOString(),
      services: host.services,
    }),
    source: "local",
    sourceLabel: "OVH-local",
    updatedAt: new Date().toISOString(),
    services: host.services,
  };

  return formatHostStats(
    {
      ...host,
      processes,
      containers,
      containerCount: containers.length,
      unhealthyCount: containers.filter((container) => container.unhealthy).length,
      stacks: [...stacks.values()].sort((a, b) => b.count - a.count || a.stack.localeCompare(b.stack)),
    },
    stats,
  );
}

async function readRemoteMetrics(host: FleetHost, url: string, timeoutMs = 5000): Promise<FleetHost> {
  const payload = await fetchJson(url, timeoutMs);
  if (!payload || payload.ok === false) {
    return {
      ...host,
      cpu: 0,
      memory: 0,
      storage: 0,
      load: 0,
      health: "offline",
      highlight: payload?.error ? `Telemetry bridge error · ${payload.error}` : "Telemetry bridge unreachable",
      source: "bridge",
      sourceLabel: url,
      updatedAt: new Date().toISOString(),
    };
  }

  const load = Array.isArray(payload.load) && payload.load.length > 0 ? Number(payload.load[0] || 0) : 0;
  const cpu = Number(payload.cpu_pct ?? payload.load_pct ?? 0) || 0;
  const memory = Number(payload.mem_pct ?? 0) || 0;
  const storage = pickDiskUsage((payload.disks || []).map((disk) => ({
    mount: String(disk.mount || ""),
    used: String(disk.used || ""),
    size: String(disk.size || ""),
    avail: String(disk.avail || ""),
    usePct: parsePct(disk.use_pct),
  })));
  const serviceSummary = (payload.services || []).slice(0, 5);
  const processes = (payload.processes || []).slice(0, 12).map(normalizeProcess);
  const containers = (payload.containers || []).map(normalizeContainer);
  const health = computeHealth(cpu, memory, storage, load, true);
  const stacks = Array.isArray(payload.stacks)
    ? payload.stacks
        .map((stack) => ({
          stack: String(stack.stack || ""),
          count: Number(stack.count || 0),
          unhealthy: Number(stack.unhealthy || 0),
        }))
        .filter((stack) => stack.stack)
        .slice(0, 12)
    : [];

  const stats: HostStats = {
    cpu,
    memory,
    storage,
    load,
    health,
    highlight: formatHighlight(host, {
      cpu,
      memory,
      storage,
      load,
      health,
      highlight: "",
      source: "bridge",
      sourceLabel: url,
      updatedAt: new Date().toISOString(),
      services: serviceSummary.length ? serviceSummary : host.services,
    }),
    source: "bridge",
    sourceLabel: url,
    updatedAt: new Date().toISOString(),
    services: serviceSummary.length ? serviceSummary : host.services,
  };

  return formatHostStats(
    {
      ...host,
      processes,
      containers,
      containerCount: payload.container_count ?? containers.length,
      unhealthyCount: payload.unhealthy_count ?? containers.filter((container) => container.unhealthy).length,
      stacks,
    },
    stats,
  );
}

const DAGU_URLS: Record<string, string> = {
  mac: process.env.MAC_DAGU_URL || "http://100.71.118.10:8091/api/v1",
  zima: process.env.ZIMA_DAGU_URL || "http://100.99.174.29:8093/api/v1",
  ovh: process.env.OVH_DAGU_URL || "http://127.0.0.1:8090/api/v1",
};

const DAGU_AUTH: Record<string, { username: string; password: string } | undefined> = {
  mac: undefined,
  zima: { username: "ben", password: "n9Vx7KpL3mQwRtYfJcBgDh2Za4Es5UuT" },
  ovh: { username: "ben", password: "n9Vx7KpL3mQwRtYfJcBgDh2Za4Es5UuT" },
};

const DAGU_TIMEOUT_MS = Number(process.env.FLEET_DAGU_TIMEOUT_MS || 1200);

async function fetchDaguDags(url: string, auth?: { username: string; password: string }) {
  try {
    const headers: Record<string, string> = { accept: "application/json" };
    if (auth) {
      headers.authorization = "Basic " + Buffer.from(`${auth.username}:${auth.password}`).toString("base64");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DAGU_TIMEOUT_MS);
    try {
      const res = await fetch(url + "/dags?limit=50", { signal: controller.signal, headers });
      if (!res.ok) return null;
      const data = await res.json();
      const dags = data.dags || data || [];
      const names = Array.isArray(dags)
        ? dags.filter((d: unknown) => typeof (d as Record<string, unknown>).name === "string").map((d: Record<string, unknown>) => d.name)
        : [];
      return { names: names as string[], count: names.length };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

export async function buildFleetSnapshot(): Promise<FleetSnapshot> {
  const baseById = new Map(FLEET_HOSTS.map((host) => [host.id, host]));
  const [ovh, mac, zima] = await Promise.all([
    readOvhMetrics(baseById.get("ovh")!),
    readRemoteMetrics(baseById.get("mac")!, FLEET_METRICS_URLS.mac, FLEET_TIMEOUT_MS.mac),
    readRemoteMetrics(baseById.get("zima")!, FLEET_METRICS_URLS.zima, FLEET_TIMEOUT_MS.zima),
  ]);
  const hosts = [mac, zima, ovh];
  // Enrich with live Dagu DAG counts (merge into static URLs, don't replace)
  const enriched = await Promise.all(
    hosts.map(async (host) => {
      const daguUrl = DAGU_URLS[host.id];
      if (!daguUrl) return host;
      const baseHost = {
        ...host,
        dagu: { ...host.dagu, url: daguUrl.replace(/\/api\/v1$/, "") },
      };
      if (host.health === "offline") return baseHost;
      const daguData = await fetchDaguDags(daguUrl, DAGU_AUTH[host.id]);
      return {
        ...baseHost,
        dagu: { ...baseHost.dagu, dags: daguData?.count },
      };
    }),
  );
  const summary = enriched.reduce(
    (acc, host) => {
      if (host.health === "offline") acc.offline += 1;
      else if (host.health === "warn") acc.warn += 1;
      else acc.healthy += 1;
      return acc;
    },
    { healthy: 0, warn: 0, offline: 0 },
  );
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    hosts: enriched,
    summary,
  };
}
