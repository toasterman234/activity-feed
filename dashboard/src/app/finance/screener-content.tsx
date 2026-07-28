"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getPublicScreener,
  getUnifiedScan,
  type PublicScreenerResult,
  type UnifiedScanResult,
} from "../../lib/market-lake";
import CandidateCompare from "./candidate-compare";
import CandidateInspectionSheet, { type CandidateSummary } from "./candidate-inspection-sheet";
import OptionChainSheet from "./option-chain-sheet";
import TradeLabSheet from "./trade-lab-sheet";
import { getFinanceResearch, type FinanceResearchContext } from "../../lib/finance-research";
import {
  DEFAULT_FILTERS,
  SCREEN_PRESETS,
  SCREENER_STORAGE_KEY,
  type ScreenDefinition,
  type ScreenerFilters,
} from "./screener-model";

const SCREENER_SYMBOLS = [
  "AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "META", "GOOGL", "AMD",
  "NFLX", "COIN", "PLTR", "SPY", "QQQ", "IWM",
];
const SCREENER_SHORTLIST_KEY = "finance-screener-shortlist-v1";

type Candidate = PublicScreenerResult | UnifiedScanResult;

function fmtPct(value: number | null | undefined, digits = 1): string {
  return value == null ? "—" : `${(value * 100).toFixed(digits)}%`;
}

function isLiveCandidate(row: Candidate): row is PublicScreenerResult {
  return "atm_iv" in row;
}

function evidenceStyle(evidence: ScreenDefinition["evidence"]): string {
  if (evidence === "live") return "border-emerald-300/70 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300";
  if (evidence === "research") return "border-amber-300/70 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300";
  return "border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
}

function reasons(row: Candidate, definition: ScreenDefinition): string[] {
  if (isLiveCandidate(row)) {
    const out = [`ATM IV ${fmtPct(row.atm_iv)}`];
    if (row.option_volume >= 1000) out.push(`${row.option_volume.toLocaleString()} option volume`);
    if ((row.put_call_volume ?? 0) >= 1.15) out.push("put volume leading");
    if ((row.put_call_volume ?? 99) <= 0.85) out.push("call volume leading");
    return out.slice(0, 3);
  }
  const out: string[] = [];
  if (definition.mode === "composite" && row.composite_score != null) out.push(`composite ${fmtPct(row.composite_score)}`);
  if (definition.mode === "vrp" && row.vrp_30d != null) out.push(`VRP ${fmtPct(row.vrp_30d)}`);
  if (definition.mode === "fundamental" && row.piotroski_score != null) out.push(`Piotroski ${row.piotroski_score.toFixed(0)}`);
  if (definition.mode === "momentum" && row.mom_12m != null) out.push(`12M momentum ${fmtPct(row.mom_12m)}`);
  if (definition.mode === "dividend" && row.trailing_12m_regular_yield != null) out.push(`yield ${fmtPct(row.trailing_12m_regular_yield)}`);
  if (definition.mode === "ta" && row.rsi_14 != null) out.push(`RSI ${row.rsi_14.toFixed(1)}`);
  if (row.sector) out.push(row.sector);
  return out.slice(0, 3);
}

function contradictions(row: Candidate, definition: ScreenDefinition): string[] {
  const out: string[] = [];
  if (isLiveCandidate(row)) {
    if ((row.put_call_volume ?? 1) >= 1.5) out.push("heavy put flow can signal downside concern");
    if (row.option_volume < 5_000) out.push("option volume may limit executable fills");
    if ((row.atm_iv ?? 0) >= 0.8) out.push("high IV can reflect event or gap risk");
  } else {
    if (row.piotroski_score != null && row.piotroski_score < 7) out.push("below assignment-quality gate");
    if (row.debt_to_equity != null && row.debt_to_equity > 1.5) out.push("leverage exceeds research floor");
    if (row.mom_12m != null && row.mom_12m < 0) out.push("negative 12M momentum");
    if (row.rsi_14 != null && row.rsi_14 > 70) out.push("overbought RSI");
  }
  if (definition.evidence !== "live") out.push("historical signal may be stale");
  out.push("earnings date unknown");
  return out.slice(0, 3);
}

