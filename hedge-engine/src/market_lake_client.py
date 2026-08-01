"""Market Lake API client for the hedge engine.

Thin typed wrapper around the Market Lake HTTP API (:9077).
All functions are async, using httpx.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import httpx

from .config import MARKET_LAKE_URL


@dataclass
class LiveQuote:
    symbol: str
    last: float | None = None
    bid: float | None = None
    ask: float | None = None
    spread_pct: float | None = None
    change_pct: float | None = None
    previous_close: float | None = None
    volume: float | None = None
    timestamp: str | None = None


@dataclass
class OptionRow:
    symbol: str
    side: str  # "call" | "put"
    strike: float | None = None
    last: float | None = None
    bid: float | None = None
    ask: float | None = None
    mid: float | None = None
    volume: float | None = None
    open_interest: float | None = None
    delta: float | None = None
    gamma: float | None = None
    theta: float | None = None
    vega: float | None = None
    rho: float | None = None
    implied_volatility: float | None = None
    timestamp: str | None = None


@dataclass
class OptionChain:
    symbol: str
    expiration: str | None = None
    calls: list[OptionRow] = field(default_factory=list)
    puts: list[OptionRow] = field(default_factory=list)


@dataclass
class DailyBar:
    date: str
    open: float | None = None
    high: float | None = None
    low: float | None = None
    close: float | None = None
    adj_close: float | None = None
    volume: float | None = None


@dataclass
class FundamentalSnapshot:
    symbol: str
    sector: str | None = None
    industry: str | None = None
    ivr_252d: float | None = None
    vrp_30d: float | None = None
    piotroski_score: int | None = None
    altman_z_score: float | None = None
    is_financially_healthy: bool | None = None
    is_not_distressed: bool | None = None
    debt_to_equity: float | None = None
    gross_margin: float | None = None
    net_margin: float | None = None
    roe: float | None = None
    revenue_growth_yoy: float | None = None
    composite_score: float | None = None


async def _get(path: str, **params) -> dict:
    """GET from Market Lake, return parsed JSON."""
    async with httpx.AsyncClient(timeout=httpx.Timeout(15.0)) as client:
        url = f"{MARKET_LAKE_URL}{path}"
        resp = await client.get(url, params={k: v for k, v in params.items() if v is not None})
        resp.raise_for_status()
        return resp.json()


async def get_live_quotes(symbols: list[str]) -> list[LiveQuote]:
    """Fetch live quotes for a list of symbols."""
    data = await _get("/live/quotes", symbols=",".join(symbols))
    return [
        LiveQuote(
            symbol=r.get("symbol", ""),
            last=r.get("last"),
            bid=r.get("bid"),
            ask=r.get("ask"),
            spread_pct=r.get("spread_pct"),
            change_pct=r.get("change_pct"),
            previous_close=r.get("previous_close"),
            volume=r.get("volume"),
            timestamp=r.get("timestamp"),
        )
        for r in data.get("rows", [])
    ]


async def get_option_expirations(symbol: str) -> list[str]:
    """Get available expiration dates for a symbol."""
    data = await _get(f"/live/option-expirations/{symbol}")
    return data.get("expirations", [])


async def get_option_chain(symbol: str, expiration: str | None = None) -> OptionChain:
    """Fetch live option chain with Greeks."""
    params = {}
    if expiration:
        params["expiration"] = expiration
    data = await _get(f"/live/option-chain/{symbol}", **params)

    def _row(r: dict, side: str) -> OptionRow:
        def _f(val, default=None):
            """Coerce to float, handling string values from API."""
            if val is None or val == "":
                return default
            try:
                return float(val)
            except (ValueError, TypeError):
                return default

        return OptionRow(
            symbol=data.get("symbol", symbol),
            side=side,
            strike=_f(r.get("strike")),
            last=_f(r.get("last")),
            bid=_f(r.get("bid")),
            ask=_f(r.get("ask")),
            mid=_f(r.get("mid")),
            volume=_f(r.get("volume")),
            open_interest=_f(r.get("open_interest")),
            delta=_f(r.get("delta")),
            gamma=_f(r.get("gamma")),
            theta=_f(r.get("theta")),
            vega=_f(r.get("vega")),
            rho=_f(r.get("rho")),
            implied_volatility=_f(r.get("implied_volatility")),
            timestamp=r.get("timestamp"),
        )

    return OptionChain(
        symbol=data.get("symbol", symbol),
        expiration=data.get("expiration"),
        calls=[_row(r, "call") for r in data.get("calls", [])],
        puts=[_row(r, "put") for r in data.get("puts", [])],
    )


async def get_historical_prices(symbol: str, days: int = 252) -> list[DailyBar]:
    """Fetch historical daily bars."""
    data = await _get(f"/prices/historical/{symbol}", limit=days, sort="desc")
    rows = data.get("rows", [])
    bars = [
        DailyBar(
            date=r.get("date", ""),
            open=r.get("open"),
            high=r.get("high"),
            low=r.get("low"),
            close=r.get("close"),
            adj_close=r.get("adj_close"),
            volume=r.get("volume"),
        )
        for r in rows
    ]
    bars.reverse()  # oldest first
    return bars


async def get_fundamentals(symbol: str) -> FundamentalSnapshot | None:
    """Fetch fundamental snapshot."""
    try:
        data = await _get(f"/fundamentals/{symbol}")
        rows = data.get("rows", [])
        if not rows:
            return None
        r = rows[0]
        return FundamentalSnapshot(
            symbol=r.get("symbol", symbol),
            sector=r.get("sector"),
            industry=r.get("industry"),
            ivr_252d=r.get("ivr_252d"),
            vrp_30d=r.get("vrp_30d"),
            piotroski_score=r.get("piotroski_score"),
            altman_z_score=r.get("altman_z_score"),
            is_financially_healthy=r.get("is_financially_healthy"),
            is_not_distressed=r.get("is_not_distressed"),
            debt_to_equity=r.get("debt_to_equity"),
            gross_margin=r.get("gross_margin"),
            net_margin=r.get("net_margin"),
            roe=r.get("roe"),
            revenue_growth_yoy=r.get("revenue_growth_yoy"),
            composite_score=r.get("composite_score"),
        )
    except httpx.HTTPStatusError:
        return None
