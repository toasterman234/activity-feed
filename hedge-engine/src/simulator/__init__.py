"""Rolling hedge simulator — Phase 5.

For a given hedge combination:
  1. Split historical price data into rolling windows (e.g., 1-month steps over 3 years)
  2. At each window start: price the hedge using BSM (VIX as vol proxy)
  3. Track hedge P&L vs unhedged portfolio over the window
  4. Aggregate metrics across all windows
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any

from .. import market_lake_client as ml
from ..pricing import bsm_price, bsm_delta


# ── Types ──

@dataclass
class RollingWindow:
    """Results for a single rolling window."""
    start_date: str
    end_date: str
    window_days: int
    portfolio_return: float       # unhedged return over window
    hedged_return: float          # hedged return over window
    hedge_cost: float             # cost of hedge at window start
    hedge_pnl: float              # hedge P&L over window
    hedge_breakeven: bool         # did hedge pay off?
    benchmark_return: float       # SPY over window


@dataclass
class SimulationResult:
    """Aggregated rolling simulation results."""
    symbol: str
    strategy: str
    total_windows: int
    hedged_wins: int              # windows where hedged > unhedged
    win_rate: float               # hedged_wins / total_windows
    avg_hedge_cost: float
    avg_hedge_pnl: float
    avg_hedge_return: float
    avg_unhedged_return: float
    max_drawdown_reduction: float # improvement in worst case
    windows: list[RollingWindow] = field(default_factory=list)


@dataclass
class SimulateConfig:
    lookback_years: int = 3
    window_months: int = 1
    step_months: int = 1
    risk_free_rate: float = 0.05
    vix_as_iv: bool = True  # use VIX as vol proxy (no historical option chains)


# ── Entry point ──

async def simulate_hedge(
    candidates: list[dict],
    config: SimulateConfig | None = None,
) -> list[SimulationResult]:
    """Run rolling simulations for top hedge candidates.

    Limits to top 5 candidates to keep runtime reasonable.
    """
    if config is None:
        config = SimulateConfig()

    top5 = sorted(candidates, key=lambda c: c.get("score", 0), reverse=True)[:5]
    if not top5:
        return []

    # Fetch SPY prices as benchmark
    spy_bars = await ml.get_historical_prices("SPY", days=config.lookback_years * 252)
    spy_returns = _bars_to_returns(spy_bars)

    # Fetch VIX as vol proxy
    vix_bars: list[ml.DailyBar] = []
    try:
        vix_bars = await ml.get_historical_prices("^VIX", days=config.lookback_years * 252)
    except Exception:
        pass  # will use fixed vol fallback

    # Simulate each candidate
    tasks = []
    for c in top5:
        symbol = c["symbol"]
        tasks.append(_simulate_one(c, spy_returns, spy_bars, vix_bars, config))
    
    results_raw = await asyncio.gather(*tasks, return_exceptions=True)

    results = []
    for r in results_raw:
        if isinstance(r, Exception):
            continue
        if r and r.total_windows > 0:
            results.append(r)

    return results


async def _simulate_one(
    candidate: dict,
    spy_returns: dict[str, float],
    spy_bars: list[ml.DailyBar],
    vix_bars: list[ml.DailyBar],
    config: SimulateConfig,
) -> SimulationResult:
    """Simulate a single candidate across rolling windows."""
    symbol = candidate["symbol"]
    strategy = candidate.get("strategy", "unknown")
    legs = candidate.get("legs", [])

    # Get historical prices for the underlying
    bars = await ml.get_historical_prices(symbol, days=config.lookback_years * 252)
    if len(bars) < 60:
        raise ValueError(f"Insufficient history for {symbol}: {len(bars)} bars")

    # Extract hedge parameters
    option_legs = [l for l in legs if l.get("leg_type") != "underlying"]
    if not option_legs:
        raise ValueError("No option legs found")

    # Build date range for windows
    dates = [b.date for b in bars if b.date]
    if not dates:
        raise ValueError("No dates in price data")

    start_idx = _date_to_idx(dates[0])
    end_idx = _date_to_idx(dates[-1])
    window_days = config.window_months * 21  # trading days

    windows: list[RollingWindow] = []
    current = start_idx
    while current + window_days <= end_idx:
        window = _simulate_window(
            symbol, strategy, option_legs,
            bars, dates, current, current + window_days,
            spy_returns, spy_bars, vix_bars, config,
            config.risk_free_rate,
        )
        if window:
            windows.append(window)
        current += config.step_months * 21

    if not windows:
        return SimulationResult(
            symbol=symbol, strategy=strategy,
            total_windows=0, hedged_wins=0, win_rate=0,
            avg_hedge_cost=0, avg_hedge_pnl=0,
            avg_hedge_return=0, avg_unhedged_return=0,
            max_drawdown_reduction=0,
        )

    wins = sum(1 for w in windows if w.hedge_breakeven)
    cost = sum(w.hedge_cost for w in windows) / len(windows)
    pnl = sum(w.hedge_pnl for w in windows) / len(windows)
    hedged_ret = sum(w.hedged_return for w in windows) / len(windows)
    unhedged_ret = sum(w.portfolio_return for w in windows) / len(windows)

    # Max drawdown reduction: compare worst unhedged vs worst hedged window
    worst_unhedged = min(w.portfolio_return for w in windows)
    worst_hedged = min(w.hedged_return for w in windows)
    drawdown_improvement = worst_hedged - worst_unhedged

    return SimulationResult(
        symbol=symbol, strategy=strategy,
        total_windows=len(windows), hedged_wins=wins,
        win_rate=wins / len(windows),
        avg_hedge_cost=cost,
        avg_hedge_pnl=pnl,
        avg_hedge_return=hedged_ret,
        avg_unhedged_return=unhedged_ret,
        max_drawdown_reduction=drawdown_improvement,
        windows=windows,
    )


def _simulate_window(
    symbol: str,
    strategy: str,
    option_legs: list[dict],
    bars: list[ml.DailyBar],
    dates: list[str],
    start_idx: int,
    end_idx: int,
    spy_returns: dict[str, float],
    spy_bars: list[ml.DailyBar],
    vix_bars: list[ml.DailyBar],
    config: SimulateConfig,
    r: float,
) -> RollingWindow | None:
    """Simulate one rolling window."""
    # Prices at window start/end
    if start_idx >= len(bars) or end_idx >= len(bars):
        return None

    start_bar = next((b for b in bars if b.date == dates[start_idx]), None)
    end_bar = next((b for b in bars if b.date == dates[end_idx]), None)
    if not start_bar or not end_bar:
        return None

    start_price = start_bar.close or 0
    end_price = end_bar.close or 0
    if start_price <= 0 or end_price <= 0:
        return None

    # Portfolio return (unhedged)
    portfolio_return = (end_price - start_price) / start_price

    # Hedge cost at window start (BSM pricing)
    hedge_cost = 0.0
    for leg in option_legs:
        strike = leg.get("strike") or 0
        exp_str = leg.get("expiration", "")
        opt_type = leg.get("option_type", "put")
        qty = abs(leg.get("quantity", 1))

        # Time to expiration at window start
        try:
            exp_date = date.fromisoformat(exp_str[:10])
            window_start_date = date.fromisoformat(dates[start_idx][:10])
            T = max(1 / 365, (exp_date - window_start_date).days / 365)
        except (ValueError, TypeError):
            T = 30 / 365  # default ~1 month

        # Volatility: use VIX if available, else fixed 25%
        sigma = _get_vix(vix_bars, dates[start_idx]) / 100.0 if vix_bars else 0.25

        try:
            price = bsm_price(start_price, strike, T, r, sigma, opt_type)
            hedge_cost += price * qty
        except ValueError:
            hedge_cost += 0.01 * start_price * qty  # fallback

    # P&L: option payoff at expiration
    option_pnl = 0.0
    for leg in option_legs:
        strike = leg.get("strike") or 0
        opt_type = leg.get("option_type", "put")
        qty = abs(leg.get("quantity", 1))

        if opt_type == "put":
            payoff = max(0, strike - end_price)
        else:
            payoff = max(0, end_price - strike)
        option_pnl += payoff * qty

    # Hedge P&L = option payoff - cost
    hedge_pnl = option_pnl - hedge_cost

    # Hedged return = portfolio return + hedge P&L (per share)
    shares = 1.0  # normalized per share
    hedged_return = portfolio_return + (hedge_pnl / (start_price * shares))

    # Benchmark return
    bench_return = _get_benchmark_return(spy_returns, dates[start_idx], dates[end_idx])

    return RollingWindow(
        start_date=dates[start_idx],
        end_date=dates[end_idx],
        window_days=end_idx - start_idx,
        portfolio_return=portfolio_return,
        hedged_return=hedged_return,
        hedge_cost=hedge_cost,
        hedge_pnl=hedge_pnl,
        hedge_breakeven=hedge_pnl > 0,
        benchmark_return=bench_return,
    )


# ── Helpers ──

def _bars_to_returns(bars: list[ml.DailyBar]) -> dict[str, float]:
    """Convert bars to date-keyed returns."""
    returns = {}
    for i in range(1, len(bars)):
        if bars[i - 1].close and bars[i].close and bars[i - 1].close > 0:
            ret = (bars[i].close - bars[i - 1].close) / bars[i - 1].close
            if bars[i].date:
                returns[bars[i].date] = float(ret)
    return returns


def _date_to_idx(date_str: str) -> int:
    """Convert date to sequential index."""
    try:
        d = date.fromisoformat(date_str[:10])
        return d.toordinal()
    except (ValueError, TypeError):
        return 0


def _get_vix(vix_bars: list[ml.DailyBar], target_date: str) -> float:
    """Get VIX close for a specific date, or nearest."""
    if not vix_bars:
        return 25.0
    best = None
    target = date.fromisoformat(target_date[:10])
    for b in vix_bars:
        if not b.date or not b.close:
            continue
        d = date.fromisoformat(b.date[:10])
        if d <= target and (best is None or d > best[0]):
            best = (d, b.close)
    return best[1] if best else 25.0


def _get_benchmark_return(
    spy_returns: dict[str, float],
    start_date: str,
    end_date: str,
) -> float:
    """Cumulative SPY return between two dates."""
    # Approximate: use daily returns between start and end
    # For simplicity, compute from start/end prices in spy_returns
    start_d = date.fromisoformat(start_date[:10])
    end_d = date.fromisoformat(end_date[:10])

    cum_ret = 0.0
    for date_str, ret in spy_returns.items():
        try:
            d = date.fromisoformat(date_str[:10])
        except ValueError:
            continue
        if start_d < d <= end_d:
            cum_ret += ret
    return cum_ret