function primaryMetric(row: Candidate, definition: ScreenDefinition): { label: string; value: string } {
  if (isLiveCandidate(row)) return { label: "ATM IV", value: fmtPct(row.atm_iv) };
  if (definition.mode === "composite") return { label: "Composite", value: fmtPct(row.composite_score) };
  if (definition.mode === "vrp") return { label: "VRP", value: fmtPct(row.vrp_30d) };
  if (definition.mode === "fundamental") return { label: "Piotroski", value: row.piotroski_score?.toFixed(0) ?? "—" };
  if (definition.mode === "momentum") return { label: "12M momentum", value: fmtPct(row.mom_12m) };
  if (definition.mode === "dividend") return { label: "Yield", value: fmtPct(row.trailing_12m_regular_yield) };
  return { label: "RSI", value: row.rsi_14?.toFixed(1) ?? "—" };
}

function summarizeCandidate(row: Candidate, definition: ScreenDefinition, asOf: string | null): CandidateSummary {
  const primary = primaryMetric(row, definition);
  return {
    symbol: row.symbol,
    last: isLiveCandidate(row) ? row.last : row.last_close ?? null,
    changePct: isLiveCandidate(row) ? row.change_pct : null,
    primaryLabel: primary.label,
    primaryValue: primary.value,
    reasons: reasons(row, definition),
    contradictions: contradictions(row, definition),
    source: definition.mode === "live" ? "Public.com live" : "Market Lake historical",
    asOf,
  };
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="space-y-1">
      <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-xs text-zinc-700 outline-none transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </label>
  );
}

