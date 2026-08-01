"""Hedge candidate scanner — Phase 3.

Given a portfolio snapshot, generates a ranked list of hedge candidates:
  - Protective Put: buy OTM puts on owned equity
  - Covered Call: sell OTM calls on owned equity
  - Collar: protective put + covered call combo

Strategy:
  1. For each equity position that has options available
  2. Fetch live option chain from Market Lake
  3. Generate candidates at specified OTM percentages
  4. Score each candidate by cost, protection level, vol regime, fundamentals
  5. Return ranked list
"""

from __future__ import annotations

import asyncio
import math
from dataclasses import dataclass, field

from ..market_lake_client import (
    get_option_chain,
    get_option_expirations,
    get_live_quotes,
    get_fundamentals,
)
from ..pricing import bsm_price, bsm_delta


# ── Candidate types ──

@dataclass
class HedgeLeg:
    """A single leg of a hedge candidate (option or underlying)."""
    leg_type: str       # "long_put", "short_call", "underlying"
    symbol: str
    option_type: str | None = None   # "call" | "put"
    strike: float | None = None
    expiration: str | None = None
    quantity: float = 0.0
    estimated_price: float | None = None
    delta: float | None = None
    gamma: float | None = None
    theta: float | None = None
    vega: float | None = None


@dataclass
class HedgeCandidate:
    """A ranked hedge candidate for a single holding."""
    symbol: str
    underlying_price: float
    strategy: str       # "protective_put", "covered_call", "collar"
    hedge_ratio: float  # 0-1: what fraction of the position is hedged
    net_cost: float     # dollar cost (negative = credit)
    net_cost_pct: float # cost as % of position value
    score: float        # 0-100, higher = better
    legs: list[HedgeLeg] = field(default_factory=list)
    metrics: dict = field(default_factory=dict)

    # Optional: enriched during scan
    fundamentals: dict | None = None
    sector: str | None = None
    iv_regime: str | None = None  # "low", "normal", "elevated", "extreme"


# ── Scanner config ──

@dataclass
class ScanConfig:
    """Configuration for a hedge scan run."""
    # Strike offsets for protective puts (% of underlying)
    put_strikes: tuple[float, ...] = (0.95, 0.90, 0.85)
    # Strike offsets for covered calls
    call_strikes: tuple[float, ...] = (1.05, 1.10)
    # Target expiration months
    expiration_months: tuple[int, ...] = (1, 2, 3)  # ~30, 60, 90 DTE
    # Min market cap filter ($B) — skip micro caps
    min_market_cap_b: float = 0.5
    # Min option open interest to consider
    min_open_interest: int = 10
    # Max cost (% of position) for protective puts
    max_cost_pct: float = 0.10
    # Min credit (% of position) for covered calls
    min_credit_pct: float = 0.002
    # Risk-free rate (used in BSM and scoring)
    risk_free_rate: float = 0.05
    # Max symbols to scan (rate-limit protection)
    max_symbols: int = 20


# ── Scoring weights ──

_SCORE_WEIGHTS = {
    "cost_efficiency": 0.25,     # lower cost = better
    "protection_level": 0.20,     # higher hedge ratio = better
    "vol_regime": 0.15,           # favourable vol regime
    "fundamental_quality": 0.15,  # healthy underlying = better
    "liquidity": 0.15,            # high OI/volume = better
    "timing": 0.10,               # DTE sweet spot
}


# ── Main entry point ──

async def scan_candidates(
    snapshot: dict,
    config: ScanConfig | None = None,
) -> list[HedgeCandidate]:
    """Scan portfolio snapshot for hedge candidates.

    Args:
        snapshot: immutable portfolio snapshot dict
        config: scan parameters (uses defaults if None)

    Returns:
        Ranked list of hedge candidates (best first)
    """
    if config is None:
        config = ScanConfig()

    positions = snapshot.get("positions", [])
    equity_positions = [
        p for p in positions
        if p.get("asset_type") == "equity"
        and (p.get("market_value") or 0) > 0
    ]

    # Sort by market value (largest first) and cap
    equity_positions.sort(key=lambda p: p.get("market_value", 0), reverse=True)
    equity_positions = equity_positions[:config.max_symbols]

    # Fetch fundamentals and quotes in parallel
    symbols = [p["symbol"] for p in equity_positions]
    fundamentals_map = {}
    quotes_map = {}

    if symbols:
        fund_results = await asyncio.gather(
            *[get_fundamentals(s) for s in symbols],
            return_exceptions=True,
        )
        for sym, result in zip(symbols, fund_results):
            if not isinstance(result, Exception) and result is not None:
                fundamentals_map[sym] = result

        quotes = await get_live_quotes(symbols)
        quotes_map = {q.symbol: q for q in quotes}

    # Scan each holding in parallel
    all_results = await asyncio.gather(
        *[
            _scan_holding(p, config, quotes_map, fundamentals_map)
            for p in equity_positions
        ],
        return_exceptions=True,
    )

    # Flatten and filter
    candidates: list[HedgeCandidate] = []
    for result in all_results:
        if isinstance(result, Exception):
            continue
        if isinstance(result, list):
            candidates.extend(result)

    # Rank by score descending
    candidates.sort(key=lambda c: c.score, reverse=True)

    # Assign ranks
    for i, c in enumerate(candidates):
        c.metrics["rank"] = i + 1

    return candidates


