"use client";

import { useEffect, useState, useCallback } from "react";

const TABS = ["Status", "Swap", "Subscriptions", "History"] as const;
type Tab = (typeof TABS)[number];
type SwapTarget = "proxy" | "pi" | "all";

interface StatusData {
  proxy: { running: boolean; keySuffix: string; error?: string };
  pi: { keySuffix: string };
  iii?: { keySuffix: string; error?: string };
  models: string[];
  lastSwap: string | null;
}

export function ModelsPanel({ embedded = false }: { embedded?: boolean }) {
  const [tab, setTab] = useState<Tab>("Status");
  const [status, setStatus] = useState<StatusData | null>(null);
  const [statusErr, setStatusErr] = useState<string | null>(null);
  const [swapTarget, setSwapTarget] = useState<SwapTarget>("all");
  const [swapKey, setSwapKey] = useState("");
  const [swapping, setSwapping] = useState(false);
  const [swapResult, setSwapResult] = useState<{ ok: boolean; suffix?: string; error?: string } | null>(null);
  const [swapLog, setSwapLog] = useState<{ time: string; target: string; suffix: string }[]>([]);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch("/api/models/status");
      if (r.ok) {
        const d = await r.json();
        setStatus(d);
        setStatusErr(null);
      } else {
        setStatusErr("Status check failed");
      }
    } catch (e) {
      setStatusErr(String(e));
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const iv = setInterval(fetchStatus, 30_000);
    return () => clearInterval(iv);
  }, [fetchStatus]);

  const doSwap = async () => {
    if (!swapKey.trim()) return;
    setSwapping(true);
    setSwapResult(null);
    try {
      const r = await fetch("/api/models/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: swapKey.trim(), target: swapTarget }),
      });
      const d = await r.json();
      setSwapResult(d);
      if (d.ok) {
        setSwapLog((p) => [
          { time: new Date().toLocaleString(), target: swapTarget, suffix: d.suffix },
          ...p.slice(0, 9),
        ]);
        setSwapKey("");
        fetchStatus();
      }
    } catch (e) {
      setSwapResult({ ok: false, error: String(e) });
    } finally {
      setSwapping(false);
    }
  };

  const controls = (
    <>
      <div className={`grid w-full gap-1 ${embedded ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-4"}`}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`min-w-0 rounded-md px-1 py-1.5 text-[11px] font-medium transition-colors ${
              tab === t
                ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            }`}
          >
            <span className="block truncate">{t}</span>
          </button>
        ))}
      </div>
      <button
        onClick={fetchStatus}
        className={embedded
          ? "self-end rounded-md border border-zinc-200 px-2 py-1 text-[10px] text-zinc-500 hover:text-zinc-700 dark:border-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
          : "absolute right-3 top-2.5 text-[10px] text-zinc-400 hover:text-zinc-600"}
      >
        Refresh
      </button>
    </>
  );

  const body = (
    <>
      {tab === "Status" && <StatusTab status={status} statusErr={statusErr} />}
      {tab === "Swap" && (
        <SwapTab
          swapTarget={swapTarget}
          setSwapTarget={setSwapTarget}
          swapKey={swapKey}
          setSwapKey={setSwapKey}
          doSwap={doSwap}
          swapping={swapping}
          swapResult={swapResult}
        />
      )}
      {tab === "Subscriptions" && <SubscriptionsTab />}
      {tab === "History" && <HistoryTab swapLog={swapLog} lastSwap={status?.lastSwap ?? null} />}
    </>
  );

  if (embedded) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-zinc-200 bg-card p-2 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="space-y-2">{controls}</div>
        </div>
        <div className="space-y-3">{body}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 pb-16 dark:bg-zinc-950">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-card/95 pt-[env(safe-area-inset-top,0px)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        <div className="mx-auto max-w-5xl px-3 pt-2">
          <div className="flex w-full">{controls}</div>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-3 py-3">{body}</div>
    </div>
  );
}

