"""Portfolio snapshot API endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..portfolio.snapshot import build_snapshot, get_snapshot

router = APIRouter()


@router.post("")
async def create_snapshot():
    """Create a new immutable portfolio snapshot from current holdings.

    Reads portfolio_positions, portfolio_option_positions, and
    portfolio_balances from PostgreSQL. Does NOT fetch live market
    data — Greeks must be fetched by the hedge scanner at run time.
    """
    try:
        snapshot = build_snapshot()
        return {
            "snapshot_id": snapshot["snapshot_id"],
            "valuation_time": snapshot["valuation_time"],
            "total_positions": snapshot["data_quality"]["total_positions"],
            "option_positions": snapshot["data_quality"]["option_positions"],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{snapshot_id}")
async def read_snapshot(snapshot_id: str):
    """Retrieve a previously created snapshot by ID."""
    snapshot = get_snapshot(snapshot_id)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return snapshot
