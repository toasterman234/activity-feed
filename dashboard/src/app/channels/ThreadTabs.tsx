"use client";

export type ThreadTabId = "overview" | "work" | "artifacts" | "conversation" | "history";

export type ThreadTabsProps = {
  active: ThreadTabId;
  onChange: (tab: ThreadTabId) => void;
  counts?: {
    work?: number;
    artifacts?: number;
    history?: number;
  };
};

export function ThreadTabs({ active, onChange, counts }: ThreadTabsProps) {
  const tabs: Array<{ id: ThreadTabId; label: string; badge?: number }> = [
    { id: "overview", label: "Overview" },
    { id: "work", label: "Plan & activity", badge: counts?.work },
    { id: "artifacts", label: "Artifacts", badge: counts?.artifacts },
    { id: "conversation", label: "Conversation" },
    { id: "history", label: "History", badge: counts?.history },
  ];

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-max gap-1 rounded-lg border border-zinc-200 bg-card p-1 dark:border-zinc-800 dark:bg-zinc-900">
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              <span>{tab.label}</span>
              {!!tab.badge && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                    isActive
                      ? "bg-card/15 text-white dark:bg-zinc-900/10 dark:text-zinc-900"
                      : "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                  }`}
                >
                  {tab.badge}
                </span>
              )}
              {!tab.badge && !isActive && (tab.id === "work" || tab.id === "artifacts" || tab.id === "history") && (
                <span className="block h-1.5 w-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
