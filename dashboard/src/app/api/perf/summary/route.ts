import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../_db";

// Percentile rollups for the /perf page. Aggregation happens in Postgres so the
// client never pulls raw rows — and this is a plain polled route rather than an
// Electric shape, which keeps it outside the 4-shapes-per-page budget (ADR-003).

const DEFAULT_HOURS = 24;
const MAX_HOURS = 720;
const SLOWEST_LIMIT = 20;

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const parsedHours = Number(params.get("hours"));
  const hours = Number.isFinite(parsedHours) && parsedHours > 0 ? Math.min(parsedHours, MAX_HOURS) : DEFAULT_HOURS;
  const route = params.get("route");
  const interval = `${hours} hours`;

  // $1 = interval, $2 = route filter ('' means all routes)
  const args = [interval, route ?? ""];
  const scope = `ts >= now() - $1::interval AND ($2 = '' OR route = $2)`;

  try {
    const rollup = await pool.query(
      `SELECT kind,
              route,
              name,
              count(*)::int                                              AS count,
              round(percentile_cont(0.50) WITHIN GROUP (ORDER BY value)::numeric, 3) AS p50,
              round(percentile_cont(0.75) WITHIN GROUP (ORDER BY value)::numeric, 3) AS p75,
              round(percentile_cont(0.95) WITHIN GROUP (ORDER BY value)::numeric, 3) AS p95,
              round(max(value)::numeric, 3)                              AS max,
              count(*) FILTER (WHERE rating = 'poor')::int               AS poor,
              count(*) FILTER (WHERE rating = 'good')::int               AS good
         FROM perf_metrics
        WHERE ${scope}
        GROUP BY kind, route, name
        ORDER BY kind, route, name`,
      args,
    );

    const slowest = await pool.query(
      `SELECT ts, kind, name, route, round(value::numeric, 3) AS value, detail, device
         FROM perf_metrics
        WHERE ${scope}
          AND kind = 'measure'
        ORDER BY value DESC
        LIMIT ${SLOWEST_LIMIT}`,
      args,
    );

    const totals = await pool.query(
      `SELECT count(*)::int AS entries,
              count(DISTINCT session_id)::int AS sessions,
              min(ts) AS oldest,
              max(ts) AS newest
         FROM perf_metrics
        WHERE ${scope}`,
      args,
    );

    const routes = await pool.query(
      `SELECT DISTINCT route FROM perf_metrics WHERE ts >= now() - $1::interval ORDER BY route`,
      [interval],
    );

    const rows = rollup.rows.map((r) => ({
      ...r,
      p50: Number(r.p50),
      p75: Number(r.p75),
      p95: Number(r.p95),
      max: Number(r.max),
    }));

    return NextResponse.json(
      {
        hours,
        route: route || null,
        totals: totals.rows[0],
        vitals: rows.filter((r) => r.kind === "vital"),
        measures: rows.filter((r) => r.kind === "measure"),
        slowest: slowest.rows.map((r) => ({ ...r, value: Number(r.value) })),
        routes: routes.rows.map((r) => r.route as string),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[perf/summary] failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
