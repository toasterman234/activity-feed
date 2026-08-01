"""Black-Scholes-Merton pricing and Greeks.

Extracted and adapted from portfolio-hedge-lab/quant_pipeline.py.
All functions are pure and deterministic — no side effects, no I/O.

The cumulative normal distribution uses scipy.special.ndtr for accuracy.
"""

from __future__ import annotations

import math

from scipy.special import ndtr  # cumulative standard normal


def _d1(S: float, K: float, T: float, r: float, sigma: float) -> float:
    """d1 term of the BSM formula."""
    if T <= 0 or sigma <= 0:
        raise ValueError(f"T ({T}) and sigma ({sigma}) must be > 0")
    return (math.log(S / K) + (r + 0.5 * sigma**2) * T) / (sigma * math.sqrt(T))


def _d2(d1: float, T: float, sigma: float) -> float:
    """d2 term of the BSM formula."""
    return d1 - sigma * math.sqrt(T)


def bsm_price(
    S: float,
    K: float,
    T: float,
    r: float,
    sigma: float,
    option_type: str,
) -> float:
    """Black-Scholes-Merton option price.

    Args:
        S: underlying price
        K: strike price
        T: time to expiration in years
        r: risk-free rate (decimal, e.g. 0.05 for 5%)
        sigma: implied volatility (decimal)
        option_type: "call" or "put"

    Returns:
        Option price (premium)
    """
    d1 = _d1(S, K, T, r, sigma)
    d2 = _d2(d1, T, sigma)

    if option_type == "call":
        return S * ndtr(d1) - K * math.exp(-r * T) * ndtr(d2)
    elif option_type == "put":
        return K * math.exp(-r * T) * ndtr(-d2) - S * ndtr(-d1)
    else:
        raise ValueError(f"option_type must be 'call' or 'put', got {option_type}")


def bsm_delta(
    S: float, K: float, T: float, r: float, sigma: float, option_type: str
) -> float:
    """BSM delta (rate of change of option price wrt underlying price)."""
    d1 = _d1(S, K, T, r, sigma)
    if option_type == "call":
        return ndtr(d1)
    else:
        return ndtr(d1) - 1.0


def bsm_gamma(S: float, K: float, T: float, r: float, sigma: float) -> float:
    """BSM gamma (rate of change of delta wrt underlying price)."""
    d1 = _d1(S, K, T, r, sigma)
    return math.exp(-(d1**2) / 2) / (S * sigma * math.sqrt(2 * math.pi * T))


def bsm_theta(
    S: float, K: float, T: float, r: float, sigma: float, option_type: str
) -> float:
    """BSM theta (rate of change of option price wrt time, per year).

    Divide by 365 for daily theta.
    """
    d1 = _d1(S, K, T, r, sigma)
    d2 = _d2(d1, T, sigma)
    term1 = -(S * sigma * math.exp(-(d1**2) / 2)) / (2 * math.sqrt(2 * math.pi * T))

    if option_type == "call":
        return term1 - r * K * math.exp(-r * T) * ndtr(d2)
    else:
        return term1 + r * K * math.exp(-r * T) * ndtr(-d2)


def bsm_vega(S: float, K: float, T: float, r: float, sigma: float) -> float:
    """BSM vega (rate of change of option price wrt volatility, per 1% IV change).

    This returns vega per 1.0 (i.e., 100 percentage points). Divide by 100
    for vega per 1 percentage point change.
    """
    d1 = _d1(S, K, T, r, sigma)
    return S * math.sqrt(T) * math.exp(-(d1**2) / 2) / math.sqrt(2 * math.pi)


def bsm_rho(
    S: float, K: float, T: float, r: float, sigma: float, option_type: str
) -> float:
    """BSM rho (rate of change of option price wrt risk-free rate, per 1% rate change)."""
    d1 = _d1(S, K, T, r, sigma)
    d2 = _d2(d1, T, sigma)
    factor = K * T * math.exp(-r * T) / 100.0
    if option_type == "call":
        return factor * ndtr(d2)
    else:
        return -factor * ndtr(-d2)


def implied_volatility(
    market_price: float,
    S: float,
    K: float,
    T: float,
    r: float,
    option_type: str,
    *,
    max_iterations: int = 100,
    tolerance: float = 1e-8,
) -> float:
    """Newton-Raphson implied volatility solver.

    Args:
        market_price: observed market price
        S, K, T, r: BSM parameters
        option_type: "call" or "put"
        max_iterations: solver cap
        tolerance: convergence threshold

    Returns:
        Implied volatility (decimal)

    Raises:
        ValueError: if solver doesn't converge
    """
    sigma = 0.3  # initial guess: 30% IV

    for _ in range(max_iterations):
        price = bsm_price(S, K, T, r, sigma, option_type)
        diff = price - market_price

        if abs(diff) < tolerance:
            return sigma

        vega = bsm_vega(S, K, T, r, sigma)  # vega per 100%
        if abs(vega) < 1e-12:
            break

        sigma -= diff / vega

        # Clamp to reasonable range
        sigma = max(0.001, min(5.0, sigma))

    raise ValueError(
        f"IV solver did not converge. "
        f"market_price={market_price}, S={S}, K={K}, T={T}, r={r}"
    )
