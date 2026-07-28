import { randomUUID } from "crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { pool } from "@/app/api/_db";

const execFileAsync = promisify(execFile);

export type InitiativeStatus = "open" | "active" | "blocked" | "shipped" | "deferred";

export type GraphInitiative = {
  id: string;
  evidence_map_id: string | null;
  title: string;
  status: InitiativeStatus;
  channel_id: string | null;
  thread_id: string | null;
  plan_path: string | null;
  evidence_refs: string;
  blocked_by: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  shipped_at: string | null;
  shipped_by: string | null;
  ship_evidence: string | null;
};

function graphEnabled(): boolean {
  return process.env.CHANNEL_GRAPH === "1";
}

export async function writeGraphEvent(opts: {
  channelId: string | null;
  threadId: string | null;
  kind: string;
  actor: string;
  payload?: Record<string, unknown>;
  causedBy?: string | null;
}) {
  const always =
    opts.kind.startsWith("initiative.") ||
    opts.kind === "deploy.activated";
  if (!always && !graphEnabled()) return null;

  const id = randomUUID();
  const channelId = opts.channelId || "ops";
  await pool.query(
    `INSERT INTO graph_events (id, channel_id, thread_id, kind, actor, payload, caused_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      channelId,
      opts.threadId,
      opts.kind,
      opts.actor,
      JSON.stringify(opts.payload || {}),
      opts.causedBy || null,
      new Date().toISOString(),
    ],
  );
  return id;
}

export async function writeGraphRelation(type: string, sourceId: string, targetId: string) {
  await pool.query(
    `INSERT INTO graph_relations (id, type, source_id, target_id, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [randomUUID(), type, sourceId, targetId, new Date().toISOString()],
  );
}

export async function listInitiatives(opts?: { status?: string }): Promise<GraphInitiative[]> {
  const params: string[] = [];
  let where = "";
  if (opts?.status) {
    params.push(opts.status);
    where = `WHERE status = $1`;
  }
  const res = await pool.query(
    `SELECT * FROM graph_initiatives ${where} ORDER BY updated_at DESC LIMIT 200`,
    params,
  );
  return res.rows as GraphInitiative[];
}

export async function getInitiative(id: string): Promise<GraphInitiative | null> {
  const res = await pool.query(`SELECT * FROM graph_initiatives WHERE id = $1`, [id]);
  return (res.rows[0] as GraphInitiative | undefined) || null;
}

export async function getInitiativeByEvidenceMapId(evidenceMapId: string): Promise<GraphInitiative | null> {
  const res = await pool.query(`SELECT * FROM graph_initiatives WHERE evidence_map_id = $1`, [evidenceMapId]);
  return (res.rows[0] as GraphInitiative | undefined) || null;
}

export async function createInitiative(opts: {
  evidenceMapId?: string | null;
  title: string;
  status?: InitiativeStatus;
  channelId?: string | null;
  threadId?: string | null;
  planPath?: string | null;
  createdBy: string;
}): Promise<GraphInitiative> {
  if (opts.evidenceMapId) {
    const existing = await getInitiativeByEvidenceMapId(opts.evidenceMapId);
    if (existing) return existing;
  }
  const now = new Date().toISOString();
  const id = randomUUID();
  const status = opts.status || "open";
  await pool.query(
    `INSERT INTO graph_initiatives (
       id, evidence_map_id, title, status, channel_id, thread_id, plan_path,
       evidence_refs, blocked_by, created_by, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,'[]',NULL,$8,$9,$9)`,
    [
      id,
      opts.evidenceMapId || null,
      opts.title,
      status,
      opts.channelId || null,
      opts.threadId || null,
      opts.planPath || null,
      opts.createdBy,
      now,
    ],
  );
  await writeGraphEvent({
    channelId: opts.channelId || "ops",
    threadId: opts.threadId || null,
    kind: "initiative.created",
    actor: opts.createdBy,
    payload: {
      initiativeId: id,
      evidenceMapId: opts.evidenceMapId || null,
      title: opts.title,
      status,
    },
  });
  if (opts.threadId) {
    await writeGraphRelation("tracks", id, opts.threadId);
  }
  const row = await getInitiative(id);
  if (!row) throw new Error("failed to create initiative");
  return row;
}

async function runEvidenceCheckForMapId(evidenceMapId: string) {
  const script = path.join(process.cwd(), "scripts/check-plan-status.mjs");
  try {
    const { stdout } = await execFileAsync(process.execPath, [script, "--json", "--no-snapshot"], {
      cwd: process.cwd(),
      timeout: 20_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    return JSON.parse(stdout);
  } catch (error) {
    const err = error as { stdout?: string; message?: string };
    if (err.stdout) {
      try {
        return JSON.parse(err.stdout);
      } catch {
        /* fall through */
      }
    }
    throw new Error(err.message || String(error));
  }
}

export async function countBlockingRelations(initiativeId: string): Promise<number> {
  const res = await pool.query(
    `SELECT count(*)::int AS n
       FROM graph_relations r
       JOIN graph_decisions d ON d.id = r.source_id
      WHERE r.type = 'blocks'
        AND r.target_id = $1
        AND d.status = 'active'`,
    [initiativeId],
  );
  return Number(res.rows[0]?.n || 0);
}

/**
 * Promote gate: status may become `shipped` only when hard evidence passes
 * and no active decision blocks the initiative.
 */
export async function promoteInitiative(opts: {
  id: string;
  actor: string;
  rationale?: string;
}): Promise<{ ok: true; initiative: GraphInitiative } | { ok: false; error: string; status: number; detail?: unknown }> {
  const initiative = await getInitiative(opts.id);
  if (!initiative) return { ok: false, error: "initiative not found", status: 404 };
  if (initiative.status === "shipped") {
    return { ok: true, initiative };
  }

  const blocked = await countBlockingRelations(initiative.id);
  if (blocked > 0) {
    return {
      ok: false,
      error: "initiative is blocked by an active decision",
      status: 409,
      detail: { blocked },
    };
  }

  let shipEvidence: Record<string, unknown> = {
    mode: "manual",
    rationale: opts.rationale || null,
  };

  if (initiative.evidence_map_id) {
    const report = await runEvidenceCheckForMapId(initiative.evidence_map_id);
    const row = (report.results || []).find(
      (r: { id?: string }) => r.id === initiative.evidence_map_id,
    );
    if (!row) {
      return {
        ok: false,
        error: `evidence map id not found: ${initiative.evidence_map_id}`,
        status: 409,
      };
    }
    const fails = (row.findings || []).filter((f: { severity: string }) => f.severity === "fail");
    if (!row.ok || fails.length) {
      return {
        ok: false,
        error: "promote denied — evidence check failed",
        status: 409,
        detail: { findings: row.findings, claimed: row.claimed },
      };
    }
    // Open items are allowed at promote time only if expectedStatus is shipped/mostly_shipped
    // and there are no fails — opens remain visible but do not block core ship for mostly_shipped.
    shipEvidence = {
      mode: "evidence-map",
      evidenceMapId: initiative.evidence_map_id,
      claimed: row.claimed,
      expectedStatus: row.expectedStatus,
      openFindings: (row.findings || []).filter((f: { severity: string }) => f.severity === "open"),
      checkedAt: report.generatedAt,
    };
  }

  const now = new Date().toISOString();
  await pool.query(
    `UPDATE graph_initiatives
        SET status = 'shipped',
            shipped_at = $1,
            shipped_by = $2,
            ship_evidence = $3,
            updated_at = $1
      WHERE id = $4`,
    [now, opts.actor, JSON.stringify(shipEvidence), initiative.id],
  );
  await writeGraphEvent({
    channelId: initiative.channel_id || "ops",
    threadId: initiative.thread_id,
    kind: "initiative.promoted",
    actor: opts.actor,
    payload: {
      initiativeId: initiative.id,
      evidenceMapId: initiative.evidence_map_id,
      title: initiative.title,
      shipEvidence,
      rationale: opts.rationale || null,
    },
  });

  const updated = await getInitiative(initiative.id);
  if (!updated) return { ok: false, error: "promote succeeded but reload failed", status: 500 };
  return { ok: true, initiative: updated };
}

export async function setInitiativeStatus(opts: {
  id: string;
  status: InitiativeStatus;
  actor: string;
  blockedBy?: string | null;
}) {
  if (opts.status === "shipped") {
    return promoteInitiative({ id: opts.id, actor: opts.actor });
  }
  const initiative = await getInitiative(opts.id);
  if (!initiative) return { ok: false as const, error: "initiative not found", status: 404 };
  const now = new Date().toISOString();
  await pool.query(
    `UPDATE graph_initiatives
        SET status = $1, blocked_by = $2, updated_at = $3
      WHERE id = $4`,
    [opts.status, opts.blockedBy || null, now, opts.id],
  );
  await writeGraphEvent({
    channelId: initiative.channel_id || "ops",
    threadId: initiative.thread_id,
    kind: "initiative.status_changed",
    actor: opts.actor,
    payload: {
      initiativeId: initiative.id,
      from: initiative.status,
      to: opts.status,
      blockedBy: opts.blockedBy || null,
    },
  });
  return { ok: true as const, initiative: await getInitiative(opts.id) };
}

/** Seed graph_initiatives from docs/evidence-map.json for any missing ids. */
export async function syncInitiativesFromEvidenceMap(actor = "system"): Promise<{ created: number; existing: number }> {
  const fs = await import("node:fs/promises");
  const mapPath = path.join(process.cwd(), "docs/evidence-map.json");
  const map = JSON.parse(await fs.readFile(mapPath, "utf8")) as {
    initiatives: Array<{
      id: string;
      title: string;
      plan?: string | null;
      expectedStatus?: string;
      openItems?: unknown[];
    }>;
  };
  let created = 0;
  let existing = 0;
  for (const item of map.initiatives || []) {
    const found = await getInitiativeByEvidenceMapId(item.id);
    if (found) {
      existing += 1;
      continue;
    }
    const status: InitiativeStatus =
      item.expectedStatus === "shipped" || item.expectedStatus === "mostly_shipped"
        ? "active"
        : item.expectedStatus === "not_built"
          ? "open"
          : "open";
    // Do not auto-ship from map — promote gate required.
    await createInitiative({
      evidenceMapId: item.id,
      title: item.title,
      status: status === "active" && (item.openItems || []).length ? "active" : status,
      planPath: item.plan || null,
      createdBy: actor,
    });
    created += 1;
  }
  return { created, existing };
}

export async function emitLifecycleTransitionEvent(opts: {
  channelId: string;
  threadId: string;
  actor: string;
  from: string;
  to: string;
  lifecycle: string;
  gated?: boolean;
}) {
  const linked = await pool.query(
    `SELECT id FROM graph_initiatives WHERE thread_id = $1 ORDER BY updated_at DESC LIMIT 1`,
    [opts.threadId],
  );
  const initiativeId = (linked.rows[0]?.id as string | undefined) || null;
  await writeGraphEvent({
    channelId: opts.channelId,
    threadId: opts.threadId,
    kind: "lifecycle.transitioned",
    actor: opts.actor,
    payload: {
      from: opts.from,
      to: opts.to,
      lifecycle: opts.lifecycle,
      gated: !!opts.gated,
      initiativeId,
    },
  });
  if (initiativeId && opts.to) {
    await pool.query(
      `UPDATE graph_initiatives SET status = CASE WHEN status = 'open' THEN 'active' ELSE status END, updated_at = $1 WHERE id = $2 AND status IN ('open','active')`,
      [new Date().toISOString(), initiativeId],
    );
  }
}

export async function emitDeployActivatedEvent(opts: {
  releaseId: string;
  gitSha: string;
  dirty: boolean;
  actor?: string;
}) {
  await writeGraphEvent({
    channelId: "ops",
    threadId: null,
    kind: "deploy.activated",
    actor: opts.actor || "deploy",
    payload: {
      releaseId: opts.releaseId,
      gitSha: opts.gitSha,
      dirty: opts.dirty,
    },
  });
}


export type EvidenceMapEntry = {
  id: string;
  title: string;
  plan?: string | null;
  expectedStatus?: string;
  requireAll?: string[];
  forbidAll?: string[];
  openItems?: Array<Record<string, unknown>>;
  contentChecks?: Array<Record<string, unknown>>;
};

export type InitiativeTimelineItem = {
  at: string;
  kind: string;
  actor: string;
  summary: string;
  payload: Record<string, unknown>;
};

function summarizeEvent(kind: string, payload: Record<string, unknown>, actor: string): string {
  if (kind === "initiative.created") return `Created as ${payload.status || "open"} by ${actor}`;
  if (kind === "initiative.promoted") return `Promoted to shipped by ${actor}`;
  if (kind === "initiative.status_changed") {
    return `Status ${payload.from || "?"} → ${payload.to || "?"} by ${actor}`;
  }
  if (kind === "lifecycle.transitioned") {
    return `Thread lifecycle ${payload.from || "?"} → ${payload.to || "?"}`;
  }
  if (kind === "deploy.activated") {
    return `Deploy ${payload.releaseId || payload.gitSha || "activated"}`;
  }
  return `${kind} by ${actor}`;
}

async function loadEvidenceMapEntry(mapId: string | null): Promise<EvidenceMapEntry | null> {
  if (!mapId) return null;
  const fs = await import("node:fs/promises");
  const mapPath = path.join(process.cwd(), "docs/evidence-map.json");
  try {
    const map = JSON.parse(await fs.readFile(mapPath, "utf8")) as {
      initiatives: EvidenceMapEntry[];
    };
    return map.initiatives.find((i) => i.id === mapId) || null;
  } catch {
    return null;
  }
}

async function loadPlanExcerpt(planPath: string | null): Promise<{
  path: string;
  exists: boolean;
  statusLine: string | null;
  excerpt: string | null;
} | null> {
  if (!planPath) return null;
  const fs = await import("node:fs/promises");
  const abs = path.join(process.cwd(), planPath);
  try {
    const raw = await fs.readFile(abs, "utf8");
    const lines = raw.split(/\r?\n/);
    const statusLine =
      lines.find((l) => /^status\s*:/i.test(l.trim()) || /^\*\*status\*\*/i.test(l.trim())) ||
      lines.find((l) => /^#\s+/.test(l)) ||
      null;
    const excerpt = lines.slice(0, 24).join("\n").trim();
    return { path: planPath, exists: true, statusLine, excerpt };
  } catch {
    return { path: planPath, exists: false, statusLine: null, excerpt: null };
  }
}

export async function resolveInitiative(idOrMapId: string): Promise<GraphInitiative | null> {
  return (await getInitiative(idOrMapId)) || (await getInitiativeByEvidenceMapId(idOrMapId));
}

/** Full detail payload for Evidence drill-down. */
export async function getInitiativeDetail(idOrMapId: string) {
  const initiative = await resolveInitiative(idOrMapId);
  if (!initiative) return null;

  const mapEntry = await loadEvidenceMapEntry(initiative.evidence_map_id);
  const planPath = initiative.plan_path || mapEntry?.plan || null;
  const plan = await loadPlanExcerpt(planPath);

  let check: {
    id: string;
    title: string;
    plan: string | null;
    claimed: string;
    expectedStatus: string;
    ok: boolean;
    findings: Array<{ severity: string; message: string }>;
  } | null = null;

  if (initiative.evidence_map_id) {
    try {
      const report = await runEvidenceCheckForMapId(initiative.evidence_map_id);
      const row = (report.results || []).find(
        (r: { id?: string }) => r.id === initiative.evidence_map_id,
      );
      if (row) check = row;
    } catch (error) {
      check = {
        id: initiative.evidence_map_id,
        title: initiative.title,
        plan: planPath,
        claimed: "unknown",
        expectedStatus: mapEntry?.expectedStatus || "unknown",
        ok: false,
        findings: [{ severity: "fail", message: `evidence check error: ${String(error)}` }],
      };
    }
  }

  const blockedBy = await countBlockingRelations(initiative.id);

  const events = await pool.query(
    `SELECT id, kind, actor, payload, created_at
       FROM graph_events
      WHERE (
            kind LIKE 'initiative.%'
        AND payload LIKE $1
      ) OR (
            kind = 'lifecycle.transitioned'
        AND payload LIKE $1
      )
      ORDER BY created_at DESC
      LIMIT 50`,
    [`%"initiativeId":"${initiative.id}"%`],
  );

  const timeline: InitiativeTimelineItem[] = events.rows.map((row) => {
    let payload: Record<string, unknown> = {};
    try {
      payload = typeof row.payload === "string" ? JSON.parse(row.payload) : (row.payload || {});
    } catch {
      payload = {};
    }
    return {
      at: row.created_at,
      kind: row.kind,
      actor: row.actor,
      summary: summarizeEvent(row.kind, payload, row.actor),
      payload,
    };
  });

  let shipEvidence: Record<string, unknown> | null = null;
  if (initiative.ship_evidence) {
    try {
      shipEvidence = JSON.parse(initiative.ship_evidence);
    } catch {
      shipEvidence = { raw: initiative.ship_evidence };
    }
  }

  return {
    initiative,
    mapEntry,
    plan,
    check,
    shipEvidence,
    blockers: blockedBy,
    links: {
      planPath,
      mapId: initiative.evidence_map_id,
      channelId: initiative.channel_id,
      threadId: initiative.thread_id,
      channelHref: initiative.channel_id
        ? `/channels/${initiative.channel_id}`
        : null,
      threadHref:
        initiative.channel_id && initiative.thread_id
          ? `/channels/${initiative.channel_id}/${initiative.thread_id}`
          : null,
    },
    timeline,
  };
}

