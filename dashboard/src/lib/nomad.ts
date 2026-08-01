// Server-only Nomad API client. Never imported in client components.
// Reads NOMAD_ADDR and NOMAD_TOKEN from env.

const NOMAD_ADDR =
  process.env.NOMAD_ADDR || "http://100.101.106.60:4646";
const NOMAD_TOKEN =
  process.env.NOMAD_TOKEN || "700b7f70-830a-0254-3098-bccc4d7988f3";
const NOMAD_DISPATCH_TOKEN =
  process.env.NOMAD_DISPATCH_TOKEN || "0a02932f-d675-979a-8948-2e572a67d42b";
const NOMAD_TIMEOUT_MS = Number(process.env.NOMAD_TIMEOUT_MS || 8000);

// ── Job allowlist ────────────────────────────────────────────────────
// Only these job names can be dispatched from the PWA.
// Add new parameterized jobs here before they show up as launchable.

export const NOMAD_DISPATCH_ALLOWLIST: string[] = [
  "demo-echo",
];

// ── Types ──────────────────────────────────────────────────────────────

export type NomadNode = {
  id: string;
  name: string;
  nodePool: string;
  status: string;
  schedulingEligibility: string;
  drain: boolean;
  datacenter: string;
  nodeClass: string;
  resources: {
    cpu: { total: number; allocated: number };
    memory: { totalMB: number; allocatedMB: number };
    disk: { totalMB: number; allocatedMB: number };
  };
};

export type NomadJobSummary = {
  id: string;
  name: string;
  type: string;
  status: string;
  priority: number;
  nodePool: string;
  periodic: boolean;
  parameterized: boolean;
  taskGroups: number;
  summary: Record<string, NomadTaskGroupSummary>;
};

export type NomadTaskGroupSummary = {
  queued: number;
  starting: number;
  running: number;
  failed: number;
  complete: number;
  lost: number;
};

export type NomadAllocation = {
  id: string;
  jobId: string;
  taskGroup: string;
  nodeId: string;
  nodeName: string;
  status: string;
  desiredStatus: string;
  clientStatus: string;
  createdAt: string;
  modifiedAt: string;
};

export type DispatchResult = {
  ok: boolean;
  evalId?: string;
  message: string;
};

export type NomadComputeSnapshot = {
  ok: boolean;
  generatedAt: string;
  nodes: NomadNode[];
  jobs: NomadJobSummary[];
  allocations: NomadAllocation[];
  error?: string;
};

// ── Fetch helper ───────────────────────────────────────────────────────

