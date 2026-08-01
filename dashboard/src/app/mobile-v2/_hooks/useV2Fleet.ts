"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FleetActionId, FleetSnapshot } from "@/lib/fleet";

export function useV2Fleet() {
  const [snapshot, setSnapshot] = useState<FleetSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [macHealth, setMacHealth] = useState<string>("…");
  const [poolCmd, setPoolCmd] = useState("");
  const [poolStatus, setPoolStatus] = useState<"idle" | "submitting" | "running" | "done" | "error">("idle");
  const [poolMessage, setPoolMessage] = useState("");
  const [poolOutput, setPoolOutput] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [containerState, setContainerState] = useState<Record<string, string>>({});
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const [snapRes, healthRes] = await Promise.all([
        fetch("/api/fleet", { cache: "no-store" }),
        fetch("/api/fleet/health", { cache: "no-store" }).catch(() => null),
      ]);
      const data = (await snapRes.json()) as FleetSnapshot;
      if (!snapRes.ok || !data.ok) throw new Error(data?.error || `HTTP ${snapRes.status}`);
      setSnapshot(data);
      setLastUpdated(new Date(data.generatedAt));
      setError(null);
      if (healthRes) {
        const hd = (await healthRes.json()) as { status?: string };
        setMacHealth(hd.status || "unknown");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
    intervalRef.current = setInterval(load, 15_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [load]);

  const runAction = useCallback(async (hostId: string, action: string, label: string) => {
    const key = `${hostId}:${action}`;
    setActionLoading((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await fetch("/api/fleet/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hostId, action }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      if (data.kind === "url" && data.value) {
        window.open(data.value, "_blank", "noopener,noreferrer");
      } else if (data.kind === "command" && data.value) {
        await navigator.clipboard?.writeText(data.value).catch(() => {});
      } else if (data.kind === "snapshot") {
        setSnapshot(data.snapshot as FleetSnapshot);
        setLastUpdated(new Date());
      }
    } finally {
      setActionLoading((prev) => ({ ...prev, [key]: false }));
    }
  }, []);

  const runPoolCommand = useCallback(async () => {
    if (!poolCmd.trim()) return;
    const cmd = poolCmd.trim();
    setPoolStatus("submitting");
    setPoolMessage("");
    setPoolOutput(null);
    try {
      const res = await fetch("/api/fleet/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hostId: "ovh", action: "pool-command", command: cmd }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "failed");
      setPoolMessage(data.message);
      setPoolStatus("running");
      if (data.dag && data.runId) {
        const poll = setInterval(async () => {
          try {
            const outRes = await fetch(`/api/fleet/run-output?dag=${data.dag}&runId=${data.runId}`, { cache: "no-store" });
            const out = await outRes.json();
            if (!out.ok) return;
            if (out.stdout) setPoolOutput(out.stdout);
            if (out.status === "succeeded" || out.status === "failed") {
              setPoolStatus(out.status === "succeeded" ? "done" : "error");
              setPoolMessage(out.status === "succeeded" ? "Done" : "Failed");
              clearInterval(poll);
            }
          } catch { /* keep polling */ }
        }, 3000);
        setTimeout(() => clearInterval(poll), 60_000);
      } else {
        setPoolStatus("done");
      }
    } catch (e) {
      setPoolStatus("error");
      setPoolMessage(e instanceof Error ? e.message : String(e));
    }
  }, [poolCmd]);

  const runContainerAction = useCallback(async (hostId: string, name: string, action: FleetActionId) => {
    setContainerState((prev) => ({ ...prev, [name]: action }));
    try {
      const res = await fetch("/api/fleet/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hostId, action, name }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setContainerState((prev) => ({ ...prev, [name]: `ok-${action}` }));
      if (action === "remove-container") {
        setSnapshot((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            hosts: prev.hosts.map((host) =>
              host.id === hostId
                ? { ...host, containers: (host.containers || []).filter((container) => container.name !== name) }
                : host,
            ),
          };
        });
      } else {
        void load();
      }
    } catch (e) {
      setContainerState((prev) => ({ ...prev, [name]: `err-${e instanceof Error ? e.message : String(e)}` }));
    }
  }, [load]);

  return {
    snapshot,
    error,
    lastUpdated,
    macHealth,
    poolCmd,
    setPoolCmd,
    poolStatus,
    poolMessage,
    poolOutput,
    actionLoading,
    containerState,
    load,
    runAction,
    runPoolCommand,
    runContainerAction,
  };
}
