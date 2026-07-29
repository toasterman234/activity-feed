"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ModelsPanel } from "@/app/models/ModelsPanel";
import WorkflowsPage from "@/app/workflows/WorkflowsPage";
import PerfPage from "@/app/settings/perf/PerfPage";
import EnableNotifications from "@/app/settings/notifications/EnableNotifications";

const CONFIG_TABS = ["Models", "Workflows", "Notifications", "Perf"] as const;
type ConfigTab = (typeof CONFIG_TABS)[number];

function parseTab(raw: string | null): ConfigTab {
  const v = (raw || "").toLowerCase();
  if (v === "workflows" || v === "workflow") return "Workflows";
  if (v === "perf" || v === "performance") return "Perf";
  if (v === "notifications" || v === "notifs" || v === "notification") return "Notifications";
  return "Models";
}

function OpsConfigInner() {
  const searchParams = useSearchParams();
  const initial = useMemo(() => parseTab(searchParams.get("tab")), [searchParams]);
  const [tab, setTab] = useState<ConfigTab>(initial);
  const [visited, setVisited] = useState<Set<ConfigTab>>(() => new Set([initial]));

  const select = (t: ConfigTab) => {
    setTab(t);
    setVisited((prev) => new Set(prev).add(t));
  };

  return (
    <div className="px-3 pb-4 pt-3 space-y-3">
      <div className="flex gap-1 rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-900">
        {CONFIG_TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => select(t)}
            className={`flex-1 rounded-md px-0.5 py-1.5 text-center text-[11px] font-medium transition-colors ${
              tab === t
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {visited.has("Models") && (
        <div className={tab === "Models" ? "block" : "hidden"}>
          <ModelsPanel embedded />
        </div>
      )}
      {visited.has("Workflows") && (
        <div className={tab === "Workflows" ? "block" : "hidden"}>
          <WorkflowsPage />
        </div>
      )}
      {visited.has("Perf") && (
        <div className={tab === "Perf" ? "block" : "hidden"}>
          <PerfPage />
        </div>
      )}
      {visited.has("Notifications") && (
        <div className={tab === "Notifications" ? "block" : "hidden"}>
          <EnableNotifications />
        </div>
      )}
    </div>
  );
}

export default function OpsConfigPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-zinc-400">Loading config…</div>}>
      <OpsConfigInner />
    </Suspense>
  );
}
