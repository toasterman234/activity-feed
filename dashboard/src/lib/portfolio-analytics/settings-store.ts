// ── Portfolio policy settings store ──
// Persists user-configured OpportunityConfig to localStorage.
// Read by the opportunity engine; editable via the policy drawer.

"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { OpportunityConfig } from "./opportunity-types";
import { DEFAULT_OPPORTUNITY_CONFIG } from "./opportunity-types";

const STORAGE_KEY = "portfolio-policy-v1";

function load(): OpportunityConfig {
  if (typeof window === "undefined") return DEFAULT_OPPORTUNITY_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_OPPORTUNITY_CONFIG;
    const parsed = JSON.parse(raw);
    // Merge with defaults so new fields don't break
    return { ...DEFAULT_OPPORTUNITY_CONFIG, ...parsed };
  } catch {
    return DEFAULT_OPPORTUNITY_CONFIG;
  }
}

function save(config: OpportunityConfig): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // localStorage full — silently ignore
  }
}

// ── External store for React ──

let currentConfig = DEFAULT_OPPORTUNITY_CONFIG;
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function getSnapshot(): OpportunityConfig {
  return currentConfig;
}

// Hydrate from localStorage on first access
let hydrated = false;
function ensureHydrated(): void {
  if (hydrated) return;
  currentConfig = load();
  hydrated = true;
}

export function usePortfolioPolicy(): {
  config: OpportunityConfig;
  update: (patch: Partial<OpportunityConfig>) => void;
  reset: () => void;
} {
  ensureHydrated();

  const config = useSyncExternalStore(
    subscribe,
    () => {
      ensureHydrated();
      return currentConfig;
    },
    // Server snapshot — always return defaults during SSR
    () => DEFAULT_OPPORTUNITY_CONFIG,
  );

  const update = useCallback((patch: Partial<OpportunityConfig>) => {
    currentConfig = { ...currentConfig, ...patch };
    save(currentConfig);
    listeners.forEach((l) => l());
  }, []);

  const reset = useCallback(() => {
    currentConfig = { ...DEFAULT_OPPORTUNITY_CONFIG };
    save(currentConfig);
    listeners.forEach((l) => l());
  }, []);

  return { config, update, reset };
}

// Non-hook version for use in non-React contexts
export function getPortfolioPolicy(): OpportunityConfig {
  ensureHydrated();
  return currentConfig;
}
