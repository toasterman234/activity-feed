import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { pool } from "../../_db";
import { listInitiatives, syncInitiativesFromEvidenceMap } from "@/lib/graph-initiatives";

export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

async function runEvidenceCheck() {
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

async function inboxPending() {
  try {
    const [decisions, proposals, memory] = await Promise.all([
      pool.query(`SELECT count(*)::int AS n FROM graph_decisions WHERE status = 'pending'`),
      pool.query(`SELECT count(*)::int AS n FROM graph_proposals WHERE status = 'pending'`),
      pool.query(`SELECT count(*)::int AS n FROM graph_memory_candidates WHERE status = 'pending'`),
    ]);
    return {
      decisions: Number(decisions.rows[0]?.n || 0),
      proposals: Number(proposals.rows[0]?.n || 0),
      memory: Number(memory.rows[0]?.n || 0),
    };
  } catch (error) {
    return {
      decisions: 0,
      proposals: 0,
      memory: 0,
      error: String(error),
    };
  }
}

export async function GET(request: Request) {
  try {
    const sync = new URL(request.url).searchParams.get("sync") === "1";
    let syncResult = null;
    if (sync) {
      try { syncResult = await syncInitiativesFromEvidenceMap("evidence-sync"); }
      catch (error) { syncResult = { error: String(error) }; }
    }
    const [evidence, inbox, initiatives] = await Promise.all([
      runEvidenceCheck(),
      inboxPending(),
      listInitiatives().catch(() => []),
    ]);
    const mismatches = (evidence.results || []).filter(
      (row: { ok?: boolean; findings?: Array<{ severity: string }> }) =>
        !row.ok || (row.findings || []).some((f) => f.severity === "warn" || f.severity === "fail" || f.severity === "open"),
    );
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      evidence,
      inbox,
      initiatives,
      sync: syncResult,
      summary: {
        mapInitiatives: evidence.results?.length || 0,
        graphInitiatives: Array.isArray(initiatives) ? initiatives.length : 0,
        failing: evidence.failCount || 0,
        warnings: evidence.warnCount || 0,
        open: evidence.openCount || 0,
        pendingInbox:
          (inbox.decisions || 0) + (inbox.proposals || 0) + (inbox.memory || 0),
        shipped: Array.isArray(initiatives)
          ? initiatives.filter((i: { status?: string }) => i.status === "shipped").length
          : 0,
        attention: mismatches.length + ((inbox.decisions || 0) + (inbox.proposals || 0) + (inbox.memory || 0) > 0 ? 1 : 0),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
