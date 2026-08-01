"""Hedge Engine API — FastAPI application."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .router import health, snapshots, runs


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown. No background worker yet — will add in Phase 3."""
    yield


app = FastAPI(
    title="Hedge Engine",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — allow dashboard to call from any origin during dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ──

app.include_router(health.router, tags=["health"])
app.include_router(snapshots.router, prefix="/snapshots", tags=["snapshots"])
app.include_router(runs.router, prefix="/runs", tags=["runs"])
