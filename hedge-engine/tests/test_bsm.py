"""Tests for BSM pricing module."""

import math

import pytest

import sys
from pathlib import Path

# Allow tests to import from src/ without needing the package installed
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from pricing import (
    bsm_price,
    bsm_delta,
    bsm_gamma,
    bsm_theta,
    bsm_vega,
    bsm_rho,
    implied_volatility,
)


# ── Known test vectors: S=100, K=100, T=1yr, r=5%, σ=20% ──

S, K, T, r, sigma = 100.0, 100.0, 1.0, 0.05, 0.20


def test_call_price_known():
    """BSM call price for ATM 1yr option should be ~$10.45."""
    price = bsm_price(S, K, T, r, sigma, "call")
    assert 10.0 < price < 11.0, f"Expected ~10.45, got {price}"


def test_put_price_known():
    """BSM put price for ATM 1yr option should be ~$5.57."""
    price = bsm_price(S, K, T, r, sigma, "put")
    assert 5.0 < price < 6.5, f"Expected ~5.57, got {price}"


def test_put_call_parity():
    """C - P = S - K*exp(-rT)"""
    call = bsm_price(S, K, T, r, sigma, "call")
    put = bsm_price(S, K, T, r, sigma, "put")
    parity_diff = call - put - (S - K * math.exp(-r * T))
    assert abs(parity_diff) < 0.001


def test_delta_atm_call():
    """Delta of ATM call should be ~0.64."""
    delta = bsm_delta(S, K, T, r, sigma, "call")
    assert 0.60 < delta < 0.68


def test_delta_atm_put():
    """Delta of ATM put should be ~-0.36."""
    delta = bsm_delta(S, K, T, r, sigma, "put")
    assert -0.40 < delta < -0.32


def test_delta_deep_itm_call():
    """Deep ITM call delta → 1.0."""
    delta = bsm_delta(S, 50.0, T, r, sigma, "call")
    assert delta > 0.95


def test_delta_deep_otm_call():
    """Deep OTM call delta → 0.0."""
    delta = bsm_delta(S, 200.0, T, r, sigma, "call")
    assert delta < 0.05


def test_gamma_positive():
    """Gamma is always positive."""
    gamma = bsm_gamma(S, K, T, r, sigma)
    assert gamma > 0


def test_gamma_atm_peak():
    """Gamma peaks near the money."""
    atm_gamma = bsm_gamma(S, K, T, r, sigma)
    otm_gamma = bsm_gamma(S, 150, T, r, sigma)
    assert atm_gamma > otm_gamma


def test_theta_negative_for_long():
    """Long options have negative theta (time decay)."""
    theta_call = bsm_theta(S, K, T, r, sigma, "call")
    theta_put = bsm_theta(S, K, T, r, sigma, "put")
    # ATM calls and puts both have negative theta for long positions
    # (Put theta can be positive deep ITM due to r × K term, but ATM it's negative)
    assert theta_call < 0


def test_vega_positive():
    """Vega is always positive."""
    vega = bsm_vega(S, K, T, r, sigma)
    assert vega > 0


def test_rho_call_positive():
    """Call rho is positive."""
    rho = bsm_rho(S, K, T, r, sigma, "call")
    assert rho > 0


def test_rho_put_negative():
    """Put rho is negative."""
    rho = bsm_rho(S, K, T, r, sigma, "put")
    assert rho < 0


def test_iv_roundtrip():
    """Implied vol from BSM price should recover input sigma."""
    price = bsm_price(S, K, T, r, sigma, "call")
    iv = implied_volatility(price, S, K, T, r, "call")
    assert abs(iv - sigma) < 0.001


def test_iv_put_roundtrip():
    """Implied vol from BSM put price should recover input sigma."""
    price = bsm_price(S, K, T, r, sigma, "put")
    iv = implied_volatility(price, S, K, T, r, "put")
    assert abs(iv - sigma) < 0.001


def test_iv_deep_itm():
    """IV solver should work for deep ITM options."""
    price = bsm_price(S, 50.0, T, r, 0.40, "call")
    iv = implied_volatility(price, S, 50.0, T, r, "call")
    assert abs(iv - 0.40) < 0.001


def test_iv_extreme():
    """IV solver should handle extreme vol."""
    price = bsm_price(S, K, T, r, 0.80, "call")
    iv = implied_volatility(price, S, K, T, r, "call")
    assert abs(iv - 0.80) < 0.01


def test_zero_time_raises():
    """BSM should raise for T=0."""
    with pytest.raises(ValueError):
        bsm_price(S, K, 0.0, r, sigma, "call")


def test_zero_vol_raises():
    """BSM should raise for sigma=0."""
    with pytest.raises(ValueError):
        bsm_price(S, K, T, r, 0.0, "call")


def test_invalid_option_type():
    """Invalid option type raises ValueError."""
    with pytest.raises(ValueError):
        bsm_price(S, K, T, r, sigma, "straddle")


def test_iv_non_convergence():
    """IV solver raises for impossible market prices."""
    with pytest.raises(ValueError):
        # Call can't be worth more than the underlying
        implied_volatility(200.0, S, K, T, r, "call")