export default function ScreenerContent() {
  const [savedScreens, setSavedScreens] = useState<ScreenDefinition[]>([]);
  const [activeId, setActiveId] = useState("live-options");
  const [filters, setFilters] = useState<ScreenerFilters>(DEFAULT_FILTERS);
  const [topN, setTopN] = useState(30);
  const [results, setResults] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [chainSymbol, setChainSymbol] = useState<string | null>(null);
  const [tradeCandidate, setTradeCandidate] = useState<CandidateSummary | null>(null);
  const [compareSymbols, setCompareSymbols] = useState<string[]>([]);
  const [shortlist, setShortlist] = useState<string[]>([]);
  const [channelResearch, setChannelResearch] = useState<FinanceResearchContext[]>([]);

  const definitions = useMemo(() => [...SCREEN_PRESETS, ...savedScreens], [savedScreens]);
  const definition = definitions.find((item) => item.id === activeId) ?? SCREEN_PRESETS[0];

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SCREENER_STORAGE_KEY);
      if (raw) setSavedScreens(JSON.parse(raw) as ScreenDefinition[]);
      const savedShortlist = window.localStorage.getItem(SCREENER_SHORTLIST_KEY);
      if (savedShortlist) setShortlist(JSON.parse(savedShortlist) as string[]);
    } catch {
      setSavedScreens([]);
    }
  }, []);

  const toggleShortlist = (symbol: string) => {
    setShortlist((current) => {
      const next = current.includes(symbol) ? current.filter((item) => item !== symbol) : [...current, symbol];
      window.localStorage.setItem(SCREENER_SHORTLIST_KEY, JSON.stringify(next));
      return next;
    });
  };

  const toggleCompare = (symbol: string) => {
    setCompareSymbols((current) => {
      if (current.includes(symbol)) return current.filter((item) => item !== symbol);
      return current.length >= 4 ? [...current.slice(1), symbol] : [...current, symbol];
    });
  };

  const persistSaved = (next: ScreenDefinition[]) => {
    setSavedScreens(next);
    window.localStorage.setItem(SCREENER_STORAGE_KEY, JSON.stringify(next));
  };

  const chooseScreen = (id: string) => {
    const next = definitions.find((item) => item.id === id);
    if (!next) return;
    setActiveId(id);
    setFilters(next.filters);
    setError(null);
  };

  const updateFilter = <K extends keyof ScreenerFilters>(key: K, value: ScreenerFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const runScan = async () => {
    setLoading(true);
    setError(null);
    try {
      if (definition.mode === "live") {
        let rows = await getPublicScreener(SCREENER_SYMBOLS, filters.minIv, 100);
        rows = rows.filter((row) => {
          if (row.option_volume < filters.minOptionVolume) return false;
          if (row.contracts < filters.minContracts) return false;
          if (filters.flowBias === "put" && (row.put_call_volume ?? 0) < 1) return false;
          if (filters.flowBias === "call" && (row.put_call_volume ?? 99) > 1) return false;
          return true;
        });
        setResults(rows.slice(0, topN));
        setAsOf(new Date().toISOString());
      } else {
        const response = await getUnifiedScan(definition.mode, {
          marketCap: filters.marketCap,
          hasOptions: filters.hasOptions,
          ivrLevel: filters.ivrLevel,
          vrpLevel: filters.vrpLevel,
          piotroskiLevel: filters.piotroskiLevel,
          debtLevel: filters.debtLevel,
          momentumLevel: filters.momentumLevel,
          trendRegime: filters.trendRegime,
          yieldLevel: filters.yieldLevel,
          rsiSignal: filters.rsiSignal,
        }, topN);
        setResults(response.rows);
        setAsOf(response.meta.as_of);
      }
      setLastRun(new Date().toISOString());
    } catch (caught) {
      const historical = definition.mode !== "live";
      setResults([]);
      setError(
        historical
          ? "Historical lake is busy with a batch write. Live Options remains available; retry this preset shortly."
          : caught instanceof Error ? caught.message : "Live scan failed",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setFilters(SCREEN_PRESETS[0].filters);
    void runScan();
    void getFinanceResearch().then((snapshot) => setChannelResearch(snapshot.contexts)).catch(() => {});
    // Initial scan only; later runs are explicit so filter edits do not fan out live-chain calls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveCurrent = () => {
    const suggested = `${definition.name} copy`;
    const name = window.prompt("Name this screen", suggested)?.trim();
    if (!name) return;
    const saved: ScreenDefinition = {
      ...definition,
      id: `mine-${Date.now()}`,
      name,
      description: `Saved from ${definition.name}`,
      version: 1,
      filters,
    };
    persistSaved([...savedScreens, saved]);
    setActiveId(saved.id);
  };

  const deleteCurrent = () => {
    if (!definition.id.startsWith("mine-")) return;
    const next = savedScreens.filter((item) => item.id !== definition.id);
    persistSaved(next);
    chooseScreen("live-options");
  };

  const candidateSummaries = useMemo(
    () => results.map((row) => summarizeCandidate(row, definition, asOf)),
    [asOf, definition, results],
  );
  const comparedCandidates = compareSymbols.flatMap((symbol) => {
    const match = candidateSummaries.find((candidate) => candidate.symbol === symbol);
    return match ? [match] : [];
  });
  const selectedSummary = selectedCandidate ? summarizeCandidate(selectedCandidate, definition, asOf) : null;

  return (
    <>
      <div className="space-y-4">
        <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="border-b border-zinc-200 bg-zinc-950 px-4 py-4 text-zinc-100 dark:border-zinc-800">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-400">Screen recipe · v{definition.version}</p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight">{definition.name}</h2>
                <p className="mt-1 max-w-2xl text-xs leading-relaxed text-zinc-400">{definition.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${evidenceStyle(definition.evidence)}`}>
                  {definition.evidence}
                </span>
                <span className="rounded-full border border-zinc-700 px-2 py-1 text-[10px] text-zinc-400">
                  {definition.mode === "live" ? "Public.com" : "Market Lake"}
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="space-y-1">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Preset</span>
                <select
                  value={activeId}
                  onChange={(event) => chooseScreen(event.target.value)}
                  className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  <optgroup label="Built in">
                    {SCREEN_PRESETS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </optgroup>
                  {savedScreens.length > 0 && (
                    <optgroup label="My screens">
                      {savedScreens.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </optgroup>
                  )}
                </select>
              </label>
              <label className="space-y-1">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Universe</span>
                <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                  {definition.mode === "live" ? "Liquid focus · 14 symbols" : "Tracked equity universe"}
                </div>
              </label>
              <label className="space-y-1">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Show</span>
                <input
                  type="number"
                  min={5}
                  max={100}
                  value={topN}
                  onChange={(event) => setTopN(Math.max(5, Number(event.target.value) || 5))}
                  className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <button onClick={() => setFiltersOpen((open) => !open)} className="rounded-md border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900">
                {filtersOpen ? "Hide filters" : "Customize"}
              </button>
              <button onClick={saveCurrent} className="rounded-md border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900">
                Save as
              </button>
              {definition.id.startsWith("mine-") && (
                <button onClick={deleteCurrent} className="rounded-md border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400">
                  Delete
                </button>
              )}
              <button onClick={() => { void runScan(); }} disabled={loading} className="rounded-md bg-amber-400 px-4 py-2 text-xs font-bold text-zinc-950 transition hover:bg-amber-300 disabled:cursor-wait disabled:opacity-60">
                {loading ? "Running…" : "Run screen"}
              </button>
            </div>
          </div>

          {filtersOpen && (
            <div className="border-t border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
              {definition.mode === "live" ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="space-y-1">
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Min ATM IV</span>
                    <input type="number" min={0} max={3} step={0.05} value={filters.minIv} onChange={(event) => updateFilter("minIv", Number(event.target.value))} className="w-full rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900" />
                  </label>
                  <label className="space-y-1">
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Min option volume</span>
                    <input type="number" min={0} step={100} value={filters.minOptionVolume} onChange={(event) => updateFilter("minOptionVolume", Number(event.target.value))} className="w-full rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900" />
                  </label>
                  <label className="space-y-1">
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Min contracts</span>
                    <input type="number" min={0} step={10} value={filters.minContracts} onChange={(event) => updateFilter("minContracts", Number(event.target.value))} className="w-full rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900" />
                  </label>
                  <SelectField label="Flow bias" value={filters.flowBias} onChange={(value) => updateFilter("flowBias", value as ScreenerFilters["flowBias"])} options={[["all", "Any"], ["put", "Put volume leads"], ["call", "Call volume leads"]]} />
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <SelectField label="Market cap" value={filters.marketCap} onChange={(value) => updateFilter("marketCap", value as ScreenerFilters["marketCap"])} options={[["", "Any"], ["micro", "Micro"], ["small", "Small"], ["mid", "Mid"], ["large", "Large"], ["mega", "Mega"]]} />
                  <SelectField label="Options coverage" value={filters.hasOptions} onChange={(value) => updateFilter("hasOptions", value as ScreenerFilters["hasOptions"])} options={[["", "Any"], ["yes", "Has options"], ["no", "No options"]]} />
                  {(definition.mode === "vrp" || definition.mode === "composite") && (
                    <>
                      <SelectField label="IV rank" value={filters.ivrLevel} onChange={(value) => updateFilter("ivrLevel", value as ScreenerFilters["ivrLevel"])} options={[["", "Any"], ["very_low", "Very low"], ["low", "Low"], ["medium", "Medium"], ["high", "High"], ["extreme", "Extreme"]]} />
                      <SelectField label="VRP" value={filters.vrpLevel} onChange={(value) => updateFilter("vrpLevel", value as ScreenerFilters["vrpLevel"])} options={[["", "Any"], ["negative", "Negative"], ["positive", "Positive"], ["high", "High"]]} />
                    </>
                  )}
                  {(definition.mode === "fundamental" || definition.mode === "composite") && (
                    <>
                      <SelectField label="Piotroski" value={filters.piotroskiLevel} onChange={(value) => updateFilter("piotroskiLevel", value as ScreenerFilters["piotroskiLevel"])} options={[["", "Any"], ["weak", "Weak"], ["average", "Average"], ["strong", "Strong"]]} />
                      <SelectField label="Debt / equity" value={filters.debtLevel} onChange={(value) => updateFilter("debtLevel", value as ScreenerFilters["debtLevel"])} options={[["", "Any"], ["low", "Low"], ["moderate", "Moderate"], ["high", "High"]]} />
                    </>
                  )}
                  {(definition.mode === "momentum" || definition.mode === "composite") && (
                    <>
                      <SelectField label="12M momentum" value={filters.momentumLevel} onChange={(value) => updateFilter("momentumLevel", value as ScreenerFilters["momentumLevel"])} options={[["", "Any"], ["negative", "Negative"], ["positive", "Positive"], ["strong", "Strong"]]} />
                      <SelectField label="Trend" value={filters.trendRegime} onChange={(value) => updateFilter("trendRegime", value as ScreenerFilters["trendRegime"])} options={[["", "Any"], ["bull", "Bull"], ["bear", "Bear"], ["sideways", "Sideways"]]} />
                    </>
                  )}
                  {definition.mode === "dividend" && (
                    <SelectField label="Yield" value={filters.yieldLevel} onChange={(value) => updateFilter("yieldLevel", value as ScreenerFilters["yieldLevel"])} options={[["", "Any"], ["income", "Income"], ["high", "High"]]} />
                  )}
                  {definition.mode === "ta" && (
                    <SelectField label="RSI" value={filters.rsiSignal} onChange={(value) => updateFilter("rsiSignal", value as ScreenerFilters["rsiSignal"])} options={[["", "Any"], ["oversold", "Oversold"], ["neutral", "Neutral"], ["overbought", "Overbought"]]} />
                  )}
                </div>
              )}
              <p className="mt-3 text-[11px] leading-relaxed text-zinc-400">
                Filters are hard gates. Saved screens preserve this recipe locally. A match is a research candidate—not a trade recommendation.
              </p>
            </div>
          )}
        </section>

        {error && (
          <section className="flex items-start justify-between gap-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <div><span className="font-semibold">Degraded source.</span> {error}</div>
            {definition.mode !== "live" && <button onClick={() => chooseScreen("live-options")} className="shrink-0 text-xs font-semibold underline underline-offset-2">Open live scan</button>}
          </section>
        )}

        <CandidateCompare
          candidates={comparedCandidates}
          onInspect={(symbol) => setSelectedCandidate(results.find((row) => row.symbol === symbol) ?? null)}
          onRemove={(symbol) => toggleCompare(symbol)}
          onClear={() => setCompareSymbols([])}
        />

        <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <div>
              <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{definition.name} · {results.length} matches</h3>
              <p className="mt-0.5 text-[11px] text-zinc-400">
                {asOf ? `Data as of ${asOf.slice(0, 19).replace("T", " ")}` : "Run the screen to load results"}
                {lastRun ? ` · run ${new Date(lastRun).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}
              </p>
            </div>
            <span className="text-[11px] text-zinc-400">Tap a row to inspect · select 2–4 to compare</span>
          </div>

          {results.length === 0 && !loading ? (
            <div className="flex min-h-52 flex-col items-center justify-center px-6 text-center">
              <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">{error ? "Source unavailable" : "No matches"}</p>
              <p className="mt-1 max-w-md text-xs leading-relaxed text-zinc-400">{error ? "The recipe is preserved. Retry when the historical batch releases the lake." : "Relax a filter or choose another preset."}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 text-left text-[10px] uppercase tracking-[0.12em] text-zinc-400 dark:border-zinc-800">
                    <th className="w-10 px-3 py-2.5 font-semibold">Compare</th>
                    <th className="sticky left-0 bg-white px-4 py-2.5 font-semibold dark:bg-zinc-950">Candidate</th>
                    <th className="px-4 py-2.5 font-semibold">Why it matched</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Last</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Primary metric</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Liquidity / context</th>
                    <th className="px-4 py-2.5 font-semibold">Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((row) => {
                    const rowReasons = reasons(row, definition);
                    const last = isLiveCandidate(row) ? row.last : row.last_close;
                    const primary = primaryMetric(row, definition).value;
                    const compared = compareSymbols.includes(row.symbol);
                    const linkedResearch = channelResearch.filter((context) => context.symbols.includes(row.symbol));
                    return (
                      <tr key={row.symbol} onClick={() => setSelectedCandidate(row)} className="group cursor-pointer border-b border-zinc-100 transition hover:bg-amber-50/50 dark:border-zinc-900 dark:hover:bg-amber-950/15">
                        <td className="px-3 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={compared}
                            onChange={() => toggleCompare(row.symbol)}
                            onClick={(event) => event.stopPropagation()}
                            aria-label={`Compare ${row.symbol}`}
                            className="size-4 accent-amber-500"
                          />
                        </td>
                        <td className="sticky left-0 bg-white px-4 py-3 group-hover:bg-amber-50 dark:bg-zinc-950 dark:group-hover:bg-[#17140d]">
                          <p className="font-semibold text-zinc-900 dark:text-zinc-100">{row.symbol}</p>
                          <p className="max-w-32 truncate text-[11px] text-zinc-400">{isLiveCandidate(row) ? row.expiration?.slice(0, 10) : row.sector ?? "Tracked universe"}</p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            {rowReasons.map((reason) => <span key={reason} className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-medium text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">{reason}</span>)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-zinc-600 dark:text-zinc-300">{last != null ? `$${last.toFixed(2)}` : "—"}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-zinc-800 dark:text-zinc-100">{primary}</td>
                        <td className="px-4 py-3 text-right font-mono text-[11px] text-zinc-500">
                          {isLiveCandidate(row) ? `${row.option_volume.toLocaleString()} vol · ${row.contracts} contracts` : row.mkt_cap_b != null ? `$${row.mkt_cap_b.toFixed(1)}B` : "historical"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            <span className={`inline-flex rounded-full border px-2 py-1 text-[9px] font-semibold uppercase tracking-wide ${evidenceStyle(definition.evidence)}`}>{definition.evidence}</span>
                            {linkedResearch.slice(0, 2).map((context) => (
                              <span key={context.id} className="inline-flex rounded-full bg-violet-100 px-2 py-1 text-[9px] font-semibold uppercase text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                                {context.status === "stale" ? "stale quant" : "quant"}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <CandidateInspectionSheet
        candidate={selectedSummary}
        mode={definition.mode}
        open={selectedCandidate != null}
        shortlisted={selectedSummary ? shortlist.includes(selectedSummary.symbol) : false}
        onToggleShortlist={() => {
          if (selectedSummary) toggleShortlist(selectedSummary.symbol);
        }}
        onCompare={() => {
          if (selectedSummary) toggleCompare(selectedSummary.symbol);
        }}
        onCreateTrade={() => {
          if (!selectedSummary) return;
          setTradeCandidate(selectedSummary);
          setSelectedCandidate(null);
        }}
        onOpenChain={() => {
          if (!selectedSummary) return;
          setChainSymbol(selectedSummary.symbol);
          setSelectedCandidate(null);
        }}
        onClose={() => setSelectedCandidate(null)}
      />
      <OptionChainSheet symbol={chainSymbol} open={chainSymbol != null} onClose={() => setChainSymbol(null)} />
      <TradeLabSheet
        symbol={tradeCandidate?.symbol ?? null}
        spot={tradeCandidate?.last ?? null}
        open={tradeCandidate != null}
        onClose={() => setTradeCandidate(null)}
      />
    </>
  );
}
