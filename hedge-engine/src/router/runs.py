"""Hedge run API endpoints — submit scans, check status, fetch results."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, BackgroundTasks, Request

from ..db import get_conn
from ..portfolio.snapshot import get_snapshot
from ..scanner import scan_candidates, ScanConfig
from ..optimizer import optimize_combinations, OptimizeConfig
from ..simulator import simulate_hedge, SimulateConfig

router = APIRouter()

import asyncio as _asyncio


def _fire_and_forget(coro):
    """Schedule a coroutine to run in the background without blocking."""
    loop = _asyncio.get_running_loop()
    loop.create_task(coro)


@router.post("", response_model=None)
async def create_run(body: dict | None = None):
    """Submit a new hedge scan run.

    Body (optional):
      - snapshot_id: str — use existing snapshot
      - assumption_set_id: str — apply saved assumption set

    If no snapshot_id provided, creates a new snapshot first.
    """
    conn = get_conn()
    try:
        body = body or {}
        snapshot_id = body.get("snapshot_id")

        if not snapshot_id:
            # Create fresh snapshot
            from ..portfolio.snapshot import build_snapshot
            snap = build_snapshot()
            snapshot_id = snap["snapshot_id"]
        else:
            # Verify snapshot exists
            snap = get_snapshot(snapshot_id)
            if not snap:
                raise HTTPException(status_code=404, detail="Snapshot not found")

        now = datetime.now(timezone.utc)
        run_id = str(uuid.uuid4())

        # Load assumption set if provided
        assumption_id = body.get("assumption_set_id")
        scan_config = ScanConfig()
        if assumption_id:
            row = conn.execute(
                "SELECT params FROM hedge.assumption_sets WHERE id = %s",
                (assumption_id,),
            ).fetchone()
            if row:
                params = row[0] if isinstance(row[0], dict) else json.loads(row[0])
                scan_config = _config_from_params(params)

        # Persist run
        conn.execute(
            """
            INSERT INTO hedge.runs (id, snapshot_id, assumption_set_id, status, params)
            VALUES (%s, %s, %s, 'pending', %s)
            """,
            (run_id, snapshot_id, assumption_id, json.dumps(body)),
        )

        # Fire-and-forget: run scan in background, return instantly.
        # Frontend polls GET /runs/{id} to check status.
        _fire_and_forget(_execute_scan(run_id, snapshot_id, scan_config))

        return {
            "run_id": run_id,
            "snapshot_id": snapshot_id,
            "status": "pending",
        }

    finally:
        conn.close()


@router.get("/{run_id}")
async def get_run(run_id: str):
    """Get the status and summary of a hedge run."""
    conn = get_conn()
    try:
        row = conn.execute(
            """
            SELECT id, snapshot_id, assumption_set_id, status, params, summary,
                   started_at, completed_at, error, created_at
            FROM hedge.runs WHERE id = %s
            """,
            (run_id,),
        ).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Run not found")

        return {
            "run_id": row[0],
            "snapshot_id": row[1],
            "assumption_set_id": row[2],
            "status": row[3],
            "params": row[4],
            "summary": row[5],
            "started_at": row[6] and row[6].isoformat(),
            "completed_at": row[7] and row[7].isoformat(),
            "error": row[8],
            "created_at": row[9] and row[9].isoformat(),
        }

    finally:
        conn.close()


@router.get("/{run_id}/candidates")
async def get_candidates(run_id: str, limit: int = 20):
    """Get ranked hedge candidates for a run."""
    conn = get_conn()
    try:
        rows = conn.execute(
            """
            SELECT id, symbol, strategy, score, legs, metrics, rank
            FROM hedge.candidates
            WHERE run_id = %s
            ORDER BY rank
            LIMIT %s
            """,
            (run_id, limit),
        ).fetchall()

        return [
            {
                "candidate_id": r[0],
                "symbol": r[1],
                "strategy": r[2],
                "score": r[3],
                "legs": r[4],
                "metrics": r[5],
                "rank": r[6],
            }
            for r in rows
        ]

    finally:
        conn.close()


@router.post("/{run_id}/optimize")
async def optimize_run(run_id: str):
    """Run combination optimization on a completed scan."""
    conn = get_conn()
    try:
        run_row = conn.execute(
            "SELECT status FROM hedge.runs WHERE id = %s", (run_id,),
        ).fetchone()
        if not run_row:
            raise HTTPException(status_code=404, detail="Run not found")
        if run_row[0] not in ("complete", "optimized"):
            raise HTTPException(status_code=400, detail=f"Run is {run_row[0]}, must be complete")

        cand_rows = conn.execute(
            "SELECT id, symbol, strategy, score, legs, metrics, rank FROM hedge.candidates WHERE run_id = %s",
            (run_id,),
        ).fetchall()
        if not cand_rows:
            raise HTTPException(status_code=400, detail="No candidates to optimize")

        candidates = [
            {"candidate_id": str(r[0]), "symbol": r[1], "strategy": r[2],
             "score": r[3], "legs": r[4], "metrics": r[5], "rank": r[6]}
            for r in cand_rows
        ]

        pv = sum(abs(l.get("quantity", 0) * (l.get("estimated_price") or 0))
                 for c in candidates for l in c.get("legs", [])
                 if l.get("leg_type") == "underlying")
        if pv == 0:
            pv = 100000

        result = await optimize_combinations(candidates, pv)

        import json as _json
        now = datetime.now(timezone.utc)
        conn.execute(
            """INSERT INTO hedge.optimization_frontiers (id, run_id, frontier_data, optimal_points)
               VALUES (%s, %s, %s, %s)""",
            (str(uuid.uuid4()), run_id,
             _json.dumps([{ "hedge_ratio": f.hedge_ratio, "total_cost": f.total_cost,
               "total_cost_pct": f.total_cost_pct, "leg_count": f.leg_count,
               "candidate_ids": f.candidate_ids, "symbols": f.symbols,
               "strategies": f.strategies } for f in result.frontier]),
             _json.dumps({ "optimal": _combo_dict(result.optimal),
               "min_cost": _combo_dict(result.min_cost),
               "max_hedge": _combo_dict(result.max_hedge) }) if result.optimal else None),
        )
        conn.execute("UPDATE hedge.runs SET status = 'optimized' WHERE id = %s", (run_id,))

        return {
            "frontier": [{ "hedge_ratio": f.hedge_ratio, "total_cost": f.total_cost,
                "total_cost_pct": f.total_cost_pct, "leg_count": f.leg_count,
                "symbols": f.symbols, "candidate_ids": f.candidate_ids } for f in result.frontier[:20]],
            "optimal": _combo_dict(result.optimal),
            "min_cost": _combo_dict(result.min_cost),
            "max_hedge": _combo_dict(result.max_hedge),
            "portfolio_value": result.portfolio_value,
            "total_delta_exposure": result.total_delta_exposure,
        }
    finally:
        conn.close()


def _combo_dict(point) -> dict | None:
    if point is None:
        return None
    return { "hedge_ratio": point.hedge_ratio, "total_cost": point.total_cost,
        "total_cost_pct": point.total_cost_pct, "leg_count": point.leg_count,
        "candidate_ids": point.candidate_ids, "symbols": point.symbols,
        "strategies": point.strategies }


@router.post("/{run_id}/simulate")
async def simulate_run(run_id: str):
    """Run rolling simulation on a completed scan's top candidates."""
    conn = get_conn()
    try:
        run_row = conn.execute(
            "SELECT status FROM hedge.runs WHERE id = %s", (run_id,),
        ).fetchone()
        if not run_row:
            raise HTTPException(status_code=404, detail="Run not found")

        cand_rows = conn.execute(
            "SELECT id, symbol, strategy, score, legs, metrics, rank FROM hedge.candidates WHERE run_id = %s ORDER BY rank LIMIT 5",
            (run_id,),
        ).fetchall()
        if not cand_rows:
            raise HTTPException(status_code=400, detail="No candidates to simulate")

        candidates = [
            {"candidate_id": str(r[0]), "symbol": r[1], "strategy": r[2],
             "score": r[3], "legs": r[4], "metrics": r[5], "rank": r[6]}
            for r in cand_rows
        ]

        results = await simulate_hedge(candidates)

        # Persist rolling results
        import json as _json
        for r in results:
            cand_id = next(
                (c["candidate_id"] for c in candidates if c["symbol"] == r.symbol),
                None,
            )
            if not cand_id:
                continue
            for w in r.windows:
                conn.execute(
                    """INSERT INTO hedge.rolling_results
                       (id, run_id, candidate_id, window_start, window_end, metrics)
                       VALUES (%s, %s, %s, %s, %s, %s)""",
                    (str(uuid.uuid4()), run_id, cand_id,
                     w.start_date, w.end_date,
                     _json.dumps({
                         "portfolio_return": w.portfolio_return,
                         "hedged_return": w.hedged_return,
                         "hedge_cost": w.hedge_cost,
                         "hedge_pnl": w.hedge_pnl,
                         "hedge_breakeven": w.hedge_breakeven,
                         "benchmark_return": w.benchmark_return,
                     })),
                )

        conn.execute("UPDATE hedge.runs SET status = 'simulated' WHERE id = %s", (run_id,))

        return [{
            "symbol": r.symbol,
            "strategy": r.strategy,
            "total_windows": r.total_windows,
            "hedged_wins": r.hedged_wins,
            "win_rate": r.win_rate,
            "avg_hedge_cost": r.avg_hedge_cost,
            "avg_hedge_pnl": r.avg_hedge_pnl,
            "avg_hedge_return": r.avg_hedged_return,
            "avg_unhedged_return": r.avg_unhedged_return,
            "max_drawdown_reduction": r.max_drawdown_reduction,
            "windows": [{
                "start_date": w.start_date,
                "end_date": w.end_date,
                "hedged_return": w.hedged_return,
                "unhedged_return": w.portfolio_return,
                "hedge_pnl": w.hedge_pnl,
                "breakeven": w.hedge_breakeven,
            } for w in r.windows],
        } for r in results]

    finally:
        conn.close()


