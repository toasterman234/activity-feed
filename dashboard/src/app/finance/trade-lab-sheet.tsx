"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getOptionChain,
  getOptionExpirations,
  getPortfolioSnapshot,
  type OptionChainResponse,
  type OptionRow,
  type PortfolioPosition,
} from "../../lib/market-lake";
import {
  analyzeTrade,
  contractFill,
  payoffSeries,
  scenarioPnL,
  selectTradeContracts,
  type FillAssumption,
  type TradeInputs,
  type TradeRisk,
  type TradeStructure,
} from "./trade-lab-model";
import { portfolioRiskSnapshot, type PortfolioRiskSnapshot } from "./portfolio-risk-model";

const PAPER_PLANS_KEY = "finance-paper-trade-plans-v1";

function defaultTradeExpiration(dates: string[]): string {
  const now = new Date();
  const dated = dates.map((date) => ({
    date,
    dte: Math.ceil((new Date(`${date}T16:00:00`).getTime() - now.getTime()) / 86_400_000),
  }));
  return dated
    .filter((item) => item.dte >= 21 && item.dte <= 45)
    .sort((left, right) => Math.abs(left.dte - 35) - Math.abs(right.dte - 35))[0]?.date
    ?? dated.find((item) => item.dte > 0)?.date
    ?? dates[0]
    ?? "";
}

interface PaperPlan {
  id: string;
  createdAt: string;
  symbol: string;
  structure: TradeStructure;
  quantity: number;
  spot: number;
  expiration: string | null;
  contractSymbol: string | null;
  strike: number | null;
  fillAssumption: FillAssumption;
  fill: number;
  entryRule: string;
  invalidationRule: string;
  risk: TradeRisk;
  portfolioRisk?: PortfolioRiskSnapshot;
  status: "draft";
}

function money(value: number | null | undefined): string {
  if (value == null) return "Unlimited";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function decimal(value: number | null | undefined, digits = 2): string {
  return value == null ? "—" : value.toFixed(digits);
}

function PayoffChart({ inputs }: { inputs: TradeInputs }) {
  const points = payoffSeries(inputs);
  const width = 640;
  const height = 230;
  const pad = { left: 58, right: 18, top: 18, bottom: 34 };
  const minPrice = Math.min(...points.map((point) => point.price));
  const maxPrice = Math.max(...points.map((point) => point.price));
  const minPnl = Math.min(...points.map((point) => point.pnl), 0);
  const maxPnl = Math.max(...points.map((point) => point.pnl), 0);
  const x = (price: number) => pad.left + ((price - minPrice) / Math.max(1, maxPrice - minPrice)) * (width - pad.left - pad.right);
  const y = (pnl: number) => pad.top + ((maxPnl - pnl) / Math.max(1, maxPnl - minPnl)) * (height - pad.top - pad.bottom);
  const path = points.map((point, index) => `${index ? "L" : "M"} ${x(point.price).toFixed(1)} ${y(point.pnl).toFixed(1)}`).join(" ");
  const risk = analyzeTrade(inputs);

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Profit and loss at expiration">
        <line x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} stroke="currentColor" className="text-zinc-300 dark:text-zinc-700" strokeDasharray="4 4" />
        <line x1={x(inputs.spot)} x2={x(inputs.spot)} y1={pad.top} y2={height - pad.bottom} stroke="currentColor" className="text-zinc-300 dark:text-zinc-700" strokeDasharray="3 4" />
        <line x1={x(risk.breakeven)} x2={x(risk.breakeven)} y1={pad.top} y2={height - pad.bottom} stroke="#f59e0b" strokeDasharray="3 4" />
        <path d={path} fill="none" stroke="#10b981" strokeWidth="3" strokeLinejoin="round" />
        <text x={pad.left} y={y(0) - 6} className="fill-zinc-400 text-[10px]">zero P&amp;L</text>
        <text x={x(inputs.spot) + 4} y={pad.top + 11} className="fill-zinc-400 text-[10px]">spot {inputs.spot.toFixed(2)}</text>
        <text x={Math.min(x(risk.breakeven) + 4, width - 100)} y={height - pad.bottom - 7} className="fill-amber-500 text-[10px]">BE {risk.breakeven.toFixed(2)}</text>
        <text x={pad.left} y={height - 10} className="fill-zinc-400 text-[10px]">{minPrice.toFixed(0)}</text>
        <text x={width - pad.right - 28} y={height - 10} className="fill-zinc-400 text-[10px]">{maxPrice.toFixed(0)}</text>
        <text x={6} y={pad.top + 8} className="fill-zinc-400 text-[10px]">{money(maxPnl)}</text>
        <text x={6} y={height - pad.bottom} className="fill-zinc-400 text-[10px]">{money(minPnl)}</text>
      </svg>
      <p className="text-center text-[10px] uppercase tracking-[0.12em] text-zinc-400">Underlying price at expiration · exact payoff before fees</p>
    </div>
  );
}

