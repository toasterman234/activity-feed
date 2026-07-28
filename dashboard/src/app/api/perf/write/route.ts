import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../_db";

// Batch ingest for client perf entries (src/lib/perf.ts).
//
// Writes go to the UNLOGGED perf_metrics table, which Postgres keeps out of
// electric_circuits_pub (FOR ALL TABLES) — so telemetry never becomes
// replication churn. See docs/decisions/ADR-004-perf-monitoring.md.

const MAX_ENTRIES = 200;
const RETENTION_DAYS = 14;
// Roughly one prune per 100 batches; enough to bound the table without adding
// a DELETE to the hot path.
const PRUNE_PROBABILITY = 0.01;

type IncomingEntry = {
  kind?: unknown;
  name?: unknown;
  value?: unknown;
  route?: unknown;
  rating?: unknown;
  detail?: unknown;
};

type CleanEntry = {
  kind: string;
  name: string;
  value: number;
  route: string;
  rating: string | null;
  detail: string | null;
};

function clean(entry: IncomingEntry): CleanEntry | null {
  const kind = entry.kind === "vital" || entry.kind === "measure" ? entry.kind : null;
  const name = typeof entry.name === "string" ? entry.name.slice(0, 120) : null;
  const value = typeof entry.value === "number" && Number.isFinite(entry.value) ? entry.value : null;
  const route = typeof entry.route === "string" ? entry.route.slice(0, 200) : null;
  if (!kind || !name || value === null || !route) return null;

  return {
    kind,
    name,
    value,
    route,
    rating: typeof entry.rating === "string" ? entry.rating.slice(0, 40) : null,
    detail:
      entry.detail && typeof entry.detail === "object" ? JSON.stringify(entry.detail).slice(0, 4000) : null,
  };
}

export async function POST(req: NextRequest) {
  let body: {
    sessionId?: unknown;
    device?: unknown;
    entries?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 80) : null;
  const device = typeof body.device === "string" ? body.device.slice(0, 40) : null;
  if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  if (!Array.isArray(body.entries)) {
    return NextResponse.json({ error: "entries must be an array" }, { status: 400 });
  }

  const rows = body.entries.slice(0, MAX_ENTRIES).map(clean).filter((r): r is CleanEntry => r !== null);
  if (rows.length === 0) return NextResponse.json({ ok: true, written: 0 });

  const values: unknown[] = [];
  const tuples = rows.map((r, i) => {
    const b = i * 7;
    values.push(r.kind, r.name, r.value, r.route, r.rating, r.detail, device);
    return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}::jsonb, $${b + 7}, $${
      rows.length * 7 + 1
    })`;
  });
  values.push(sessionId);

  try {
    await pool.query(
      `INSERT INTO perf_metrics (kind, name, value, route, rating, detail, device, session_id)
       VALUES ${tuples.join(", ")}`,
      values,
    );

    if (Math.random() < PRUNE_PROBABILITY) {
      await pool.query(`DELETE FROM perf_metrics WHERE ts < now() - $1::interval`, [
        `${RETENTION_DAYS} days`,
      ]);
    }
  } catch (err) {
    console.error("[perf/write] failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }

  return NextResponse.json({ ok: true, written: rows.length });
}