# ── Background execution ──

async def _execute_scan(
    run_id: str,
    snapshot_id: str,
    config: ScanConfig,
) -> None:
    """Execute a hedge scan and persist results."""
    conn = get_conn()
    try:
        now = datetime.now(timezone.utc)

        # Mark running
        conn.execute(
            "UPDATE hedge.runs SET status = 'running', started_at = %s WHERE id = %s",
            (now, run_id),
        )

        # Load snapshot
        snapshot = get_snapshot(snapshot_id)
        if not snapshot:
            conn.execute(
                "UPDATE hedge.runs SET status = 'failed', error = 'Snapshot not found', completed_at = %s WHERE id = %s",
                (now, run_id),
            )
            return

        # Run scan
        candidates = await scan_candidates(snapshot, config)

        # Persist candidates
        for rank, candidate in enumerate(candidates):
            cand_id = str(uuid.uuid4())
            conn.execute(
                """
                INSERT INTO hedge.candidates
                    (id, run_id, symbol, strategy, score, legs, metrics, rank)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    cand_id,
                    run_id,
                    candidate.symbol,
                    candidate.strategy,
                    candidate.score,
                    json.dumps([_leg_to_dict(l) for l in candidate.legs]),
                    json.dumps(candidate.metrics),
                    rank + 1,
                ),
            )

            # Persist individual legs
            for leg in candidate.legs:
                leg_id = str(uuid.uuid4())
                conn.execute(
                    """
                    INSERT INTO hedge.candidate_legs
                        (id, candidate_id, leg_type, symbol, option_type,
                         strike, expiration, quantity, estimated_price,
                         delta, gamma, theta, vega)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        leg_id, cand_id,
                        leg.leg_type, leg.symbol, leg.option_type,
                        leg.strike, leg.expiration, leg.quantity,
                        leg.estimated_price, leg.delta, leg.gamma,
                        leg.theta, leg.vega,
                    ),
                )

        # Mark complete
        summary = json.dumps({
            "total_candidates": len(candidates),
            "strategies": list(set(c.strategy for c in candidates)),
            "symbols_scanned": list(set(c.symbol for c in candidates)),
            "top_score": candidates[0].score if candidates else 0,
        })

        conn.execute(
            """
            UPDATE hedge.runs
            SET status = 'complete', summary = %s, completed_at = %s
            WHERE id = %s
            """,
            (summary, datetime.now(timezone.utc), run_id),
        )

    except Exception as e:
        conn.execute(
            """
            UPDATE hedge.runs
            SET status = 'failed', error = %s, completed_at = %s
            WHERE id = %s
            """,
            (str(e), datetime.now(timezone.utc), run_id),
        )
    finally:
        conn.close()


def _leg_to_dict(leg) -> dict:
    """Convert a HedgeLeg dataclass to a dict for JSONB storage."""
    return {
        "leg_type": leg.leg_type,
        "symbol": leg.symbol,
        "option_type": leg.option_type,
        "strike": leg.strike,
        "expiration": leg.expiration,
        "quantity": leg.quantity,
        "estimated_price": leg.estimated_price,
        "delta": leg.delta,
        "gamma": leg.gamma,
        "theta": leg.theta,
        "vega": leg.vega,
    }


def _config_from_params(params: dict) -> ScanConfig:
    """Build a ScanConfig from a saved assumption set's params."""
    return ScanConfig(
        put_strikes=tuple(params.get("put_strikes", (0.95, 0.90, 0.85))),
        call_strikes=tuple(params.get("call_strikes", (1.05, 1.10))),
        expiration_months=tuple(params.get("expiration_months", (1, 2, 3))),
        min_open_interest=params.get("min_open_interest", 10),
        max_cost_pct=params.get("max_cost_pct", 0.10),
        min_credit_pct=params.get("min_credit_pct", 0.002),
        risk_free_rate=params.get("risk_free_rate", 0.05),
        max_symbols=params.get("max_symbols", 20),
    )
