"use client";

import { useEffect, useState } from "react";
import type { RiskAppetiteSnapshot, RiskSignal } from "@/lib/risk-regime";
import type { SectorRSSnapshot, SectorRSResult } from "@/lib/sector-rs";
import type { COTSnapshot } from "@/lib/cot";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Skeleton,
  Separator,
  DividedList,
} from "@/components/ui";

// ── Helpers ──

function regimeBadge(regime: string) {
  switch (regime) {
    case "risk-on":
      return <Badge variant="default">Risk-On</Badge>;
    case "risk-off":
      return <Badge variant="destructive">Risk-Off</Badge>;
    default:
      return <Badge variant="secondary">Neutral</Badge>;
  }
}

function signalDirIcon(dir: "positive" | "negative" | "neutral") {
  if (dir === "positive") return <span className="text-emerald-500">▲</span>;
  if (dir === "negative") return <span className="text-red-500">▼</span>;
  return <span className="text-zinc-400">—</span>;
}

function fmtPct(n: number): string {
  return `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function fmtNum(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function relativeTime(iso: string | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - Date.parse(iso);
  if (Number.isNaN(diff)) return iso;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Sub-components ──

function SignalRow({ label, signal }: { label: string; signal: RiskSignal }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-zinc-500">{label}</span>
      <div className="flex items-center gap-2">
        <span className="tabular-nums font-medium text-zinc-800 dark:text-zinc-200">
          {signal.latest.toFixed(2)}
        </span>
        <span className="flex items-center gap-0.5 text-xs text-zinc-400">
          {signalDirIcon(signal.direction)}
          <span className="tabular-nums">{signal.avg1y.toFixed(2)}</span>
        </span>
      </div>
    </div>
  );
}

function SectorRow({ s }: { s: SectorRSResult }) {
  return (
    <div className="flex items-center gap-3 py-2 text-sm">
      <span className="w-5 text-right tabular-nums text-xs font-medium text-zinc-400">
        {s.rank}
      </span>
      <span className="w-12 truncate font-mono text-xs text-zinc-600 dark:text-zinc-300">
        {s.symbol}
      </span>
      <span className="min-w-0 flex-1 truncate text-zinc-700 dark:text-zinc-200">
        {s.name}
      </span>
      <div className="flex shrink-0 items-center gap-2 text-xs tabular-nums">
        <span className="w-14 text-right font-medium text-zinc-800 dark:text-zinc-100">
          {s.score}
        </span>
        <span className="w-14 text-right text-zinc-400">
          {fmtPct(s.excessReturn20d * 100)}
        </span>
        <span className="w-14 text-right text-zinc-400">
          {fmtPct(s.excessReturn60d * 100)}
        </span>
      </div>
    </div>
  );
}

function COTRow({ label, net }: { label: string; net: number }) {
  const pos = net > 0;
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-zinc-500">{label}</span>
      <span
        className={`tabular-nums font-medium ${
          pos ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
        }`}
      >
        {pos ? "+" : ""}
        {fmtNum(net)}
      </span>
    </div>
  );
}

// ── Main ──

export default function MoneyFlowContent() {
  const [risk, setRisk] = useState<RiskAppetiteSnapshot | null>(null);
  const [sectors, setSectors] = useState<SectorRSSnapshot | null>(null);
  const [cot, setCot] = useState<COTSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/fred/risk-appetite").then((r) => {
        if (!r.ok) throw new Error(`Risk: ${r.status}`);
        return r.json() as Promise<RiskAppetiteSnapshot>;
      }),
      fetch("/api/finance/sector-rs").then((r) => {
        if (!r.ok) throw new Error(`Sectors: ${r.status}`);
        return r.json() as Promise<SectorRSSnapshot>;
      }),
      fetch("/api/finance/cot").then((r) => {
        if (!r.ok) throw new Error(`COT: ${r.status}`);
        return r.json() as Promise<COTSnapshot>;
      }),
    ])
      .then(([riskData, sectorData, cotData]) => {
        setRisk(riskData);
        setSectors(sectorData);
        setCot(cotData);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-24 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-red-600 dark:text-red-400">
          Money flow data unavailable: {error}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Risk Appetite ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Risk Appetite</CardTitle>
            <span className="text-[11px] text-zinc-400">
              {risk ? relativeTime(risk.asOf) : "—"}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            {risk && regimeBadge(risk.regime)}
            <span className="text-2xl font-bold tabular-nums text-zinc-800 dark:text-zinc-100">
              {risk?.score ?? "—"}
            </span>
            <span className="text-xs text-zinc-400">/ 100</span>
          </div>
          <div className="relative h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${risk?.score ?? 0}%`,
                backgroundColor: risk
                  ? risk.score >= 65
                    ? "#059669"
                    : risk.score <= 35
                      ? "#dc2626"
                      : "#eab308"
                  : undefined,
              }}
            />
          </div>
          <Separator />
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
              Signals
            </p>
            {risk && (
              <>
                <SignalRow label="HY OAS" signal={risk.creditSpread} />
                <SignalRow label="IG OAS" signal={risk.investmentGradeSpread} />
                <SignalRow label="10Y-2Y" signal={risk.yieldCurve} />
                <SignalRow label="VIX" signal={risk.vix} />
                <SignalRow label="TED" signal={risk.tedSpread} />
              </>
            )}
          </div>
          <Separator />
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
              Context
            </p>
            {risk?.context && (
              <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-500">10Y</span>
                  <span className="tabular-nums text-zinc-700 dark:text-zinc-300">
                    {risk.context.treasury10Y?.toFixed(2) ?? "—"}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">2Y</span>
                  <span className="tabular-nums text-zinc-700 dark:text-zinc-300">
                    {risk.context.treasury2Y?.toFixed(2) ?? "—"}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">USD</span>
                  <span className="tabular-nums text-zinc-700 dark:text-zinc-300">
                    {risk.context.dollarIndex?.toFixed(1) ?? "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">WTI</span>
                  <span className="tabular-nums text-zinc-700 dark:text-zinc-300">
                    ${risk.context.wtiCrude?.toFixed(0) ?? "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">S&P 500</span>
                  <span className="tabular-nums text-zinc-700 dark:text-zinc-300">
                    {risk.context.sp500?.toFixed(0) ?? "—"}
                  </span>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Sector Rotation ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Sector Rotation</CardTitle>
            <span className="text-[11px] text-zinc-400">
              {sectors ? relativeTime(sectors.asOf) : "—"}
            </span>
          </div>
          {/* Column headers */}
          <div className="flex items-center gap-3 pt-1 text-[11px] font-medium text-zinc-400">
            <span className="w-5 text-right">#</span>
            <span className="w-12">Sym</span>
            <span className="flex-1">Name</span>
            <span className="flex shrink-0 gap-2">
              <span className="w-14 text-right">Score</span>
              <span className="w-14 text-right">20d</span>
              <span className="w-14 text-right">60d</span>
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-0">
          {sectors && sectors.sectors.length > 0 ? (
            <DividedList>
              {sectors.sectors.map((s) => (
                <SectorRow key={s.symbol} s={s} />
              ))}
            </DividedList>
          ) : (
            <p className="py-6 text-center text-sm text-zinc-400">
              No sector data available.
            </p>
          )}
          {sectors && (
            <div className="mt-2 flex items-center gap-3 text-[11px] text-zinc-400">
              <span className="flex items-center gap-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" /> Above 50MA
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500" /> Above 200MA
              </span>
              <span>
                Benchmark 20d: {sectors.benchmark.return20d > 0 ? "+" : ""}
                {sectors.benchmark.return20d}%
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── COT Positioning ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Institutional Positioning (COT)</CardTitle>
            <span className="text-[11px] text-zinc-400">
              {cot ? relativeTime(cot.fetchedAt) : "—"}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {cot && cot.contracts.length > 0 ? (
            <>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                Speculator Net Position
              </p>
              {cot.contracts.map((c) => (
                <COTRow key={c.contractCode} label={`${c.ticker} · ${c.name}`} net={c.speculatorNet} />
              ))}
              <Separator className="my-2" />
              <p className="text-[10px] text-zinc-400">
                Report: {cot.contracts[0]?.reportDate ?? "—"} · Non-Commercial (Managed Money)
              </p>
            </>
          ) : (
            <p className="py-4 text-center text-sm text-zinc-400">
              COT data unavailable.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
