// ── Option Greeks hook ──
// Fetches Market Lake option chains for symbols with open option positions,
// matches contracts by strike + type, returns a Greek snapshot map.

import { useEffect, useRef, useState } from "react";
import type { NormalizedTrade, OptionGreekSnapshot } from "@/lib/portfolio-analytics";
import { getOptionChain } from "@/lib/market-lake";
import { toGreekSnapshot } from "@/lib/portfolio-analytics";

interface UseOptionGreeksOptions {
  trades: NormalizedTrade[];
}

interface UseOptionGreeksResult {
  greekMap: Map<string, OptionGreekSnapshot>;
  loading: boolean;
  errors: string[];
}

/**
 * Extracts open option positions from trades, fetches live Greeks
 * from Market Lake, and returns a map keyed by contract symbol.
 *
 * Stable: only re-fetches when the set of open option contracts actually
 * changes (content comparison), not on every render from Electric live sync.
 */
export function useOptionGreeks({ trades }: UseOptionGreeksOptions): UseOptionGreeksResult {
  const [greekMap, setGreekMap] = useState<Map<string, OptionGreekSnapshot>>(new Map());
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const inflightRef = useRef<AbortController | null>(null);

  // Compute open positions and stable key
  const optionPositions = computeOpenOptions(trades);
  const key = serializeOptions(optionPositions);

  const keyRef = useRef<string>("");
  const doneRef = useRef(false);

  useEffect(() => {
    // Skip if the contract set hasn't changed
    if (keyRef.current === key) {
      // If we already finished a fetch for this key, don't touch loading
      return;
    }

    // New key — abort any in-flight fetch and start fresh
    keyRef.current = key;

    if (inflightRef.current) {
      inflightRef.current.abort();
      inflightRef.current = null;
    }

    // No options? Done immediately.
    if (optionPositions.length === 0) {
      setGreekMap(new Map());
      setLoading(false);
      setErrors([]);
      doneRef.current = true;
      return;
    }

    doneRef.current = false;
    setLoading(true);

    const controller = new AbortController();
    inflightRef.current = controller;

    fetchGreeks(optionPositions, { signal: controller.signal })
      .then(({ map, errors: newErrors }) => {
        if (!controller.signal.aborted) {
          setGreekMap(map);
          setErrors(newErrors);
          setLoading(false);
          doneRef.current = true;
          if (inflightRef.current === controller) {
            inflightRef.current = null;
          }
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
          doneRef.current = true;
          if (inflightRef.current === controller) {
            inflightRef.current = null;
          }
        }
      });

    return () => {
      controller.abort();
      if (inflightRef.current === controller) {
        inflightRef.current = null;
      }
    };
  }, [key, optionPositions]);

  return { greekMap, loading, errors };
}

// ── Fetch logic (extracted, not a hook) ──

interface NetOption {
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  optionType: "call" | "put";
  strike: number;
  expiry: string;
}

async function fetchGreeks(
  options: NetOption[],
  opts: { signal: AbortSignal },
): Promise<{ map: Map<string, OptionGreekSnapshot>; errors: string[] }> {
  const map = new Map<string, OptionGreekSnapshot>();
  const errors: string[] = [];

  // Group by underlying symbol
  const byUnderlying = new Map<string, NetOption[]>();
  for (const opt of options) {
    const underlying = extractUnderlying(opt.symbol);
    if (!underlying) continue;
    const list = byUnderlying.get(underlying);
    if (!list) byUnderlying.set(underlying, [opt]);
    else list.push(opt);
  }

  // Fetch chains in parallel per underlying
  const promises = [...byUnderlying.entries()].map(
    async ([underlying, optsList]) => {
      if (opts.signal.aborted) return;
      try {
        const expirations = [...new Set(optsList.map((o) => o.expiry).filter(Boolean))];
        const chains = await Promise.all(
          expirations.map(async (exp) => {
            if (opts.signal.aborted) return null;
            try {
              return await getOptionChain(underlying, exp);
            } catch {
              errors.push(`${underlying} ${exp}: chain fetch failed`);
              return null;
            }
          }),
        );

        for (const opt of optsList) {
          if (opts.signal.aborted) return;
          if (opt.strike == null || !opt.expiry) continue;
          const chain = chains.find((c) => c?.expiration === opt.expiry);
          if (!chain) continue;

          const sideRows = opt.optionType === "put" ? chain.puts : chain.calls;
          const match = sideRows.find(
            (row) => row.strike != null && Math.abs(row.strike - opt.strike) < 0.01,
          );

          if (match) {
            map.set(
              opt.symbol,
              toGreekSnapshot(opt.symbol, opt.optionType as "call" | "put", {
                strike: match.strike,
                expiration: opt.expiry,
                delta: match.delta,
                gamma: match.gamma,
                theta: match.theta,
                vega: match.vega,
                rho: match.rho,
                implied_volatility: match.implied_volatility,
                bid: match.bid,
                ask: match.ask,
                mid: match.mid,
                volume: match.volume,
                open_interest: match.open_interest,
                timestamp: match.timestamp,
              }),
            );
          }
        }
      } catch {
        errors.push(`${underlying}: option chain fetch failed`);
      }
    },
  );

  await Promise.all(promises);
  return { map, errors };
}

function computeOpenOptions(trades: NormalizedTrade[]): NetOption[] {
  const byContract = new Map<string, NetOption>();

  for (const t of trades) {
    if (!t.isOption || !t.optionType || !t.optionStrike || !t.optionExpiry) continue;
    const k = `${t.symbol}|${t.optionType}|${t.optionStrike}|${t.optionExpiry}`;
    const existing = byContract.get(k);
    if (!existing) {
      byContract.set(k, {
        symbol: t.symbol,
        side: t.side,
        quantity: t.quantity,
        optionType: t.optionType as "call" | "put",
        strike: t.optionStrike,
        expiry: t.optionExpiry,
      });
    } else {
      if (t.side === "sell") {
        existing.quantity -= t.quantity;
      } else {
        existing.quantity += t.quantity;
      }
    }
  }

  return [...byContract.values()].filter((o) => o.quantity !== 0);
}

function serializeOptions(options: NetOption[]): string {
  return options
    .map((o) => `${o.symbol}|${o.optionType}|${o.strike}|${o.expiry}|${o.quantity}`)
    .sort()
    .join(",");
}

function extractUnderlying(symbol: string): string | null {
  const match = symbol.match(/^([A-Z]+)\d{6}/);
  if (match) return match[1];
  const match2 = symbol.match(/^([A-Z]{1,5})/);
  return match2 ? match2[1] : null;
}