function StatusTab({
  status,
  statusErr,
}: {
  status: StatusData | null;
  statusErr: string | null;
}) {
  if (statusErr) {
    return <p className="py-12 text-center text-sm text-red-400">{statusErr}</p>;
  }
  if (!status) {
    return <p className="py-12 text-center text-sm text-zinc-400">Connecting…</p>;
  }

  const modelGroups: Record<string, string[]> = {};
  for (const m of status.models) {
    const provider = m.includes("/") ? m.split("/")[0] : "other";
    (modelGroups[provider] ??= []).push(m);
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-zinc-200 bg-card p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2 w-2 rounded-full ${status.proxy.running ? "bg-green-500" : "bg-red-400"}`} />
            <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">CC Proxy</span>
          </div>
          <span className="text-[10px] text-zinc-400">{status.proxy.running ? "Running" : status.proxy.error || "Down"}</span>
        </div>
        {status.proxy.keySuffix && (
          <p className="mt-1.5 text-xs font-mono text-zinc-500 dark:text-zinc-400">{status.proxy.keySuffix}</p>
        )}
      </div>

      <div className="rounded-lg border border-zinc-200 bg-card p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Pi Agent</span>
        </div>
        {status.pi.keySuffix ? (
          <p className="mt-1.5 text-xs font-mono text-zinc-500 dark:text-zinc-400">{status.pi.keySuffix}</p>
        ) : (
          <p className="mt-1.5 text-xs text-zinc-400">No key configured</p>
        )}
      </div>

      <div className="rounded-lg border border-zinc-200 bg-card p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">iii Harness</span>
          {status.iii?.error && (
            <span className="text-[10px] text-zinc-400">{status.iii.error}</span>
          )}
        </div>
        {status.iii?.keySuffix ? (
          <p className="mt-1.5 text-xs font-mono text-zinc-500 dark:text-zinc-400">{status.iii.keySuffix}</p>
        ) : (
          <p className="mt-1.5 text-xs text-zinc-400">No key configured</p>
        )}
      </div>

      <div className="rounded-lg border border-zinc-200 bg-card p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="mb-2 text-xs font-semibold text-zinc-800 dark:text-zinc-200">Available Models ({status.models.length})</p>
        {Object.entries(modelGroups)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([provider, models]) => (
            <div key={provider} className="mb-2 last:mb-0">
              <p className="mb-1 text-[10px] uppercase tracking-wider text-zinc-400">{provider}</p>
              <div className="flex flex-wrap gap-1">
                {models.map((m) => (
                  <span key={m} className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {provider === "other" ? m : m.split("/").slice(1).join("/")}
                  </span>
                ))}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

function SwapTab({
  swapTarget,
  setSwapTarget,
  swapKey,
  setSwapKey,
  doSwap,
  swapping,
  swapResult,
}: {
  swapTarget: SwapTarget;
  setSwapTarget: (t: SwapTarget) => void;
  swapKey: string;
  setSwapKey: (k: string) => void;
  doSwap: () => void;
  swapping: boolean;
  swapResult: { ok: boolean; suffix?: string; error?: string } | null;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-[10px] uppercase tracking-wider text-zinc-400">Target</label>
        <p className="mb-1.5 text-[10px] text-zinc-400">
          Pi / All also push the key to the Mac Mini over SSH so Paseo picks it up.
        </p>
        <div className="flex overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
          {(["proxy", "pi", "all"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setSwapTarget(t)}
              className={`flex-1 py-1.5 text-xs font-medium transition-colors ${swapTarget === t ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900" : "bg-white text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400"}`}
            >
              {t === "proxy" ? "CC Proxy" : t === "pi" ? "Pi Agent" : "All"}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-[10px] uppercase tracking-wider text-zinc-400">New API Key</label>
        <input
          type="text"
          value={swapKey}
          onChange={(e) => setSwapKey(e.target.value)}
          placeholder="user_…"
          autoComplete="off"
          className="w-full rounded-lg border border-zinc-200 bg-card px-3 py-2 text-sm font-mono text-zinc-800 placeholder:text-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
        />
      </div>

      <button
        onClick={doSwap}
        disabled={!swapKey.trim() || swapping}
        className={`w-full rounded-lg py-2 text-sm font-medium transition-colors ${!swapKey.trim() || swapping ? "cursor-not-allowed bg-zinc-200 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600" : "bg-zinc-800 text-white hover:bg-zinc-700 active:bg-zinc-900 dark:bg-zinc-200 dark:text-zinc-900 dark:hover:bg-zinc-300"}`}
      >
        {swapping ? "Swapping…" : "Swap Key"}
      </button>

      {swapResult && (
        <div className={`rounded-lg border p-3 text-sm ${swapResult.ok ? "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300" : "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"}`}>
          {swapResult.ok
            ? `Swapped ${swapTarget === "proxy" ? "CC Proxy (this host)" : swapTarget === "pi" ? "Pi fleet (OVH + Mac)" : "All machines (pi + CLI + iii + proxy)"} → ${swapResult.suffix}`
            : swapResult.error}
        </div>
      )}
    </div>
  );
}

interface LimitEntry {
  label: string;
  window?: string | null;
  used?: number | null;
  limit?: number | null;
  remaining?: number | null;
  used_frac: number;
  remaining_frac: number;
  unit?: string | null;
  status: string;
  resets_at?: string | null;
  duration_hours?: number | null;
}

interface Account {
  provider: string;
  provider_label: string;
  account_id: string;
  email?: string | null;
  plan?: string | null;
  source: string;
  limits: LimitEntry[];
  reset_credits: number;
}

interface SubData {
  reachable: boolean;
  errors: string[];
  accounts: Account[];
  generated_at?: string | null;
}

function SubscriptionsTab() {
  const [sub, setSub] = useState<SubData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const fetchSubs = useCallback(async () => {
    try {
      const r = await fetch("/api/models/subscriptions");
      if (r.ok) {
        setSub(await r.json());
        setErr(null);
      } else {
        const body = await r.text().catch(() => "");
        setErr(`Subscriptions fetch failed (${r.status})${body ? `: ${body.slice(0, 200)}` : ""}`);
      }
    } catch (e) {
      setErr(String(e));
    }
  }, []);

  useEffect(() => {
    fetchSubs();
    const iv = setInterval(fetchSubs, 300_000);
    return () => clearInterval(iv);
  }, [fetchSubs]);

  if (err) return <p className="py-12 text-center text-sm text-red-400">{err}</p>;
  if (!sub) return <p className="py-12 text-center text-sm text-zinc-400">Loading subscriptions…</p>;

  const accounts = sub.accounts || [];
  if (!accounts.length) {
    return <div className="space-y-2"><p className="py-12 text-center text-sm text-zinc-400">No subscription data</p></div>;
  }

  const statusColor = (s: string) => ({ ok: "bg-green-500", warning: "bg-amber-500", exhausted: "bg-red-500", unknown: "bg-zinc-400" })[s] || "bg-zinc-400";

  const fmtResets = (iso: string | null | undefined) => {
    if (!iso) return "";
    try {
      const dt = new Date(iso);
      const now = new Date();
      const secs = (dt.getTime() - now.getTime()) / 1000;
      if (secs <= 0) return "resets any moment";
      const mins = Math.floor(secs / 60);
      if (mins < 60) return `resets in ${mins}m`;
      const hours = Math.floor(mins / 60);
      const remMins = mins % 60;
      if (hours < 24) return remMins ? `resets in ${hours}h ${remMins}m` : `resets in ${hours}h`;
      const days = Math.floor(hours / 24);
      const remHrs = hours % 24;
      if (days < 14) return remHrs ? `resets in ${days}d ${remHrs}h` : `resets in ${days}d`;
      return `resets ${dt.toLocaleDateString()}`;
    } catch {
      return "";
    }
  };

  const fmtAmount = (lim: LimitEntry) => {
    const used = lim.used;
    const limit = lim.limit;
    const unit = lim.unit || "";
    if (used != null && limit != null) {
      const u = typeof used === "number" ? (Number.isInteger(used) ? used : used.toFixed(1)) : used;
      const l = typeof limit === "number" ? (Number.isInteger(limit) ? limit : limit.toFixed(1)) : limit;
      if (unit && unit !== "percent" && unit !== "unknown") return `${u}/${l} ${unit}`;
      return `${u}/${l}`;
    }
    return `${Math.round(lim.used_frac * 100)}%`;
  };

  return (
    <div className="space-y-3">
      {accounts.map((acct, i) => {
        const head = acct.provider_label || acct.provider;
        const subtitle = [acct.email, acct.plan && acct.plan !== "usage-only" && acct.plan !== head ? acct.plan : null]
          .filter(Boolean)
          .join(" · ");

        return (
          <div key={`${acct.provider}-${acct.account_id}-${i}`} className="rounded-lg border border-zinc-200 bg-card p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-2 flex items-baseline justify-between">
              <div>
                <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{head}</span>
                {subtitle && <span className="ml-2 text-[10px] text-zinc-400">{subtitle}</span>}
              </div>
              {acct.reset_credits > 0 && (
                <span className="text-[10px] text-zinc-400">{acct.reset_credits} reset credit{acct.reset_credits > 1 ? "s" : ""}</span>
              )}
            </div>
            {acct.limits.map((lim, j) => {
              const pct = Math.min(Math.round(lim.used_frac * 100), 100);
              const color = statusColor(lim.status);
              const resets = fmtResets(lim.resets_at);
              return (
                <div key={j} className="mb-1.5 last:mb-0">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-zinc-500 dark:text-zinc-400">{lim.label}</span>
                    <span className="text-zinc-400">{fmtAmount(lim)}</span>
                  </div>
                  <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                    <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                  {resets && <p className="mt-0.5 text-[10px] text-zinc-400">{resets}</p>}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function HistoryTab({
  swapLog,
  lastSwap,
}: {
  swapLog: { time: string; target: string; suffix: string }[];
  lastSwap: string | null;
}) {
  if (swapLog.length === 0) {
    return (
      <div className="space-y-2">
        {lastSwap && <p className="text-xs text-zinc-400">Last backup: {lastSwap}</p>}
        <p className="py-12 text-center text-sm text-zinc-400">No swaps in this session</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="mb-2 text-[10px] uppercase tracking-wider text-zinc-400">This Session</p>
      {swapLog.map((entry, i) => (
        <div key={i} className="flex items-center justify-between rounded-lg border border-zinc-200 bg-card px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
          <div>
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              {entry.target === "proxy" ? "CC Proxy" : entry.target === "pi" ? "Pi Agent" : entry.target === "all" ? "All" : entry.target}
            </span>
            <span className="ml-2 text-xs font-mono text-zinc-400">{entry.suffix}</span>
          </div>
          <span className="text-[10px] text-zinc-400">{entry.time}</span>
        </div>
      ))}
    </div>
  );
}
