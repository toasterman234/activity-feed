// ── MetricCard factory ──
// Every analytics card conforms to this contract. Components render cards
// from MetricCard objects; calculations produce them.

import type {
  MetricCard,
  MetricCardStatus,
  DataQuality,
  MetricCardContributor,
} from "./types";

export type {
  MetricCard,
  MetricCardStatus,
  DataQuality,
  MetricCardContributor,
};

export function formatCurrency(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      notation: "compact",
      compactDisplay: "short",
    }).format(n);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatPercent(n: number | null | undefined, decimals = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${(n * 100).toFixed(decimals)}%`;
}

export function formatNumber(n: number | null | undefined, decimals = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(decimals);
}

export function changeAmount(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null) return null;
  return current - previous;
}

export function changePercent(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

export function statusFromValue(
  value: number | null,
  thresholds: { watch?: number; warning?: number; critical?: number; positiveIsGood?: boolean } = {},
): MetricCardStatus {
  if (value == null) return "unavailable";
  const { watch = 0, warning = 0, critical = 0, positiveIsGood = true } = thresholds;
  const abs = Math.abs(value);
  if (abs >= Math.abs(critical)) return "critical";
  if (abs >= Math.abs(warning)) return "warning";
  if (abs >= Math.abs(watch)) return "watch";
  // for positive-is-good metrics (income, theta): positive = good
  if (positiveIsGood) return value > 0 ? "positive" : "neutral";
  return value < 0 ? "positive" : "neutral";
}

export function dataQualityFromGreeks(
  positionsWithoutGreeks: string[],
  totalPositions: number,
  asOf: string | null,
): DataQuality {
  if (!asOf) return "unavailable";
  const ageMinutes = (Date.now() - new Date(asOf).getTime()) / 60_000;
  if (ageMinutes > 30) return "stale";
  if (positionsWithoutGreeks.length === 0) return "complete";
  if (positionsWithoutGreeks.length >= totalPositions) return "unavailable";
  return "partial";
}

export interface CardBuilderInput {
  id: string;
  title: string;
  value: number | null;
  unit?: string;
  description: string;
  asOf: string;
  status?: MetricCardStatus;
  dataQuality?: DataQuality;
  methodology: string;
  comparisonValue?: number | null;
  trendData?: Array<{ label: string; value: number }> | null;
  contributors?: MetricCardContributor[];
  drilldownRoute?: string | null;
  thresholds?: { watch?: number; warning?: number; critical?: number; positiveIsGood?: boolean };
}

export function buildCard(input: CardBuilderInput): MetricCard {
  const status = input.status ?? statusFromValue(input.value, input.thresholds);
  const prev = input.comparisonValue ?? null;
  return {
    id: input.id,
    title: input.title,
    value: input.value,
    formattedValue: formatCurrency(input.value),
    unit: input.unit ?? "USD",
    description: input.description,
    asOf: input.asOf,
    status,
    dataQuality: input.dataQuality ?? "complete",
    methodology: input.methodology,
    comparisonValue: prev,
    changeAmount: changeAmount(input.value, prev),
    changePercent: changePercent(input.value, prev),
    trendData: input.trendData ?? null,
    contributors: input.contributors ?? [],
    drilldownRoute: input.drilldownRoute ?? null,
  };
}

export function buildContributor(
  label: string,
  value: number,
  total: number,
): MetricCardContributor {
  return {
    label,
    value,
    formattedValue: formatCurrency(value),
    pct: total !== 0 ? value / total : null,
  };
}
