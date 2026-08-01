// ── Hedge API client ──
// Typed fetch wrapper for the Hedge Engine API (:9080), proxied through
// the dashboard's own origin via /hedge-api rewrite in next.config.ts.

const API_BASE = "/hedge-api";

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Hedge API ${path}: ${res.status} ${text}`);
  }
  return res.json();
}

// ── Snapshot ──

export interface SnapshotMeta {
  snapshot_id: string;
  valuation_time: string;
  total_positions: number;
  option_positions: number;
}

export async function createSnapshot(): Promise<SnapshotMeta> {
  return fetchJSON<SnapshotMeta>("/snapshots", { method: "POST" });
}

export async function getSnapshot(id: string): Promise<unknown> {
  return fetchJSON(`/snapshots/${id}`);
}

// ── Runs ──

export interface RunStatus {
  run_id: string;
  snapshot_id: string;
  status: "pending" | "running" | "complete" | "failed";
  summary: {
    total_candidates: number;
    strategies: string[];
    symbols_scanned: string[];
    top_score: number;
  } | null;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string | null;
}

export interface HedgeLeg {
  leg_type: string;
  symbol: string;
  option_type: "call" | "put" | null;
  strike: number | null;
  expiration: string | null;
  quantity: number;
  estimated_price: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
}

export interface HedgeCandidate {
  candidate_id: string;
  symbol: string;
  strategy: "protective_put" | "covered_call" | "collar";
  score: number;
  legs: HedgeLeg[];
  metrics: Record<string, unknown>;
  rank: number;
}

export async function submitRun(snapshotId?: string): Promise<{ run_id: string }> {
  const body: Record<string, string> = {};
  if (snapshotId) body.snapshot_id = snapshotId;
  return fetchJSON("/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function getRun(runId: string): Promise<RunStatus> {
  return fetchJSON(`/runs/${runId}`);
}

export interface ComboPoint {
  hedge_ratio: number;
  total_cost: number;
  total_cost_pct: number;
  leg_count: number;
  candidate_ids: string[];
  symbols: string[];
}

export interface OptimizationResult {
  frontier: ComboPoint[];
  optimal: ComboPoint | null;
  min_cost: ComboPoint | null;
  max_hedge: ComboPoint | null;
  portfolio_value: number;
  total_delta_exposure: number;
}

export async function getCandidates(runId: string, limit = 20): Promise<HedgeCandidate[]> {
  return fetchJSON(`/runs/${runId}/candidates?limit=${limit}`);
}

export async function optimizeRun(runId: string): Promise<OptimizationResult> {
  return fetchJSON(`/runs/${runId}/optimize`, { method: "POST" });
}