# ── Per-holding scan ──

async def _scan_holding(
    position: dict,
    config: ScanConfig,
    quotes_map: dict[str, object],
    fundamentals_map: dict[str, object],
) -> list[HedgeCandidate]:
    """Scan a single equity holding for hedge candidates."""
    symbol = position["symbol"]
    market_value = position.get("market_value", 0) or 0
    quantity = position.get("quantity", 0) or 0

    if market_value <= 0 or quantity <= 0:
        return []

    # Get underlying price
    quote = quotes_map.get(symbol)
    if not quote or not getattr(quote, "last", None):
        return []
    underlying_price = quote.last

    # Get fundamentals
    fundamentals = fundamentals_map.get(symbol)

    # Check if options are available
    try:
        expirations = await get_option_expirations(symbol)
    except Exception:
        return []  # no options available

    if not expirations:
        return []

    # Select target expirations
    target_exps = _select_expirations(expirations, config.expiration_months)
    if not target_exps:
        return []

    # Fetch option chains for target expirations
    chains = await asyncio.gather(
        *[get_option_chain(symbol, exp) for exp in target_exps],
        return_exceptions=True,
    )

    valid_chains = [
        (exp, chain)
        for exp, chain in zip(target_exps, chains)
        if not isinstance(chain, Exception)
    ]

    if not valid_chains:
        return []

    candidates: list[HedgeCandidate] = []

    # ── Protective Put candidates ──
    for exp, chain in valid_chains:
        for strike_pct in config.put_strikes:
            target_strike = underlying_price * strike_pct
            # Find nearest put at or below target strike
            puts = [r for r in chain.puts if r.strike and r.strike <= target_strike]
            if not puts:
                continue

            put = max(puts, key=lambda r: r.strike)  # nearest to target

            if not put.ask or put.ask <= 0:
                continue
            if put.open_interest and put.open_interest < config.min_open_interest:
                continue

            cost_per_share = put.ask
            total_cost = cost_per_share * quantity * 100
            cost_pct = total_cost / market_value if market_value else 0

            if cost_pct > config.max_cost_pct:
                continue

            hedge_ratio = _compute_hedge_ratio(
                quantity, underlying_price, put, "put"
            )

            legs = [
                HedgeLeg(
                    leg_type="underlying",
                    symbol=symbol,
                    quantity=quantity,
                ),
                HedgeLeg(
                    leg_type="long_put",
                    symbol=f"{symbol} PUT {put.strike} {exp}",
                    option_type="put",
                    strike=put.strike,
                    expiration=exp,
                    quantity=quantity,
                    estimated_price=cost_per_share,
                    delta=put.delta,
                    gamma=put.gamma,
                    theta=put.theta,
                    vega=put.vega,
                ),
            ]

            score = _score_candidate(
                candidate_type="protective_put",
                cost_pct=cost_pct,
                hedge_ratio=hedge_ratio,
                iv=put.implied_volatility,
                fundamentals=fundamentals,
                open_interest=put.open_interest,
                dte=_dte(exp),
            )

            candidates.append(HedgeCandidate(
                symbol=symbol,
                underlying_price=underlying_price,
                strategy="protective_put",
                hedge_ratio=hedge_ratio,
                net_cost=total_cost,
                net_cost_pct=cost_pct,
                score=score,
                legs=legs,
                sector=fundamentals.sector if fundamentals else None,
                fundamentals={
                    "piotroski": fundamentals.piotroski_score if fundamentals else None,
                    "altman_z": fundamentals.altman_z_score if fundamentals else None,
                    "healthy": fundamentals.is_financially_healthy if fundamentals else None,
                    "sector": fundamentals.sector if fundamentals else None,
                } if fundamentals else None,
                metrics={
                    "strike_pct": strike_pct,
                    "dte": _dte(exp),
                    "put_cost": cost_per_share,
                    "iv": put.implied_volatility,
                    "oi": put.open_interest,
                },
            ))

    # ── Covered Call candidates ──
    for exp, chain in valid_chains:
        for strike_pct in config.call_strikes:
            target_strike = underlying_price * strike_pct
            calls = [r for r in chain.calls if r.strike and r.strike >= target_strike]
            if not calls:
                continue

            call = min(calls, key=lambda r: r.strike)  # nearest to target

            if not call.bid or call.bid <= 0:
                continue
            if call.open_interest and call.open_interest < config.min_open_interest:
                continue

            credit_per_share = call.bid
            total_credit = credit_per_share * quantity * 100
            credit_pct = total_credit / market_value if market_value else 0

            if credit_pct < config.min_credit_pct:
                continue

            # Covered call hedge ratio: capped upside
            capped_pct = (target_strike - underlying_price) / underlying_price
            hedge_ratio = max(0, min(1, (capped_pct + 0.05) / 0.15))

            legs = [
                HedgeLeg(
                    leg_type="underlying",
                    symbol=symbol,
                    quantity=quantity,
                ),
                HedgeLeg(
                    leg_type="short_call",
                    symbol=f"{symbol} CALL {call.strike} {exp}",
                    option_type="call",
                    strike=call.strike,
                    expiration=exp,
                    quantity=-quantity,  # short
                    estimated_price=credit_per_share,
                    delta=call.delta,
                    gamma=call.gamma,
                    theta=call.theta,
                    vega=call.vega,
                ),
            ]

            score = _score_candidate(
                candidate_type="covered_call",
                cost_pct=-credit_pct,  # negative cost = credit
                hedge_ratio=hedge_ratio,
                iv=call.implied_volatility,
                fundamentals=fundamentals,
                open_interest=call.open_interest,
                dte=_dte(exp),
            )

            candidates.append(HedgeCandidate(
                symbol=symbol,
                underlying_price=underlying_price,
                strategy="covered_call",
                hedge_ratio=hedge_ratio,
                net_cost=-total_credit,  # negative = credit received
                net_cost_pct=-credit_pct,
                score=score,
                legs=legs,
                sector=fundamentals.sector if fundamentals else None,
                fundamentals={
                    "piotroski": fundamentals.piotroski_score if fundamentals else None,
                    "altman_z": fundamentals.altman_z_score if fundamentals else None,
                    "healthy": fundamentals.is_financially_healthy if fundamentals else None,
                    "sector": fundamentals.sector if fundamentals else None,
                } if fundamentals else None,
                metrics={
                    "strike_pct": strike_pct,
                    "dte": _dte(exp),
                    "call_bid": credit_per_share,
                    "iv": call.implied_volatility,
                    "oi": call.open_interest,
                },
            ))

    # ── Collar candidates: combine best put + call at same expiration ──
    # Find the best put/call pair per expiration
    for exp, _ in valid_chains:
        collar = _build_collar(
            candidates, symbol, exp, market_value, quantity,
        )
        if collar:
            candidates.append(collar)

    return candidates


