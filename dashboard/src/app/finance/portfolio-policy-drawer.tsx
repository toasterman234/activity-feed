// ── Portfolio Policy Settings Drawer ──
// Slide-in panel to configure all opportunity thresholds and risk limits.
// Uses a plain overlay div — no external dialog library.

"use client";

import { useState, useEffect } from "react";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePortfolioPolicy } from "@/lib/portfolio-analytics/settings-store";

function SliderField({
  label, value, min, max, step, unit, onChange, hint,
}: {
  label: string; value: number; min: number; max: number; step: number;
  unit?: string; onChange: (v: number) => void; hint?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-600 dark:text-zinc-300">{label}</span>
        <span className="tabular-nums font-medium text-zinc-800 dark:text-zinc-200">
          {value}{unit ? ` ${unit}` : ""}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
      {hint && <p className="text-[10px] text-zinc-400">{hint}</p>}
    </div>
  );
}

function ToggleField({
  label, value, onChange, hint,
}: {
  label: string; value: boolean; onChange: (v: boolean) => void; hint?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-xs text-zinc-600 dark:text-zinc-300">{label}</p>
        {hint && <p className="text-[10px] text-zinc-400">{hint}</p>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative h-5 w-9 rounded-full transition-colors ${
          value ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
            value ? "translate-x-[18px]" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

export function PortfolioPolicyDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { config, update, reset } = usePortfolioPolicy();
  const [expanded, setExpanded] = useState<string | null>("roll");
  const [blockedSymbolInput, setBlockedSymbolInput] = useState("");
  const [blockedStrategyInput, setBlockedStrategyInput] = useState("");

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      {/* Drawer */}
      <div className="absolute right-0 top-0 h-full w-full max-w-sm overflow-y-auto border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div>
            <h2 className="text-sm font-semibold">Portfolio Policy</h2>
            <p className="text-[10px] text-zinc-500">Configure thresholds and risk limits</p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={() => onOpenChange(false)}>
            <XIcon className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-1 p-4">
          {/* Roll Candidate */}
          <SectionHeader title="Roll Candidate" id="roll" expanded={expanded} onToggle={setExpanded} />
          {expanded === "roll" && (
            <div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
              <SliderField label="Max DTE" value={config.rollMaxDte} min={1} max={90} step={1} unit="days" onChange={(v) => update({ rollMaxDte: v })} hint="Trigger roll when DTE falls below this" />
              <SliderField label="Delta threshold" value={config.rollDeltaThreshold} min={0} max={1} step={0.05} onChange={(v) => update({ rollDeltaThreshold: v })} hint="Trigger when delta exceeds this" />
              <SliderField label="Min credit" value={config.rollMinCredit} min={0} max={5} step={0.1} unit="$" onChange={(v) => update({ rollMinCredit: v })} hint="Minimum net credit required" />
              <SliderField label="Max roll close DTE" value={config.rollMaxCloseDte} min={0} max={14} step={1} unit="days" onChange={(v) => update({ rollMaxCloseDte: v })} hint="Close leg DTE window" />
              <SliderField label="Max roll reopen DTE" value={config.rollMaxReopenDte} min={7} max={120} step={1} unit="days" onChange={(v) => update({ rollMaxReopenDte: v })} hint="Reopen leg max DTE" />
            </div>
          )}

          {/* Close Winner */}
          <SectionHeader title="Close Winner" id="closeWinner" expanded={expanded} onToggle={setExpanded} />
          {expanded === "closeWinner" && (
            <div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
              <SliderField label="% of Max Profit" value={config.closeWinnerPctThreshold} min={50} max={99} step={1} unit="%" onChange={(v) => update({ closeWinnerPctThreshold: v })} hint="Close when % of max profit exceeds this" />
              <SliderField label="Remaining Risk Reward" value={config.closeWinnerMinRiskReward} min={0.1} max={5} step={0.1} onChange={(v) => update({ closeWinnerMinRiskReward: v })} hint="Min remaining risk/reward ratio" />
            </div>
          )}

          {/* Buying Power Release */}
          <SectionHeader title="Buying Power Release" id="bpRelease" expanded={expanded} onToggle={setExpanded} />
          {expanded === "bpRelease" && (
            <div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
              <SliderField label="Max BP usage %" value={config.bpReleasePctThreshold * 100} min={5} max={50} step={1} unit="%" onChange={(v) => update({ bpReleasePctThreshold: v / 100 })} hint="Flag positions using more than this % of buying power" />
              <SliderField label="Min BP gain %" value={config.bpReleaseMinGainPct * 100} min={1} max={20} step={1} unit="%" onChange={(v) => update({ bpReleaseMinGainPct: v / 100 })} hint="Must free at least this % of buying power" />
            </div>
          )}

          {/* Risk Limits */}
          <SectionHeader title="Risk Limits" id="risk" expanded={expanded} onToggle={setExpanded} />
          {expanded === "risk" && (
            <div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
              <SliderField label="Max ticker concentration %" value={config.maxTickerConcentrationPct * 100} min={10} max={100} step={5} unit="%" onChange={(v) => update({ maxTickerConcentrationPct: v / 100 })} />
              <SliderField label="Max sector concentration %" value={config.maxSectorConcentrationPct * 100} min={10} max={100} step={5} unit="%" onChange={(v) => update({ maxSectorConcentrationPct: v / 100 })} />
              <SliderField label="Max undefined risk %" value={config.maxUndefinedRiskPct * 100} min={0} max={100} step={5} unit="%" onChange={(v) => update({ maxUndefinedRiskPct: v / 100 })} />
              <SliderField label="Assignment tolerance" value={config.assignmentTolerance} min={0} max={1} step={0.1} onChange={(v) => update({ assignmentTolerance: v })} hint="Higher = flag more aggressively" />
            </div>
          )}

          {/* Income Enhancement */}
          <SectionHeader title="Income Enhancement" id="income" expanded={expanded} onToggle={setExpanded} />
          {expanded === "income" && (
            <div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
              <SliderField label="Min DTE" value={config.incomeEnhancementMinDte} min={7} max={90} step={1} unit="days" onChange={(v) => update({ incomeEnhancementMinDte: v })} />
              <SliderField label="Max DTE" value={config.incomeEnhancementMaxDte} min={14} max={180} step={1} unit="days" onChange={(v) => update({ incomeEnhancementMaxDte: v })} />
              <SliderField label="Delta range start" value={config.incomeEnhancementDeltaStart} min={0} max={0.5} step={0.05} onChange={(v) => update({ incomeEnhancementDeltaStart: v })} />
              <SliderField label="Delta range end" value={config.incomeEnhancementDeltaEnd} min={0.05} max={1} step={0.05} onChange={(v) => update({ incomeEnhancementDeltaEnd: v })} />
              <SliderField label="Min open interest" value={config.minOpenInterest} min={0} max={5000} step={100} onChange={(v) => update({ minOpenInterest: v })} />
              <SliderField label="Max spread %" value={config.maxBidAskSpreadPct * 100} min={1} max={20} step={1} unit="%" onChange={(v) => update({ maxBidAskSpreadPct: v / 100 })} />
              <SliderField label="Earnings blackout (days)" value={config.earningsBlackoutDays} min={0} max={30} step={1} unit="days" onChange={(v) => update({ earningsBlackoutDays: v })} />
            </div>
          )}

          {/* General */}
          <SectionHeader title="General" id="general" expanded={expanded} onToggle={setExpanded} />
          {expanded === "general" && (
            <div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
              <ToggleField
                label="New-position discovery"
                value={config.enableNewPositionDiscovery}
                onChange={(v) => update({ enableNewPositionDiscovery: v })}
                hint="Enable opportunity suggestions for opening new positions"
              />
              <div>
                <label className="text-[10px] text-zinc-500">Blocked Symbols</label>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(config.blockedSymbols ?? []).map((s) => (
                    <span key={s} className="inline-flex items-center gap-0.5 rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] dark:bg-zinc-700">
                      {s}
                      <button onClick={() => update({ blockedSymbols: (config.blockedSymbols ?? []).filter((b) => b !== s) })} className="text-zinc-400 hover:text-red-500">&times;</button>
                    </span>
                  ))}
                </div>
                <div className="mt-1 flex gap-1">
                  <input
                    value={blockedSymbolInput}
                    onChange={(e) => setBlockedSymbolInput(e.target.value.toUpperCase())}
                    placeholder="AAPL"
                    className="w-20 rounded border border-zinc-200 px-2 py-0.5 text-[10px] dark:border-zinc-700 dark:bg-zinc-800"
                  />
                  <button
                    onClick={() => {
                      if (blockedSymbolInput && !(config.blockedSymbols ?? []).includes(blockedSymbolInput)) {
                        update({ blockedSymbols: [...(config.blockedSymbols ?? []), blockedSymbolInput] });
                      }
                      setBlockedSymbolInput("");
                    }}
                    className="rounded bg-zinc-200 px-2 py-0.5 text-[10px] hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600"
                  >
                    Add
                  </button>
                </div>
              </div>
              <div>
                <label className="text-[10px] text-zinc-500">Blocked Strategies</label>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(config.blockedStrategies ?? []).map((s) => (
                    <span key={s} className="inline-flex items-center gap-0.5 rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] dark:bg-zinc-700">
                      {s}
                      <button onClick={() => update({ blockedStrategies: (config.blockedStrategies ?? []).filter((b) => b !== s) })} className="text-zinc-400 hover:text-red-500">&times;</button>
                    </span>
                  ))}
                </div>
                <div className="mt-1 flex gap-1">
                  <input
                    value={blockedStrategyInput}
                    onChange={(e) => setBlockedStrategyInput(e.target.value)}
                    placeholder="short_put"
                    className="w-32 rounded border border-zinc-200 px-2 py-0.5 text-[10px] dark:border-zinc-700 dark:bg-zinc-800"
                  />
                  <button
                    onClick={() => {
                      if (blockedStrategyInput && !(config.blockedStrategies ?? []).includes(blockedStrategyInput)) {
                        update({ blockedStrategies: [...(config.blockedStrategies ?? []), blockedStrategyInput] });
                      }
                      setBlockedStrategyInput("");
                    }}
                    className="rounded bg-zinc-200 px-2 py-0.5 text-[10px] hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600"
                  >
                    Add
                  </button>
                </div>
              </div>
              <div className="pt-2">
                <Button variant="outline" size="sm" onClick={reset} className="w-full text-[10px]">
                  Reset to Defaults
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionHeader({
  title, id, expanded, onToggle,
}: {
  title: string; id: string; expanded: string | null; onToggle: (id: string | null) => void;
}) {
  return (
    <button
      onClick={() => onToggle(expanded === id ? null : id)}
      className="flex w-full items-center justify-between rounded-md px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      {title}
      <svg className={`h-3 w-3 transition-transform ${expanded === id ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 18l6-6-6-6" />
      </svg>
    </button>
  );
}