async function nomadFetch<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NOMAD_TIMEOUT_MS);
  try {
    const res = await fetch(`${NOMAD_ADDR}${path}`, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "X-Nomad-Token": NOMAD_TOKEN,
      },
    });
    if (!res.ok) {
      throw new Error(`Nomad API ${res.status}: ${res.statusText}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

// ── Dispatch a parameterized job (uses dispatcher token) ─────────────

export async function dispatchJob(
  jobName: string,
  payload?: string,
): Promise<DispatchResult> {
  if (!NOMAD_DISPATCH_ALLOWLIST.includes(jobName)) {
    return { ok: false, message: `Job "${jobName}" is not on the dispatch allowlist` };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NOMAD_TIMEOUT_MS);
  try {
    const body = payload
      ? JSON.stringify({ Payload: Buffer.from(payload).toString("base64") })
      : "{}";
    const res = await fetch(
      `${NOMAD_ADDR}/v1/job/${encodeURIComponent(jobName)}/dispatch`,
      {
        method: "POST",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "X-Nomad-Token": NOMAD_DISPATCH_TOKEN,
        },
        body,
      },
    );
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { ok: false, message: `Nomad API ${res.status}: ${res.statusText}${errText ? " — " + errText.slice(0, 200) : ""}` };
    }
    const data = (await res.json()) as { DispatchedJobID?: string; EvalID?: string };
    return {
      ok: true,
      evalId: data.EvalID || data.DispatchedJobID,
      message: `Dispatched "${jobName}"${data.EvalID ? ` (eval ${data.EvalID})` : ""}`,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

// ── Build snapshot ─────────────────────────────────────────────────────

export async function buildComputeSnapshot(): Promise<NomadComputeSnapshot> {
  try {
    const [nodesRaw, jobsRaw, allocsRaw] = await Promise.all([
      nomadFetch<unknown[]>("/v1/nodes"),
      nomadFetch<unknown[]>("/v1/jobs"),
      nomadFetch<unknown[]>("/v1/allocations"),
    ]);

    const nodes: NomadNode[] = (nodesRaw as Array<Record<string, unknown>>).map(
      (n) => ({
        id: String(n.ID || ""),
        name: String(n.Name || ""),
        nodePool: String(n.NodePool || "default"),
        status: String(n.Status || "unknown"),
        schedulingEligibility: String(n.SchedulingEligibility || ""),
        drain: Boolean(n.Drain),
        datacenter: String(n.Datacenter || ""),
        nodeClass: String(n.NodeClass || ""),
        resources: {
          cpu: {
            total: Number(
              (n as Record<string, unknown>).NodeResources
                ? ((
                    (n as Record<string, unknown>).NodeResources as Record<
                      string,
                      unknown
                    >
                  ).Cpu as Record<string, unknown>)?.CpuShares ?? 0
                : 0
            ) / 100,
            allocated: Number(
              (n as Record<string, unknown>).AllocatedResources
                ? ((
                    (n as Record<string, unknown>)
                      .AllocatedResources as Record<string, unknown>
                  ).Cpu as Record<string, unknown>)?.CpuShares ?? 0
                : 0
            ) / 100,
          },
          memory: {
            totalMB: Math.round(
              Number(
                (n as Record<string, unknown>).NodeResources
                  ? ((
                      (n as Record<string, unknown>)
                        .NodeResources as Record<string, unknown>
                    ).Memory as Record<string, unknown>)?.MemoryMB ?? 0
                  : 0
              )
            ),
            allocatedMB: Math.round(
              Number(
                (n as Record<string, unknown>).AllocatedResources
                  ? ((
                      (n as Record<string, unknown>)
                        .AllocatedResources as Record<string, unknown>
                    ).Memory as Record<string, unknown>)?.MemoryMB ?? 0
                  : 0
              )
            ),
          },
          disk: {
            totalMB: Math.round(
              Number(
                (n as Record<string, unknown>).NodeResources
                  ? ((
                      (n as Record<string, unknown>)
                        .NodeResources as Record<string, unknown>
                    ).Disk as Record<string, unknown>)?.DiskMB ?? 0
                  : 0
              )
            ),
            allocatedMB: Math.round(
              Number(
                (n as Record<string, unknown>).AllocatedResources
                  ? ((
                      (n as Record<string, unknown>)
                        .AllocatedResources as Record<string, unknown>
                    ).Disk as Record<string, unknown>)?.DiskMB ?? 0
                  : 0
              )
            ),
          },
        },
      })
    );

    const jobs: NomadJobSummary[] = (jobsRaw as Array<Record<string, unknown>>).map(
      (j) => ({
        id: String(j.ID || ""),
        name: String(j.Name || j.ID || ""),
        type: String(j.Type || ""),
        status: String(j.Status || ""),
        priority: Number(j.Priority ?? 0),
        nodePool: String(j.NodePool || "all"),
        periodic: Boolean(j.Periodic),
        parameterized: Boolean(j.Parameterized),
        taskGroups: Array.isArray(j.TaskGroups)
          ? j.TaskGroups.length
          : 0,
        summary: mapTaskGroupSummary(
          (j.JobSummary as Record<string, unknown>)?.Summary
        ),
      })
    );

    const allocs: NomadAllocation[] = (
      allocsRaw as Array<Record<string, unknown>>
    ).map((a) => ({
      id: String(a.ID || ""),
      jobId: String(a.JobID || ""),
      taskGroup: String(a.TaskGroup || ""),
      nodeId: String(a.NodeID || ""),
      nodeName: String(a.NodeName || ""),
      status: String(a.ClientStatus || a.DesiredStatus || "unknown"),
      desiredStatus: String(a.DesiredStatus || ""),
      clientStatus: String(a.ClientStatus || ""),
      createdAt: String(a.CreateTime ? new Date(Number(a.CreateTime) / 1_000_000).toISOString() : ""),
      modifiedAt: String(a.ModifyTime ? new Date(Number(a.ModifyTime) / 1_000_000).toISOString() : ""),
    }));

    // Attach node names to allocations
    const nodeNameById = new Map(nodes.map((n) => [n.id, n.name]));
    for (const alloc of allocs) {
      if (!alloc.nodeName) {
        alloc.nodeName = nodeNameById.get(alloc.nodeId) || alloc.nodeId;
      }
    }

    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      nodes,
      jobs,
      allocations: allocs,
    };
  } catch (error) {
    return {
      ok: false,
      generatedAt: new Date().toISOString(),
      nodes: [],
      jobs: [],
      allocations: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function mapTaskGroupSummary(raw: unknown): Record<string, NomadTaskGroupSummary> {
  if (!raw || typeof raw !== "object") return {};
  const result: Record<string, NomadTaskGroupSummary> = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!val || typeof val !== "object") continue;
    const s = val as Record<string, unknown>;
    result[key] = {
      queued: Number(s.Queued ?? 0),
      starting: Number(s.Starting ?? 0),
      running: Number(s.Running ?? 0),
      failed: Number(s.Failed ?? 0),
      complete: Number(s.Complete ?? 0),
      lost: Number(s.Lost ?? 0),
    };
  }
  return result;
}
