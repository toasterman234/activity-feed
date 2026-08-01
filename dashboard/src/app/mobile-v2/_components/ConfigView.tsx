"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, RefreshCcw, Settings2 } from "lucide-react";
import { ModelsPanel } from "@/app/models/ModelsPanel";
import WorkflowsPage from "@/app/workflows/WorkflowsPage";
import PerfPage from "@/app/settings/perf/PerfPage";
import EnableNotifications from "@/app/settings/notifications/EnableNotifications";
import NotificationSettings from "@/app/settings/notifications/NotificationSettings";
import NotificationInbox from "@/app/settings/notifications/NotificationInbox";

const TABS = [
  {
    key: "Models",
    description: "Keys, providers, and runtime model access.",
    productionHref: "/ops/config?tab=models",
  },
  {
    key: "Workflows",
    description: "Reusable stage flows and lifecycle setup.",
    productionHref: "/ops/config?tab=workflows",
  },
  {
    key: "Notifications",
    description: "Push devices, inbox, and delivery preferences.",
    productionHref: "/ops/config?tab=notifications",
  },
  {
    key: "Perf",
    description: "Vitals, measures, and slow-route inspection.",
    productionHref: "/ops/config?tab=perf",
  },
] as const;

type ConfigTab = (typeof TABS)[number]["key"];

function TabButton({
  tab,
  active,
  onClick,
}: {
  tab: (typeof TABS)[number];
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={active
        ? "rounded-full border border-[#111318] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#111318]"
        : "rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-[11px] font-medium text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]"
      }
    >
      {tab.key}
    </button>
  );
}

export default function ConfigView() {
  const [tab, setTab] = useState<ConfigTab>("Models");
  const [visited, setVisited] = useState<Set<ConfigTab>>(() => new Set(["Models"]));

  const activeTab = TABS.find((item) => item.key === tab) ?? TABS[0];

  const selectTab = (next: ConfigTab) => {
    setTab(next);
    setVisited((current) => new Set(current).add(next));
  };

  return (
    <div className="v2-config-black space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-[var(--muted-foreground)]">Config</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--foreground)]">Control panels</h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--muted-foreground)]">
            Mobile-v2 home for models, workflows, notifications, and performance.
          </p>
        </div>
        <Link
          href={activeTab.productionHref}
          className="v2-pill inline-flex items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)]"
        >
          <ExternalLink className="size-4 text-[var(--primary)]" />
          Open production tab
        </Link>
      </div>

      <div className="v2-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
              <Settings2 className="size-3.5 text-[var(--primary)]" />
              Ops config
            </div>
            <p className="text-sm text-[var(--muted-foreground)]">{activeTab.description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {TABS.map((item) => (
              <TabButton key={item.key} tab={item} active={item.key === tab} onClick={() => selectTab(item.key)} />
            ))}
          </div>
        </div>
      </div>

      {visited.has("Models") && (
        <section className={tab === "Models" ? "block" : "hidden"}>
          <div className="v2-surface p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-[var(--foreground)]">Models</h3>
                <p className="text-sm text-[var(--muted-foreground)]">Check provider status, rotate keys, and inspect subscriptions.</p>
              </div>
              <RefreshCcw className="size-4 text-[var(--muted-foreground)]" />
            </div>
            <ModelsPanel embedded />
          </div>
        </section>
      )}

      {visited.has("Workflows") && (
        <section className={tab === "Workflows" ? "block" : "hidden"}>
          <div className="v2-surface overflow-hidden">
            <WorkflowsPage />
          </div>
        </section>
      )}

      {visited.has("Notifications") && (
        <section className={tab === "Notifications" ? "block" : "hidden"}>
          <div className="grid gap-4 xl:grid-cols-[0.95fr,1.05fr]">
            <div className="space-y-4">
              <div className="v2-surface p-4">
                <NotificationInbox />
              </div>
              <div className="v2-surface p-4">
                <EnableNotifications />
              </div>
            </div>
            <div className="v2-surface p-4">
              <NotificationSettings />
            </div>
          </div>
        </section>
      )}

      {visited.has("Perf") && (
        <section className={tab === "Perf" ? "block" : "hidden"}>
          <div className="v2-surface p-4">
            <PerfPage />
          </div>
        </section>
      )}
    </div>
  );
}