function RiskMetric({ label, value, warning }: { label: string; value: string; warning?: boolean }) {
  return (
    <div className="border-r border-zinc-200 px-3 last:border-r-0 dark:border-zinc-800">
      <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-400">{label}</p>
      <p className={`mt-1 font-mono text-sm font-semibold ${warning ? "text-amber-600 dark:text-amber-300" : "text-zinc-800 dark:text-zinc-100"}`}>{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-sky-100 bg-card p-3 dark:border-sky-900 dark:bg-zinc-950">
      <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-400">{label}</p>
      <p className="mt-1 font-mono text-sm font-semibold text-zinc-800 dark:text-zinc-100">{value}</p>
    </div>
  );
}

export default function TradeLabSheet({
  symbol,
  spot,
  open,
  onClose,
}: {
  symbol: string | null;
  spot: number | null;
  open: boolean;
  onClose: () => void;
}) {
  const [structure, setStructure] = useState<TradeStructure>("csp");
  const [expirations, setExpirations] = useState<string[]>([]);
  const [expiration, setExpiration] = useState("");
  const [chain, setChain] = useState<OptionChainResponse | null>(null);
  const [selectedContract, setSelectedContract] = useState<OptionRow | null>(null);
  const [fillAssumption, setFillAssumption] = useState<FillAssumption>("bid");
  const [customFill, setCustomFill] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [daysElapsed, setDaysElapsed] = useState(7);
  const [entryRule, setEntryRule] = useState("Enter only with a limit order at or above the selected fill.");
  const [invalidationRule, setInvalidationRule] = useState("Do not enter if earnings or material news is inside the holding window.");
  const [status, setStatus] = useState("");
  const [savedPlans, setSavedPlans] = useState<PaperPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [portfolioPositions, setPortfolioPositions] = useState<PortfolioPosition[]>([]);
  const [portfolioUnavailable, setPortfolioUnavailable] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !symbol) return;
    let cancelled = false;
    setStructure("csp");
    setExpiration("");
    setChain(null);
    setSelectedContract(null);
    setFillAssumption("bid");
    setCustomFill(0);
    setQuantity(1);
    setStatus("");
    try {
      setSavedPlans(JSON.parse(window.localStorage.getItem(PAPER_PLANS_KEY) ?? "[]") as PaperPlan[]);
    } catch {
      setSavedPlans([]);
    }
    setLoading(true);
    void getPortfolioSnapshot().then((snapshot) => {
      if (cancelled) return;
      setPortfolioPositions(snapshot.positions);
      setPortfolioUnavailable(snapshot.unavailable);
    }).catch(() => {
      if (!cancelled) setPortfolioUnavailable(["Schwab holdings", "Fidelity holdings"]);
    });
    void getOptionExpirations(symbol).then((dates) => {
      if (cancelled) return;
      setExpirations(dates);
      setExpiration(defaultTradeExpiration(dates));
    }).catch(() => {
      if (!cancelled) setStatus("Live expirations unavailable.");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, symbol]);

  useEffect(() => {
    if (!open || !symbol || !expiration) return;
    let cancelled = false;
    setLoading(true);
    void getOptionChain(symbol, expiration).then((next) => {
      if (!cancelled) setChain(next);
    }).catch(() => {
      if (!cancelled) setStatus("Live chain unavailable.");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [expiration, open, symbol]);

  const liveSpot = spot ?? 0;
  const contracts = useMemo(
    () => selectTradeContracts([...(chain?.calls ?? []), ...(chain?.puts ?? [])], structure, liveSpot),
    [chain, liveSpot, structure],
  );

  useEffect(() => {
    setSelectedContract(structure === "stock" ? null : contracts[0] ?? null);
  }, [contracts, structure]);

  const fill = contractFill(selectedContract, fillAssumption, customFill);
  const inputs: TradeInputs = {
    structure,
    spot: liveSpot,
    quantity,
    contract: selectedContract,
    fill,
  };
  const risk = analyzeTrade(inputs);
  const normalizedSymbol = symbol ?? "";
  const heldSector = portfolioPositions.find((position) => position.symbol.toUpperCase() === normalizedSymbol.toUpperCase())?.sector ?? null;
  const portfolioRisk = portfolioRiskSnapshot(portfolioPositions, normalizedSymbol, heldSector, inputs, risk);
  const relativeSpread = selectedContract?.mid
    ? ((selectedContract.ask ?? 0) - (selectedContract.bid ?? 0)) / selectedContract.mid
    : null;

  const savePlan = () => {
    if (!symbol || liveSpot <= 0 || (structure !== "stock" && !selectedContract)) return;
    const plan: PaperPlan = {
      id: `paper-${Date.now()}`,
      createdAt: new Date().toISOString(),
      symbol,
      structure,
      quantity,
      spot: liveSpot,
      expiration: chain?.expiration ?? null,
      contractSymbol: selectedContract?.symbol ?? null,
      strike: selectedContract?.strike ?? null,
      fillAssumption,
      fill,
      entryRule,
      invalidationRule,
      risk,
      portfolioRisk,
      status: "draft",
    };
    const next = [plan, ...savedPlans];
    window.localStorage.setItem(PAPER_PLANS_KEY, JSON.stringify(next));
    setSavedPlans(next);
    setStatus("Paper plan saved locally.");
  };

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onClose, open]);

  if (!open || !symbol) return null;

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/50" role="dialog" aria-modal="true" aria-label={`${symbol} Trade Lab`}>
      <button onClick={onClose} className="min-w-0 flex-1 cursor-default" aria-label="Close Trade Lab" />
      <aside className="h-full w-full max-w-5xl overflow-y-auto border-l border-zinc-200 bg-card shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
        <header className="sticky top-0 z-20 border-b border-zinc-200 bg-zinc-950 px-5 py-4 text-white dark:border-zinc-800">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-400">Trade Lab · paper only</p>
              <h2 className="mt-1 text-xl font-bold">{symbol} <span className="font-mono text-sm font-normal text-zinc-400">spot ${liveSpot.toFixed(2)}</span></h2>
              <p className="mt-1 text-xs text-zinc-400">Market data, model assumptions, and your plan are separated below.</p>
            </div>
            <button onClick={onClose} className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300">Close</button>
          </div>
        </header>

        <div className="space-y-5 p-5">
          <section className="grid gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800 lg:grid-cols-[1.1fr_1fr_1fr_0.6fr]">
            <label>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Structure</span>
              <select value={structure} onChange={(event) => setStructure(event.target.value as TradeStructure)} className="mt-1.5 w-full rounded-md border border-zinc-200 bg-card px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900">
                <option value="stock">Buy stock</option>
                <option value="csp">Cash-secured put</option>
                <option value="covered_call">Covered call</option>
              </select>
            </label>
            <label>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Expiration</span>
              <select disabled={structure === "stock"} value={expiration} onChange={(event) => setExpiration(event.target.value)} className="mt-1.5 w-full rounded-md border border-zinc-200 bg-card px-3 py-2 text-sm disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900">
                {expirations.map((date) => <option key={date} value={date}>{date}</option>)}
              </select>
            </label>
            <label>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Fill assumption</span>
              <select disabled={structure === "stock"} value={fillAssumption} onChange={(event) => setFillAssumption(event.target.value as FillAssumption)} className="mt-1.5 w-full rounded-md border border-zinc-200 bg-card px-3 py-2 text-sm disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900">
                <option value="bid">Bid · conservative</option>
                <option value="mid">Midpoint · modeled</option>
                <option value="custom">Custom limit</option>
              </select>
            </label>
            <label>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Quantity</span>
              <input type="number" min={1} max={100} value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value)))} className="mt-1.5 w-full rounded-md border border-zinc-200 bg-card px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
            </label>
          </section>

          {structure !== "stock" && (
            <section className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Live contract alternatives</h3>
                  <p className="mt-0.5 text-[11px] text-zinc-400">Nearest 0.30 delta · OTM · sorted by delta then open interest</p>
                </div>
                <span className="text-[11px] text-zinc-400">{loading ? "Loading…" : `${contracts.length} candidates`}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-xs">
                  <thead><tr className="border-b border-zinc-100 text-left text-[10px] uppercase tracking-wide text-zinc-400 dark:border-zinc-800">
                    <th className="px-4 py-2">Select</th><th className="px-4 py-2 text-right">Strike</th><th className="px-4 py-2 text-right">Delta</th><th className="px-4 py-2 text-right">Bid</th><th className="px-4 py-2 text-right">Ask</th><th className="px-4 py-2 text-right">Spread</th><th className="px-4 py-2 text-right">Volume</th><th className="px-4 py-2 text-right">OI</th><th className="px-4 py-2 text-right">IV</th>
                  </tr></thead>
                  <tbody>
                    {contracts.map((contract) => (
                      <tr key={contract.symbol} onClick={() => setSelectedContract(contract)} className={`cursor-pointer border-b border-zinc-100 dark:border-zinc-900 ${selectedContract?.symbol === contract.symbol ? "bg-amber-50 dark:bg-amber-950/20" : "hover:bg-zinc-50 dark:hover:bg-zinc-900"}`}>
                        <td className="px-4 py-2.5"><input type="radio" checked={selectedContract?.symbol === contract.symbol} onChange={() => setSelectedContract(contract)} aria-label={`Select ${contract.symbol}`} /></td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold">{decimal(contract.strike)}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{decimal(contract.delta, 3)}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{decimal(contract.bid)}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{decimal(contract.ask)}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{contract.mid ? `${((((contract.ask ?? 0) - (contract.bid ?? 0)) / contract.mid) * 100).toFixed(1)}%` : "—"}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{contract.volume?.toLocaleString() ?? "—"}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{contract.open_interest?.toLocaleString() ?? "—"}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{contract.implied_volatility == null ? "—" : `${(contract.implied_volatility * 100).toFixed(1)}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {fillAssumption === "custom" && (
                <label className="flex items-center gap-3 border-t border-zinc-200 px-4 py-3 text-xs dark:border-zinc-800">
                  <span className="font-semibold text-zinc-500">Custom credit</span>
                  <input type="number" min={0} step={0.01} value={customFill} onChange={(event) => setCustomFill(Number(event.target.value))} className="w-28 rounded-md border border-zinc-200 bg-card px-2 py-1.5 font-mono dark:border-zinc-700 dark:bg-zinc-900" />
                </label>
              )}
            </section>
          )}

          <section className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.7fr)]">
            <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Expiration payoff</h3>
                <span className="text-[10px] uppercase tracking-wide text-zinc-400">{structure.replace("_", " ")}</span>
              </div>
              <PayoffChart inputs={inputs} />
            </div>
            <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Decision summary</h3>
              <dl className="mt-3 space-y-3 text-xs">
                <div className="flex justify-between gap-3"><dt className="text-zinc-400">Market</dt><dd className="text-right font-mono">Bid {decimal(selectedContract?.bid)} · Ask {decimal(selectedContract?.ask)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-zinc-400">Plan fill</dt><dd className="text-right font-mono">${fill.toFixed(2)} · {fillAssumption}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-zinc-400">Liquidity</dt><dd className={`text-right font-mono ${(relativeSpread ?? 0) > 0.25 ? "text-amber-600" : ""}`}>{relativeSpread == null ? "stock" : `${(relativeSpread * 100).toFixed(1)}% spread`}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-zinc-400">Earnings</dt><dd className="text-right text-amber-600">Unknown · verify</dd></div>
              </dl>
              <p className="mt-4 rounded-lg bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                No order will be submitted. Midpoint and scenarios are model assumptions; only the timestamped bid/ask is market data.
              </p>
            </div>
          </section>

          <section className="grid grid-cols-2 overflow-hidden rounded-xl border border-zinc-200 py-3 sm:grid-cols-4 lg:grid-cols-8 dark:border-zinc-800">
            <RiskMetric label="Max profit" value={money(risk.maxProfit)} />
            <RiskMetric label="Max loss" value={money(risk.maxLoss)} warning />
            <RiskMetric label="Breakeven" value={`$${risk.breakeven.toFixed(2)}`} />
            <RiskMetric label="Capital" value={money(risk.capitalAtRisk)} warning />
            <RiskMetric label="Delta" value={risk.netDelta.toFixed(1)} />
            <RiskMetric label="Gamma" value={risk.netGamma.toFixed(2)} />
            <RiskMetric label="Theta/day" value={risk.netTheta.toFixed(2)} />
            <RiskMetric label="Vega/pt" value={risk.netVega.toFixed(2)} />
          </section>

          <section className="rounded-xl border border-sky-200 bg-sky-50/40 p-4 dark:border-sky-900 dark:bg-sky-950/20">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Portfolio-aware risk</h3>
                <p className="mt-0.5 text-[11px] text-zinc-400">Schwab + Fidelity · before/after exposure · equity delta approximation</p>
              </div>
              <span className="text-[10px] uppercase tracking-wide text-zinc-400">
                {portfolioUnavailable.length ? `Partial: ${portfolioUnavailable.join(", ")}` : `${portfolioPositions.length} positions`}
              </span>
            </div>
            {portfolioPositions.length ? (
              <>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Metric label="Portfolio value" value={money(portfolioRisk.portfolioValue)} />
                  <Metric label="Proposed capital" value={`${money(portfolioRisk.proposedCapital)} · ${portfolioRisk.proposedPct == null ? "—" : `${(portfolioRisk.proposedPct * 100).toFixed(1)}%`}`} />
                  <Metric label={`${symbol} after`} value={`${money(portfolioRisk.postSymbolValue)} · ${portfolioRisk.postSymbolPct == null ? "—" : `${(portfolioRisk.postSymbolPct * 100).toFixed(1)}%`}`} />
                  <Metric label="−10% beta stress" value={money(portfolioRisk.downside10)} />
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-sky-100 bg-card p-3 text-xs dark:border-sky-900 dark:bg-zinc-950">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Delta shares · before → after</p>
                    <p className="mt-1 font-mono text-sm font-semibold">{portfolioRisk.equityDeltaShares.toFixed(1)} → {portfolioRisk.postDeltaShares.toFixed(1)}</p>
                    <p className="mt-1 text-[10px] text-zinc-400">Cash equities treated as 1.0 delta; proposed option Greeks use the live chain.</p>
                  </div>
                  <div className="rounded-lg border border-sky-100 bg-card p-3 text-xs dark:border-sky-900 dark:bg-zinc-950">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Concentration · before → after</p>
                    <p className="mt-1 font-mono text-sm font-semibold">
                      {portfolioRisk.portfolioValue ? `${(portfolioRisk.currentSymbolValue / portfolioRisk.portfolioValue * 100).toFixed(1)}%` : "—"}
                      {" → "}
                      {portfolioRisk.postSymbolPct == null ? "—" : `${(portfolioRisk.postSymbolPct * 100).toFixed(1)}%`}
                    </p>
                    <p className="mt-1 text-[10px] text-zinc-400">{heldSector ? `${heldSector} after: ${portfolioRisk.postSectorPct == null ? "—" : `${(portfolioRisk.postSectorPct * 100).toFixed(1)}%`}` : "Sector unknown for this candidate."}</p>
                  </div>
                </div>
                {portfolioRisk.warnings.length > 0 && (
                  <ul className="mt-3 space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    {portfolioRisk.warnings.map((warning) => <li key={warning}>! {warning}</li>)}
                  </ul>
                )}
                <p className="mt-3 text-[10px] leading-relaxed text-zinc-400">Working limits: proposed capital 10%, single symbol 15%, sector 30%. Stress is a beta approximation, not VaR; missing beta/sector data remains unknown.</p>
              </>
            ) : <p className="mt-3 text-xs text-zinc-400">Portfolio data unavailable; before/after exposure is unknown, not zero.</p>}
          </section>

          <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Price × IV scenario</h3>
                <p className="mt-0.5 text-[11px] text-zinc-400">Greek approximation before expiration · excludes fees and skew changes</p>
              </div>
              <label className="flex items-center gap-2 text-xs text-zinc-500">
                Time passes
                <select value={daysElapsed} onChange={(event) => setDaysElapsed(Number(event.target.value))} className="rounded-md border border-zinc-200 bg-card px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900">
                  <option value={0}>0 days</option><option value={7}>7 days</option><option value={14}>14 days</option><option value={21}>21 days</option>
                </select>
              </label>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[520px] text-xs">
                <thead><tr><th className="px-3 py-2 text-left text-zinc-400">IV move</th>{[-0.1, 0, 0.1].map((move) => <th key={move} className="px-3 py-2 text-right text-zinc-400">Price {move > 0 ? "+" : ""}{move * 100}%</th>)}</tr></thead>
                <tbody>
                  {[-5, 0, 5].map((ivMove) => (
                    <tr key={ivMove} className="border-t border-zinc-100 dark:border-zinc-900">
                      <td className="px-3 py-3 font-medium">IV {ivMove > 0 ? "+" : ""}{ivMove} pts</td>
                      {[-0.1, 0, 0.1].map((priceMove) => {
                        const pnl = scenarioPnL(inputs, priceMove, ivMove, daysElapsed);
                        return <td key={priceMove} className={`px-3 py-3 text-right font-mono font-semibold ${pnl >= 0 ? "text-emerald-600" : "text-red-500"}`}>{money(pnl)}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Paper plan</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-zinc-500">Entry rule<textarea value={entryRule} onChange={(event) => setEntryRule(event.target.value)} className="mt-1.5 min-h-20 w-full rounded-md border border-zinc-200 bg-card p-2 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200" /></label>
              <label className="text-xs text-zinc-500">Invalidation rule<textarea value={invalidationRule} onChange={(event) => setInvalidationRule(event.target.value)} className="mt-1.5 min-h-20 w-full rounded-md border border-zinc-200 bg-card p-2 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200" /></label>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs text-emerald-600">{status}</p>
              <button disabled={liveSpot <= 0 || (structure !== "stock" && !selectedContract)} onClick={savePlan} className="rounded-md bg-zinc-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900">Save paper plan</button>
            </div>
            {savedPlans.length > 0 && (
              <div className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-zinc-400">Recent paper drafts</p>
                <div className="mt-2 space-y-1.5">
                  {savedPlans.slice(0, 3).map((plan) => (
                    <div key={plan.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-zinc-50 px-3 py-2 text-xs dark:bg-zinc-900">
                      <span><strong>{plan.symbol}</strong> · {plan.structure.replace("_", " ")} · {plan.quantity}×</span>
                      <span className="font-mono text-zinc-500">
                        {plan.strike ? `$${plan.strike.toFixed(2)} strike · ` : ""}{money(plan.risk?.capitalAtRisk)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
