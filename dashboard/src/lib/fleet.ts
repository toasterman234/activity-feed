export type FleetHostId = "mac" | "zima" | "ovh";
export type FleetControlLevel = "assist" | "operator";
export type FleetActionId = "inspect" | "open-session" | "open-shell" | "open-paseo" | "open-cronicle";
export type FleetHealth = "healthy" | "warn" | "cool" | "offline";

export type FleetProcess = {
  pid: number;
  ppid: number;
  cpuPct: number;
  memPct: number;
  command: string;
};

export type FleetContainer = {
  name: string;
  status?: string;
  image?: string;
  cpuPct?: number | null;
  memPct?: number | null;
  memUsage?: string;
  stack?: string;
  unhealthy?: boolean;
};

export type FleetStack = {
  stack: string;
  count: number;
  unhealthy: number;
};

export type FleetControl = {
  label: string;
  level: FleetControlLevel;
  action: FleetActionId;
};

export type FleetHost = {
  id: FleetHostId;
  name: string;
  shortName: string;
  role: string;
  hostname: string;
  ts: string;
  transport: string;
  cpu: number;
  memory: number;
  storage: number;
  load: number;
  health: FleetHealth;
  highlight: string;
  services: string[];
  controls: FleetControl[];
  processes?: FleetProcess[];
  containers?: FleetContainer[];
  containerCount?: number;
  unhealthyCount?: number;
  stacks?: FleetStack[];
  source?: string;
  sourceLabel?: string;
  updatedAt?: string;
};

export type FleetSnapshot = {
  ok: boolean;
  generatedAt: string;
  hosts: FleetHost[];
  summary: {
    healthy: number;
    warn: number;
    offline: number;
  };
  error?: string;
};

export const FLEET_HOSTS: FleetHost[] = [
  {
    id: "mac",
    name: "Mac mini",
    shortName: "Mac",
    role: "Home base and interactive launcher",
    hostname: "bens-mac-mini",
    ts: "100.71.118.10",
    transport: "local + Tailscale",
    cpu: 62,
    memory: 48,
    storage: 71,
    load: 1.44,
    health: "warn",
    highlight: "Best for local sessions when idle. The page should bias launches away from this box if it is busy.",
    services: ["Paseo", "Cronicle worker", "executor", "herdr", "newagent"],
    controls: [
      { label: "Open local session", level: "assist", action: "open-session" },
      { label: "Inspect Mac", level: "assist", action: "inspect" },
      { label: "Open Paseo", level: "assist", action: "open-paseo" },
    ],
  },
  {
    id: "zima",
    name: "Zima OS",
    shortName: "Zima",
    role: "Primary batch brain and fleet proxy host",
    hostname: "zimaos",
    ts: "100.99.174.29",
    transport: "ssh zimaos",
    cpu: 34,
    memory: 41,
    storage: 83,
    load: 0.62,
    health: "healthy",
    highlight: "Runs Cronicle primary in Docker and is the natural place for shared fleet services.",
    services: ["Cronicle primary", "herdr", "LiteLLM", "Dagu", "shared-agents"],
    controls: [
      { label: "Open Cronicle", level: "assist", action: "open-cronicle" },
      { label: "Inspect Zima", level: "assist", action: "inspect" },
      { label: "Open shell", level: "assist", action: "open-shell" },
    ],
  },
  {
    id: "ovh",
    name: "OVHcloud VPS",
    shortName: "OVH",
    role: "Remote overflow worker and extra agent box",
    hostname: "ovh-vps",
    ts: "100.101.106.60",
    transport: "ssh ovhvps",
    cpu: 18,
    memory: 29,
    storage: 22,
    load: 0.28,
    health: "healthy",
    highlight: "Best target for overflow work when the Mac is hot. Good place to land longer-lived sessions.",
    services: ["herdr", "Cronicle worker", "agent-mail", "executor", "shared-agents"],
    controls: [
      { label: "Attach herdr", level: "assist", action: "open-session" },
      { label: "Inspect OVH", level: "assist", action: "inspect" },
      { label: "Open shell", level: "assist", action: "open-shell" },
    ],
  },
];

export const FLEET_SERVICE_URLS = {
  paseo: "http://100.71.118.10:6767",
  cronicle: "http://100.99.174.29:3012",
  ovh: "https://ovh-vps.taila1553c.ts.net:8446/fleet",
} as const;

export function hostById(hosts: FleetHost[], id: string): FleetHost | undefined {
  return hosts.find((host) => host.id === id);
}

export function mergeHosts(base: FleetHost[], live: Partial<Record<FleetHostId, Partial<FleetHost>>>) {
  return base.map((host) => ({
    ...host,
    ...(live[host.id] || {}),
    controls: host.controls,
    services: (live[host.id]?.services?.length ? live[host.id]?.services : host.services) || host.services,
  }));
}

export function safeCommandForHost(hostId: FleetHostId, action: FleetActionId) {
  if (action === "inspect") {
    return { kind: "inspect" as const };
  }
  if (action === "open-paseo") {
    return { kind: "url" as const, value: FLEET_SERVICE_URLS.paseo };
  }
  if (action === "open-cronicle") {
    return { kind: "url" as const, value: FLEET_SERVICE_URLS.cronicle };
  }
  if (action === "open-shell") {
    return {
      kind: "command" as const,
      value:
        hostId === "mac"
          ? "ssh macmini"
          : hostId === "zima"
            ? "ssh zimaos"
            : "ssh ovhvps",
    };
  }
  return {
    kind: "command" as const,
    value:
      hostId === "mac"
        ? "newagent --agent claude --session mac"
        : hostId === "zima"
          ? "newagent --session zima"
          : "newagent --session ovh",
  };
}
