// Server-only Nomad API client. Never imported in client components.
// Reads NOMAD_ADDR and NOMAD_*_TOKEN from env.

const NOMAD_ADDR =
  process.env.NOMAD_ADDR || "http://100.101.106.60:4646";
const NOMAD_TOKEN =
  process.env.NOMAD_TOKEN || "700b7f70-830a-0254-3098-bccc4d7988f3";
const NOMAD_DISPATCH_TOKEN =
  process.env.NOMAD_DISPATCH_TOKEN || "0a02932f-d675-979a-8948-2e572a67d42b";
const NOMAD_MGMT_TOKEN =
  process.env.NOMAD_MGMT_TOKEN || "50b1bb76-879f-a62c-d15a-6ca63e7ec67b";
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

export type NomadAction = {
  ok: boolean;
  message: string;
  evalId?: string;
};

export type NomadEvent = {
  topic: string;
  type: string;
  index: number;
  key: string;
  message: string;
  timestamp: string;
};

export type NomadComputeSnapshot = {
  ok: boolean;
  generatedAt: string;
  nodes: NomadNode[];
  jobs: NomadJobSummary[];
  allocations: NomadAllocation[];
  error?: string;
};

// ── Fetch helper (reader token) ────────────────────────────────────────

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

// ── Management actions (management token) ─────────────────────────────

export async function stopJob(jobName: string): Promise<NomadAction> {
  try {
    const res = await fetch(`${NOMAD_ADDR}/v1/job/${encodeURIComponent(jobName)}?purge=false`, {
      method: "DELETE",
      cache: "no-store",
      headers: { "X-Nomad-Token": NOMAD_MGMT_TOKEN, accept: "application/json" },
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      return { ok: false, message: err.slice(0, 200) };
    }
    const data = await res.json() as { EvalID?: string };
    return { ok: true, message: `Stopped ${jobName}`, evalId: data.EvalID };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function restartAlloc(allocId: string): Promise<NomadAction> {
  try {
    const res = await fetch(`${NOMAD_ADDR}/v1/client/allocation/${encodeURIComponent(allocId)}/restart`, {
      method: "PUT",
      cache: "no-store",
      headers: { "X-Nomad-Token": NOMAD_MGMT_TOKEN, accept: "application/json" },
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      return { ok: false, message: err.slice(0, 200) };
    }
    return { ok: true, message: `Restarted alloc ${allocId.slice(0, 8)}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function scaleJob(
  jobName: string,
  group: string,
  count: number,
): Promise<NomadAction> {
  try {
    const res = await fetch(`${NOMAD_ADDR}/v1/job/${encodeURIComponent(jobName)}`, {
      cache: "no-store",
      headers: { "X-Nomad-Token": NOMAD_MGMT_TOKEN, accept: "application/json" },
    });
    if (!res.ok) return { ok: false, message: `Failed to read job: ${res.status}` };
    const job = await res.json() as Record<string, unknown>;
    const groups = (job.TaskGroups as Array<Record<string, unknown>>) || [];
    const tg = groups.find((g) => g.Name === group);
    if (!tg) return { ok: false, message: `Task group "${group}" not found` };
    tg.Count = count;

    const updateRes = await fetch(`${NOMAD_ADDR}/v1/job/${encodeURIComponent(jobName)}`, {
      method: "PUT",
      cache: "no-store",
      headers: { "X-Nomad-Token": NOMAD_MGMT_TOKEN, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ Job: job, EnforceIndex: false }),
    });
    if (!updateRes.ok) {
      const err = await updateRes.text().catch(() => "");
      return { ok: false, message: err.slice(0, 200) };
    }
    const data = await updateRes.json() as { EvalID?: string };
    return { ok: true, message: `Scaled ${group} to ${count}`, evalId: data.EvalID };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function getAllocLogs(allocId: string, task: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NOMAD_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${NOMAD_ADDR}/v1/client/fs/logs/${encodeURIComponent(allocId)}?task=${encodeURIComponent(task)}&type=stdout&plain=true&origin=start`,
      {
        cache: "no-store",
        signal: controller.signal,
        headers: { "X-Nomad-Token": NOMAD_MGMT_TOKEN },
      },
    );
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      return `Error: ${res.status} - ${err.slice(0, 300)}`;
    }
    const text = await res.text();
    return text || "(no output)";
  } catch (e) {
    return `Error: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    clearTimeout(timer);
  }
}

// ── Event stream ──────────────────────────────────────────────────────

export async function streamNomadEvents(
  onEvent: (event: NomadEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  let idx = 0;
  while (!signal.aborted) {
    try {
      const res = await fetch(
        `${NOMAD_ADDR}/v1/event/stream?topic=*&index=${idx}`,
        {
          cache: "no-store",
          signal,
          headers: { "X-Nomad-Token": NOMAD_TOKEN, accept: "application/json" },
        },
      );
      if (!res.ok || !res.body) {
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (!signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const frame = JSON.parse(line) as { Index?: number; Events?: Array<{ Topic?: string; Type?: string; Key?: string; Payload?: Record<string, unknown> }> };
            idx = (frame.Index || idx + 1);
            for (const ev of frame.Events || []) {
              const topic = ev.Topic || "";
              const type = ev.Type || "";
              const key = ev.Key || "";
              let message = `${topic}/${type}`;
              const payload = ev.Payload || {};
              if (payload.Job) {
                const j = payload.Job as Record<string, unknown>;
                message = `Job ${j.Name || j.ID}: ${type}`;
              } else if (payload.Allocation) {
                const a = payload.Allocation as Record<string, unknown>;
                message = `Alloc ${String(a.ID || "").slice(0, 8)} ${String(a.TaskGroup || "")}: ${a.ClientStatus || a.DesiredStatus}`;
              } else if (payload.Evaluation) {
                const e = payload.Evaluation as Record<string, unknown>;
                message = `Eval ${String(e.ID || "").slice(0, 8)}: ${e.Status} (${e.Type})`;
              } else if (payload.Deployment) {
                const d = payload.Deployment as Record<string, unknown>;
                message = `Deploy ${String(d.ID || "").slice(0, 8)}: ${d.Status}`;
              }
              onEvent({ topic, type, index: idx, key, message, timestamp: new Date().toISOString() });
            }
          } catch { /* skip */ }
        }
      }
    } catch {
      if (!signal.aborted) await new Promise((r) => setTimeout(r, 5000));
    }
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
