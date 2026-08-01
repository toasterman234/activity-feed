"""Hedge combination optimizer — Phase 4.

Given a set of hedge candidates, finds optimal multi-leg combinations.
Uses correlation matrix from historical prices + brute-force enumeration
for small candidate sets (practical for single-user portfolios).
"""

from __future__ import annotations

import asyncio
from collections import defaultdict
from dataclasses import dataclass, field

import numpy as np

from .. import market_lake_client as ml


# ── Types ──

@dataclass
class ComboPoint:
    hedge_ratio: float
    total_cost: float
    total_cost_pct: float
    leg_count: int
    candidate_ids: list[str] = field(default_factory=list)
    symbols: list[str] = field(default_factory=list)
    strategies: list[str] = field(default_factory=list)


@dataclass
class OptimizationResult:
    portfolio_value: float
    total_delta_exposure: float
    frontier: list[ComboPoint]
    optimal: ComboPoint | None = None
    min_cost: ComboPoint | None = None
    max_hedge: ComboPoint | None = None


@dataclass
class OptimizeConfig:
    max_legs: int = 6
    min_hedge_ratio: float = 0.10
    max_cost_pct: float = 0.10
    correlation_window: int = 126
    min_unique_symbols: int = 1
    max_combos_per_symbol: int = 3


# ── Entry point ──

async def optimize_combinations(
    candidates: list[dict],
    portfolio_value: float,
    config: OptimizeConfig | None = None,
) -> OptimizationResult:
    if config is None:
        config = OptimizeConfig()

    if not candidates:
        return OptimizationResult(portfolio_value=portfolio_value, total_delta_exposure=0, frontier=[])

    cand_vectors = _normalize_candidates(candidates, portfolio_value)
    symbols = list(set(c["symbol"] for c in candidates))
    corr_matrix = await _compute_correlation_matrix(symbols, config.correlation_window)
    combos = _enumerate_combinations(cand_vectors, corr_matrix, config)
    combos.sort(key=_combo_score, reverse=True)

    optimal = combos[0] if combos else None
    effective = [c for c in combos if c.hedge_ratio >= config.min_hedge_ratio]
    min_cost = min(effective, key=lambda c: c.total_cost) if effective else None
    max_hedge = max(combos, key=lambda c: c.hedge_ratio) if combos else None

    return OptimizationResult(
        portfolio_value=portfolio_value,
        total_delta_exposure=sum(c["total_delta"] for c in cand_vectors),
        frontier=combos[:50],
        optimal=optimal,
        min_cost=min_cost,
        max_hedge=max_hedge,
    )


# ── Helpers ──

def _normalize_candidates(candidates: list[dict], pv: float) -> list[dict]:
    result = []
    for c in candidates:
        legs = c.get("legs", [])
        opts = [l for l in legs if l.get("leg_type") != "underlying"]
        total_delta = sum((l.get("delta") or 0) * abs(l.get("quantity", 0)) for l in opts)
        total_cost = sum((l.get("estimated_price") or 0) * abs(l.get("quantity", 0)) for l in opts)
        result.append({
            "candidate_id": c.get("candidate_id"),
            "symbol": c.get("symbol"),
            "strategy": c.get("strategy"),
            "score": c.get("score", 0),
            "total_delta": total_delta,
            "total_cost": total_cost,
            "total_cost_pct": total_cost / pv if pv else 0,
            "hedge_ratio": abs(total_delta) / 100.0,
        })
    return result


async def _compute_correlation_matrix(symbols: list[str], window: int) -> dict[tuple[str, str], float]:
    if len(symbols) <= 1:
        return {}

    all_bars: dict[str, list[ml.DailyBar]] = {}
    for i in range(0, len(symbols), 5):
        batch = symbols[i:i + 5]
        results = await asyncio.gather(
            *[ml.get_historical_prices(s, days=window) for s in batch],
            return_exceptions=True,
        )
        for sym, result in zip(batch, results):
            if not isinstance(result, Exception) and result:
                all_bars[sym] = result

    corr = {}
    sym_list = list(all_bars.keys())
    for i, sa in enumerate(sym_list):
        for sb in sym_list[i:]:
            a = np.array([b.close for b in all_bars.get(sa, []) if b.close is not None], dtype=float)
            b = np.array([b.close for b in all_bars.get(sb, []) if b.close is not None], dtype=float)
            val = 0.5
            if len(a) >= 2 and len(b) >= 2:
                n = min(len(a), len(b))
                try:
                    coef = float(np.corrcoef(a[-n:], b[-n:])[0, 1])
                    val = coef if not np.isnan(coef) else 0.5
                except Exception:
                    pass
            corr[(sa, sb)] = val
            corr[(sb, sa)] = val
    return corr


def _enumerate_combinations(cands: list[dict], corr: dict, config: OptimizeConfig) -> list[ComboPoint]:
    by_sym = defaultdict(list)
    for c in cands:
        by_sym[c["symbol"]].append(c)
    top = []
    for sym, cs in by_sym.items():
        top.extend(sorted(cs, key=lambda c: c["score"], reverse=True)[:config.max_combos_per_symbol])

    combos = []
    for c in top:
        combos.append(_make_combo([c], corr))
    for i, c1 in enumerate(top):
        for c2 in top[i + 1:]:
            combos.append(_make_combo([c1, c2], corr))
    for i, c1 in enumerate(top):
        for j, c2 in enumerate(top[i + 1:], i + 1):
            for c3 in top[j + 1:]:
                combos.append(_make_combo([c1, c2, c3], corr))

    return [c for c in combos if c.total_cost_pct <= config.max_cost_pct]


def _make_combo(cands: list[dict], corr: dict) -> ComboPoint:
    syms = list(set(c["symbol"] for c in cands))
    total_delta = sum(c["total_delta"] for c in cands)
    total_cost = sum(c["total_cost"] for c in cands)
    total_cost_pct = sum(c["total_cost_pct"] for c in cands)
    hr = min(1.0, abs(total_delta) / 100.0)
    # diversification bonus
    if len(syms) > 1:
        pairs = sum(abs(corr.get((s1, s2), 0.5)) for i, s1 in enumerate(syms) for s2 in syms[i + 1:])
        avg_corr = pairs / (len(syms) * (len(syms) - 1) / 2)
        hr = hr * (0.7 + 0.3 * (1.0 - avg_corr))
    return ComboPoint(
        hedge_ratio=min(1.0, hr),
        total_cost=total_cost,
        total_cost_pct=total_cost_pct,
        leg_count=len(cands),
        candidate_ids=[c["candidate_id"] for c in cands],
        symbols=syms,
        strategies=[c["strategy"] for c in cands],
    )


def _combo_score(c: ComboPoint) -> float:
    return c.hedge_ratio * 0.50 + (0.30 if c.total_cost < 0 else max(0, 0.30 - c.total_cost_pct * 3)) + min(0.20, len(c.symbols) * 0.10)
