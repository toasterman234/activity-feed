"""PostgreSQL connection — single-connection, single-user service."""

from __future__ import annotations

import psycopg

from .config import PG_DSN


def get_conn() -> psycopg.Connection:
    """Return a new autocommit connection. Caller must close it."""
    return psycopg.connect(PG_DSN, autocommit=True)
