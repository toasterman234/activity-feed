"""Portfolio snapshot assembly — reads from PostgreSQL, writes to hedge.* schema."""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

import psycopg

from ..db import get_conn


def _parse_underlying(option_symbol: str) -> str:
    """Extract underlying from OCC option symbol (e.g. AAPL250117P00180000 → AAPL)."""
    m = re.match(r"^([A-Z]+)\d{6}", option_symbol)
    return m.group(1) if m else option_symbol[:5]


def build_snapshot() -> dict:
    """Create an immutable portfolio snapshot from current PostgreSQL data.

    Reads:
      - portfolio_positions (equity, crypto, cash)
      - portfolio_option_positions (open option contracts, materialised in Step 0.1)
      - portfolio_balances (cash)

    Does NOT fetch live Greeks — that will be done by the hedge scanner
    when it processes the snapshot. The snapshot is a frozen point-in-time
    view of holdings.
    """
    conn = get_conn()
    try:
        now = datetime.now(timezone.utc)
        snapshot_id = str(uuid.uuid4())

        # ── Positions (equity, crypto, cash sweep) ──
        equity_rows = conn.execute("""
            SELECT id, symbol, name, qty, price, market_value,
                   asset_class, institution, account_name, account_kind,
                   position_kind, as_of_date
            FROM portfolio_positions
            ORDER BY market_value DESC
        """).fetchall()

        positions = []
        total_market_value = 0.0

        for row in equity_rows:
            (
                pos_id, symbol, name, qty, price, market_value,
                asset_class, institution, account_name, account_kind,
                position_kind, as_of_date,
            ) = row

            mv = float(market_value or 0)
            total_market_value += mv

            asset_type = "equity"
            if asset_class == "crypto" or position_kind == "On-chain":
                asset_type = "crypto"
            elif position_kind == "Cash sweep":
                asset_type = "cash"

            positions.append({
                "position_id": pos_id,
                "symbol": symbol,
                "name": name,
                "asset_type": asset_type,
                "quantity": float(qty or 0),
                "market_price": float(price or 0),
                "market_value": mv,
                "cost_basis": None,  # not stored — trade agg needed
                "unrealized_pnl": None,
                "currency": "USD",
                "sector": None,  # fetched on demand by hedge engine
                "institution": institution,
                "account_id": pos_id.split(":")[0] if ":" in (pos_id or "") else pos_id,
                "option": None,
                "metadata": {
                    "source": "portfolio_positions",
                    "as_of_date": as_of_date,
                    "position_kind": position_kind,
                },
            })

        # ── Option positions (materialised from trade netting) ──
        option_rows = conn.execute("""
            SELECT position_id, symbol, underlying, option_type,
                   option_strike, option_expiry, quantity, multiplier,
                   institution
            FROM portfolio_option_positions
            WHERE ABS(quantity) > 0.001
            ORDER BY option_expiry
        """).fetchall()

        for row in option_rows:
            (
                pos_id, symbol, underlying, opt_type,
                strike, expiry, qty, multiplier, institution,
            ) = row

            qty_f = float(qty)
            mult = int(multiplier or 100)
            mv = abs(qty_f) * float(strike) * mult  # gross notional

            positions.append({
                "position_id": f"opt:{pos_id}",
                "symbol": symbol,
                "name": f"{underlying} {opt_type.upper()} {strike} {expiry}",
                "asset_type": "option",
                "quantity": qty_f,
                "market_price": None,  # filled by Market Lake during scan
                "market_value": None,
                "cost_basis": None,
                "unrealized_pnl": None,
                "currency": "USD",
                "sector": None,
                "institution": institution,
                "account_id": institution,
                "option": {
                    "underlying": underlying,
                    "expiration": expiry,
                    "strike": float(strike),
                    "option_type": opt_type,
                    "side": "short" if qty_f < 0 else "long",
                    "multiplier": mult,
                    "exercise_style": "american",
                    # Live data not yet fetched — hedge engine fills these
                    "current_price": None,
                    "bid": None,
                    "ask": None,
                    "implied_volatility": None,
                    "delta": None,
                    "gamma": None,
                    "vega": None,
                    "theta": None,
                    "open_interest": None,
                    "volume": None,
                    "greeks_source": None,
                    "greeks_timestamp": None,
                },
                "metadata": {
                    "source": "portfolio_option_positions (trade netting)",
                    "granted": qty_f > 0,
                    "short": qty_f < 0,
                },
            })

        # ── Cash balances ──
        cash_rows = conn.execute("""
            SELECT SUM(balance) FROM portfolio_balances
            WHERE type IN ('checking', 'savings', 'brokerage_cash')
        """).fetchone()

        cash_value = float(cash_rows[0]) if cash_rows and cash_rows[0] else 0.0

        # ── Assemble snapshot ──
        snapshot = {
            "snapshot_id": snapshot_id,
            "valuation_time": now.isoformat(),
            "base_currency": "USD",
            "total_value": total_market_value + cash_value,
            "cash_value": cash_value,
            "benchmark": "SPY",
            "positions": positions,
            "existing_metrics": {},
            "data_quality": {
                "option_positions_materialized": len(option_rows) > 0,
                "greeks_available": False,  # not fetched at snapshot time
                "total_positions": len(positions),
                "equity_positions": len(equity_rows),
                "option_positions": len(option_rows),
                "warnings": [],
            },
            "source_versions": {
                "portfolio_positions": "PostgreSQL",
                "portfolio_option_positions": "PostgreSQL (trade netting)",
                "snapshot_format_version": "1.0.0",
            },
        }

        # ── Persist to hedge.portfolio_snapshots ──
        import json
        conn.execute(
            """
            INSERT INTO hedge.portfolio_snapshots
                (id, snapshot_data, valuation_time)
            VALUES (%s, %s, %s)
            """,
            (snapshot_id, json.dumps(snapshot), now),
        )

        return snapshot

    finally:
        conn.close()


def get_snapshot(snapshot_id: str) -> dict | None:
    """Retrieve an existing snapshot by ID."""
    conn = get_conn()
    try:
        row = conn.execute(
            "SELECT snapshot_data FROM hedge.portfolio_snapshots WHERE id = %s",
            (snapshot_id,),
        ).fetchone()
        return row[0] if row else None
    finally:
        conn.close()