def _build_collar(
    all_candidates: list[HedgeCandidate],
    symbol: str,
    expiration: str,
    position_value: float,
    quantity: float,
) -> HedgeCandidate | None:
    """Combine best put and call at same expiration into a collar candidate."""

    # Find put and call candidates for this symbol + expiration
    puts = [
        c for c in all_candidates
        if c.symbol == symbol
        and c.strategy == "protective_put"
        and any(l.expiration == expiration for l in c.legs if l.leg_type == "long_put")
    ]
    calls = [
        c for c in all_candidates
        if c.symbol == symbol
        and c.strategy == "covered_call"
        and any(l.expiration == expiration for l in c.legs if l.leg_type == "short_call")
    ]

    if not puts or not calls:
        return None

    # Take the cheapest put and highest-credit call
    put = min(puts, key=lambda c: c.net_cost_pct)
    call = min(calls, key=lambda c: c.net_cost_pct)

    put_leg = next(l for l in put.legs if l.leg_type == "long_put")
    call_leg = next(l for l in call.legs if l.leg_type == "short_call")

    net_cost = put.net_cost + call.net_cost  # call.net_cost is already negative
    net_cost_pct = net_cost / position_value if position_value else 0

    # Score: average of put + call scores, bonus for net zero/low cost
    score = (put.score + call.score) / 2
    if abs(net_cost_pct) < 0.01:
        score += 10  # nearly zero-cost collar bonus

    return HedgeCandidate(
        symbol=symbol,
        underlying_price=put.underlying_price,
        strategy="collar",
        hedge_ratio=0.5,  # collar: partial protection, partial upside
        net_cost=net_cost,
        net_cost_pct=net_cost_pct,
        score=min(100, score),
        legs=[
            HedgeLeg(leg_type="underlying", symbol=symbol, quantity=quantity),
            put_leg,
            call_leg,
        ],
        sector=put.sector,
        fundamentals=put.fundamentals,
        metrics={
            "put_strike": put_leg.strike,
            "call_strike": call_leg.strike,
            "dte": put.metrics.get("dte"),
            "put_cost": put.metrics.get("put_cost"),
            "call_credit": call.metrics.get("call_bid"),
            "net_cost": net_cost,
        },
    )


