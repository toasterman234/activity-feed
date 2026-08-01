#!/usr/bin/env python3
"""Life OS DuckDB → Postgres ingestion for electric-circuits sync.

Reads finance views from the Life OS analytical DuckDB and upserts into Postgres
tables that the electric-circuits engine streams to the PWA dashboard.

Run:
    python3 sync_lifeos_to_pg.py
    python3 sync_lifeos_to_pg.py --once   # single run, no loop

Requires: duckdb, psycopg (pip install duckdb psycopg psycopg-binary)
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import duckdb
import psycopg

# ── Config ──

DUCKDB_PATH = os.path.expanduser("~/.life/analytical/footprint.duckdb")
PG_DSN = os.environ.get("FINANCE_PG_DSN", "postgresql://activity:activity@localhost:5433/activity_log")

# Tables the electric-circuits engine needs to know about:
# Add these to the ELECTRIC_CIRCUITS_PG_TABLES env var on the engine container.
REQUIRED_TABLES = [
    "portfolio_positions",
    "portfolio_trades",
    "portfolio_balances",
    "portfolio_net_worth",
    "portfolio_benchmarks",
    "portfolio_allocation",
]

# Tables that exist but are NOT streamed by electric-circuits (hedge engine
# reads them directly). Don't add to REQUIRED_TABLES / REPLICA IDENTITY FULL.
DIRECT_READ_TABLES = [
    "portfolio_option_positions",
]

# ── DB helpers ──

def get_pg_conn() -> psycopg.Connection:
    return psycopg.connect(PG_DSN, autocommit=True)


def ensure_pg_tables(conn: psycopg.Connection) -> None:
    """Create Postgres tables with REPLICA IDENTITY FULL for electric-circuits."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS portfolio_positions (
            id TEXT PRIMARY KEY,
            symbol TEXT,
            name TEXT,
            qty DOUBLE PRECISION,
            price DOUBLE PRECISION,
            market_value DOUBLE PRECISION,
            asset_class TEXT,
            institution TEXT,
            account_name TEXT,
            account_kind TEXT,
            position_kind TEXT,
            as_of_date TEXT,
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS portfolio_trades (
            trade_id TEXT PRIMARY KEY,
            symbol TEXT,
            description TEXT,
            side TEXT,
            quantity DOUBLE PRECISION,
            price DOUBLE PRECISION,
            proceeds DOUBLE PRECISION,
            date TEXT,
            is_option BOOLEAN,
            option_type TEXT,
            option_strike DOUBLE PRECISION,
            option_expiry TEXT,
            institution TEXT,
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS portfolio_balances (
            account_id TEXT PRIMARY KEY,
            institution TEXT,
            type TEXT,
            balance DOUBLE PRECISION,
            as_of_date TEXT,
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS portfolio_net_worth (
            date TEXT PRIMARY KEY,
            total_assets DOUBLE PRECISION,
            total_liabilities DOUBLE PRECISION,
            net_worth DOUBLE PRECISION,
            cash DOUBLE PRECISION,
            invested DOUBLE PRECISION,
            by_asset_class TEXT,
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS portfolio_benchmarks (
            symbol TEXT,
            date TEXT,
            close DOUBLE PRECISION,
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (symbol, date)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS portfolio_allocation (
            asset_class TEXT PRIMARY KEY,
            market_value DOUBLE PRECISION,
            target_pct DOUBLE PRECISION,
            current_pct DOUBLE PRECISION,
            drift_pct DOUBLE PRECISION,
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)

    # Portfolio option positions — materialised from trade netting.
    # Read directly by the hedge engine, NOT streamed via electric-circuits.
    conn.execute("""
        CREATE TABLE IF NOT EXISTS portfolio_option_positions (
            position_id TEXT PRIMARY KEY,
            symbol TEXT NOT NULL,
            underlying TEXT NOT NULL,
            option_type TEXT NOT NULL,
            option_strike DOUBLE PRECISION NOT NULL,
            option_expiry TEXT NOT NULL,
            quantity DOUBLE PRECISION NOT NULL,
            multiplier INTEGER DEFAULT 100,
            institution TEXT,
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)

    # REPLICA IDENTITY FULL — required by electric-circuits engine for logical replication
    for table in REQUIRED_TABLES:
        try:
            conn.execute(f"ALTER TABLE {table} REPLICA IDENTITY FULL")
        except Exception:
            pass  # may already be set


# ── Sync logic ──

def sync_positions(duck: duckdb.DuckDBPyConnection, pg: psycopg.Connection) -> int:
    rows = duck.execute("""
        SELECT
            account_id AS id, symbol, name, qty, price, market_value,
            asset_class, institution, account_name, account_kind,
            CASE
                WHEN upper(coalesce(symbol, '')) IN ('SPAXX', 'FDRXX', 'VMFXX', 'SWVXX', 'SNAXX')
                    THEN 'Cash sweep'
                WHEN source = 'wallet_eth' THEN 'On-chain'
                ELSE 'Security'
            END AS position_kind,
            as_of_date
        FROM finance.positions
        WHERE market_value IS NOT NULL AND ABS(market_value) > 0.01
    """).fetchall()

    now = datetime.now(timezone.utc).isoformat()
    count = 0
    for row in rows:
        pg.execute("""
            INSERT INTO portfolio_positions (id, symbol, name, qty, price, market_value,
                asset_class, institution, account_name, account_kind, position_kind,
                as_of_date, updated_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (id) DO UPDATE SET
                symbol=EXCLUDED.symbol, name=EXCLUDED.name, qty=EXCLUDED.qty,
                price=EXCLUDED.price, market_value=EXCLUDED.market_value,
                asset_class=EXCLUDED.asset_class, institution=EXCLUDED.institution,
                account_name=EXCLUDED.account_name, account_kind=EXCLUDED.account_kind,
                position_kind=EXCLUDED.position_kind, as_of_date=EXCLUDED.as_of_date,
                updated_at=EXCLUDED.updated_at
        """, (*row, now))
        count += 1
    return count


def sync_trades(duck: duckdb.DuckDBPyConnection, pg: psycopg.Connection) -> int:
    rows = duck.execute("""
        SELECT trade_id, symbol, description, side, quantity, price,
               proceeds, date, is_option, option_type, option_strike,
               option_expiry, institution
        FROM finance.trades
        ORDER BY date DESC
    """).fetchall()

    now = datetime.now(timezone.utc).isoformat()
    count = 0
    for row in rows:
        pg.execute("""
            INSERT INTO portfolio_trades (trade_id, symbol, description, side,
                quantity, price, proceeds, date, is_option, option_type,
                option_strike, option_expiry, institution, updated_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (trade_id) DO UPDATE SET
                symbol=EXCLUDED.symbol, description=EXCLUDED.description,
                side=EXCLUDED.side, quantity=EXCLUDED.quantity,
                price=EXCLUDED.price, proceeds=EXCLUDED.proceeds,
                date=EXCLUDED.date, is_option=EXCLUDED.is_option,
                option_type=EXCLUDED.option_type, option_strike=EXCLUDED.option_strike,
                option_expiry=EXCLUDED.option_expiry, institution=EXCLUDED.institution,
                updated_at=EXCLUDED.updated_at
        """, (*row, now))
        count += 1
    return count


def sync_balances(duck: duckdb.DuckDBPyConnection, pg: psycopg.Connection) -> int:
    rows = duck.execute("""
        SELECT account_id, institution, type, balance, as_of_date
        FROM finance.balances
        WHERE type IN ('checking', 'savings', 'brokerage_cash')
          AND balance IS NOT NULL
    """).fetchall()

    now = datetime.now(timezone.utc).isoformat()
    count = 0
    for row in rows:
        pg.execute("""
            INSERT INTO portfolio_balances (account_id, institution, type, balance,
                as_of_date, updated_at)
            VALUES (%s,%s,%s,%s,%s,%s)
            ON CONFLICT (account_id) DO UPDATE SET
                institution=EXCLUDED.institution, type=EXCLUDED.type,
                balance=EXCLUDED.balance, as_of_date=EXCLUDED.as_of_date,
                updated_at=EXCLUDED.updated_at
        """, (*row, now))
        count += 1
    return count


def sync_net_worth(duck: duckdb.DuckDBPyConnection, pg: psycopg.Connection) -> int:
    rows = duck.execute("""
        SELECT date, total_assets, total_liabilities, net_worth, cash, invested,
               CAST(by_asset_class AS VARCHAR) AS by_asset_class
        FROM finance.net_worth_daily
        ORDER BY date
    """).fetchall()

    now = datetime.now(timezone.utc).isoformat()
    count = 0
    for row in rows:
        pg.execute("""
            INSERT INTO portfolio_net_worth (date, total_assets, total_liabilities,
                net_worth, cash, invested, by_asset_class, updated_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (date) DO UPDATE SET
                total_assets=EXCLUDED.total_assets,
                total_liabilities=EXCLUDED.total_liabilities,
                net_worth=EXCLUDED.net_worth, cash=EXCLUDED.cash,
                invested=EXCLUDED.invested, by_asset_class=EXCLUDED.by_asset_class,
                updated_at=EXCLUDED.updated_at
        """, (*row, now))
        count += 1
    return count


def sync_benchmarks(duck: duckdb.DuckDBPyConnection, pg: psycopg.Connection) -> int:
    rows = duck.execute("""
        SELECT symbol, date, close FROM finance.benchmarks ORDER BY symbol, date
    """).fetchall()

    now = datetime.now(timezone.utc).isoformat()
    count = 0
    for row in rows:
        pg.execute("""
            INSERT INTO portfolio_benchmarks (symbol, date, close, updated_at)
            VALUES (%s,%s,%s,%s)
            ON CONFLICT (symbol, date) DO UPDATE SET
                close=EXCLUDED.close, updated_at=EXCLUDED.updated_at
        """, (*row, now))
        count += 1
    return count


def sync_option_positions(duck: duckdb.DuckDBPyConnection, pg: psycopg.Connection) -> int:
    """Net option trades to find open positions and materialise them.

    Matches the logic in dashboard/src/app/finance/use-option-greeks.ts
    (computeOpenOptions) but runs server-side during ingestion.
    """
    rows = duck.execute("""
        SELECT
            symbol, option_type, option_strike, option_expiry,
            side, quantity, institution
        FROM finance.trades
        WHERE is_option = true
          AND option_type IS NOT NULL
          AND option_strike IS NOT NULL
          AND option_expiry IS NOT NULL
        ORDER BY date
    """).fetchall()

    # Net by contract key: symbol|option_type|option_strike|option_expiry
    contracts: dict[str, dict] = {}
    for row in rows:
        symbol, opt_type, strike, expiry, side, qty, institution = row
        # Skip rows with NULL key fields
        if not symbol or not opt_type or strike is None or not expiry:
            continue
        key = f"{symbol}|{opt_type}|{strike}|{expiry}"
        if key not in contracts:
            contracts[key] = {
                "symbol": symbol,
                "option_type": opt_type.lower(),
                "option_strike": float(strike),
                "option_expiry": expiry,
                "quantity": 0.0,
                "institution": institution,
            }
        # sell increases short (subtract), buy reduces (add)
        if (side or "").upper() == "SELL":
            contracts[key]["quantity"] -= float(qty)
        else:
            contracts[key]["quantity"] += float(qty)

    now = datetime.now(timezone.utc).isoformat()
    count = 0

    for key, c in contracts.items():
        qty = c["quantity"]
        # Skip closed positions (net zero within tolerance)
        if abs(qty) < 0.001:
            continue

        # Extract underlying from option symbol (OCC format: AAPL250117P00180000 → AAPL)
        m = re.match(r"^([A-Z]+)\d{6}", c["symbol"])
        underlying = m.group(1) if m else c["symbol"][:5]

        position_id = key
        pg.execute("""
            INSERT INTO portfolio_option_positions
                (position_id, symbol, underlying, option_type, option_strike,
                 option_expiry, quantity, multiplier, institution, updated_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (position_id) DO UPDATE SET
                symbol=EXCLUDED.symbol,
                underlying=EXCLUDED.underlying,
                option_type=EXCLUDED.option_type,
                option_strike=EXCLUDED.option_strike,
                option_expiry=EXCLUDED.option_expiry,
                quantity=EXCLUDED.quantity,
                institution=EXCLUDED.institution,
                updated_at=EXCLUDED.updated_at
        """, (
            position_id,
            c["symbol"], underlying, c["option_type"], c["option_strike"],
            c["option_expiry"], qty, 100, c["institution"], now,
        ))
        count += 1

    return count


def sync_allocation(duck: duckdb.DuckDBPyConnection, pg: psycopg.Connection) -> int:
    """Compute allocation from positions + balances + home value using finance views."""
    rows = duck.execute("SELECT * FROM finance.v_allocation").fetchall()

    now = datetime.now(timezone.utc).isoformat()
    count = 0
    for row in rows:
        pg.execute("""
            INSERT INTO portfolio_allocation (asset_class, market_value, target_pct,
                current_pct, drift_pct, updated_at)
            VALUES (%s,%s,%s,%s,%s,%s)
            ON CONFLICT (asset_class) DO UPDATE SET
                market_value=EXCLUDED.market_value, target_pct=EXCLUDED.target_pct,
                current_pct=EXCLUDED.current_pct, drift_pct=EXCLUDED.drift_pct,
                updated_at=EXCLUDED.updated_at
        """, (*row, now))
        count += 1
    return count


# ── Main ──

def sync_all() -> dict[str, int]:
    if not Path(DUCKDB_PATH).exists():
        print(f"ERROR: DuckDB not found at {DUCKDB_PATH}")
        sys.exit(1)

    duck = duckdb.connect(str(DUCKDB_PATH), read_only=True)
    pg = get_pg_conn()

    ensure_pg_tables(pg)

    counts: dict[str, int] = {}
    for name, fn in [
        ("positions", sync_positions),
        ("trades", sync_trades),
        ("balances", sync_balances),
        ("net_worth", sync_net_worth),
        ("benchmarks", sync_benchmarks),
        ("option_positions", sync_option_positions),
        ("allocation", sync_allocation),
    ]:
        try:
            n = fn(duck, pg)
            counts[name] = n
            print(f"  {name}: {n} rows")
        except Exception as e:
            print(f"  {name}: ERROR — {e}")
            counts[name] = -1

    duck.close()
    pg.close()
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync Life OS DuckDB → Postgres")
    parser.add_argument("--once", action="store_true", help="Run once and exit")
    parser.add_argument("--interval", type=int, default=3600, help="Loop interval in seconds")
    args = parser.parse_args()

    print(f"Life OS → Postgres ingestion — {datetime.now(timezone.utc).isoformat()}")
    print(f"  DuckDB: {DUCKDB_PATH}")
    print(f"  Postgres: {PG_DSN}")

    counts = sync_all()
    total = sum(c for c in counts.values() if c > 0)
    print(f"  TOTAL: {total} rows synced\n")

    if args.once:
        return

    print(f"Looping every {args.interval}s. Ctrl+C to stop.")
    while True:
        time.sleep(args.interval)
        print(f"Sync — {datetime.now(timezone.utc).isoformat()}")
        sync_all()
        print()


if __name__ == "__main__":
    main()
