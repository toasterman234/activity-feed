"""Hedge Engine — configuration from environment."""

from __future__ import annotations

import os

PG_DSN = os.environ.get(
    "FINANCE_PG_DSN",
    "postgresql://activity:activity@localhost:5433/activity_log",
)

MARKET_LAKE_URL = os.environ.get(
    "MARKET_LAKE_URL",
    "http://127.0.0.1:9077",
)

# How long a single hedge job is allowed to run before timeout (seconds)
JOB_TIMEOUT_SECONDS = int(os.environ.get("HEDGE_JOB_TIMEOUT", "1800"))

# How often the worker loop polls for new jobs (seconds)
WORKER_POLL_INTERVAL = int(os.environ.get("HEDGE_WORKER_POLL", "5"))