# ── Scoring ──

def _score_candidate(
    *,
    candidate_type: str,
    cost_pct: float,
    hedge_ratio: float,
    iv: float | None,
    fundamentals: object | None,
    open_interest: float | None,
    dte: int | None,
) -> float:
    """Score a hedge candidate 0-100. Higher = better."""

    # Cost efficiency: lower cost = better
    if candidate_type == "covered_call":
        # Credits are good: more credit = better
        cost_score = min(1.0, max(0.0, -cost_pct / 0.02))  # 2% credit = 100
    else:
        # Cost is bad: lower cost = better
        cost_score = max(0.0, 1.0 - abs(cost_pct) / 0.10)  # 10% cost = 0

    # Protection level
    protection_score = min(1.0, hedge_ratio)

    # Vol regime: IV percentile determines regime
    vol_score = 0.5  # neutral
    if iv is not None:
        if iv < 0.20:
            vol_regime = "low"
            # Low vol: great for buying puts, bad for selling calls
            vol_score = 0.8 if candidate_type == "protective_put" else 0.3
        elif iv < 0.35:
            vol_regime = "normal"
            vol_score = 0.6
        elif iv < 0.50:
            vol_regime = "elevated"
            # High vol: bad for buying puts, great for selling calls
            vol_score = 0.3 if candidate_type == "protective_put" else 0.8
        else:
            vol_regime = "extreme"
            vol_score = 0.2 if candidate_type == "protective_put" else 0.9

    # Fundamental quality
    fund_score = 0.5  # neutral
    if fundamentals:
        f = fundamentals
        piotroski = getattr(f, "piotroski_score", None)
        healthy = getattr(f, "is_financially_healthy", None)
        if piotroski is not None:
            fund_score = max(0.0, min(1.0, piotroski / 9.0))
        elif healthy is not None:
            fund_score = 0.8 if healthy else 0.2

    # Liquidity
    liq_score = 0.5
    if open_interest is not None:
        liq_score = min(1.0, open_interest / 500)  # 500 OI = 100%

    # Timing: sweet spot is 30-60 DTE
    timing_score = 0.5
    if dte is not None:
        if 20 <= dte <= 60:
            timing_score = 0.9
        elif dte < 7:
            timing_score = 0.3  # too soon
        elif dte < 20:
            timing_score = 0.7
        elif dte <= 90:
            timing_score = 0.6
        else:
            timing_score = 0.4  # too far

    score = (
        _SCORE_WEIGHTS["cost_efficiency"] * cost_score
        + _SCORE_WEIGHTS["protection_level"] * protection_score
        + _SCORE_WEIGHTS["vol_regime"] * vol_score
        + _SCORE_WEIGHTS["fundamental_quality"] * fund_score
        + _SCORE_WEIGHTS["liquidity"] * liq_score
        + _SCORE_WEIGHTS["timing"] * timing_score
    ) * 100

    return round(score, 1)


# ── Helpers ──

def _select_expirations(
    expirations: list[str],
    target_months: tuple[int, ...],
) -> list[str]:
    """Select the nearest available expiration for each target month offset."""
    from datetime import date

    today = date.today()
    sorted_exps = sorted(expirations)
    result = []
    for months in target_months:
        # target first day of that month
        target_month = today.month + months
        target_year = today.year + (target_month - 1) // 12
        target_month = ((target_month - 1) % 12) + 1
        target = date(target_year, target_month, 1)

        # Find closest expiration (can be before or after target)
        best = None
        best_dist = float("inf")
        for exp_str in sorted_exps:
            try:
                exp_date = date.fromisoformat(exp_str)
            except ValueError:
                continue
            dist = abs((exp_date - target).days)
            if dist < best_dist:
                best_dist = dist
                best = exp_str
        if best:
            result.append(best)
    return list(set(result))  # dedupe


def _compute_hedge_ratio(
    shares: float,
    price: float,
    option: object,
    opt_type: str,
) -> float:
    """Estimate hedge ratio from option delta."""
    delta = abs(getattr(option, "delta", None) or 0.5)
    # For a put: delta is negative, abs(delta) = fraction of shares hedged
    # With 100 shares per contract, each contract hedges delta × 100 shares
    contracts = shares / 100
    hedged_shares = delta * contracts * 100
    return min(1.0, hedged_shares / shares) if shares > 0 else 0


def _dte(expiration_iso: str) -> int | None:
    """Days to expiration."""
    from datetime import date

    try:
        exp = date.fromisoformat(expiration_iso)
        return (exp - date.today()).days
    except (ValueError, TypeError):
        return None
