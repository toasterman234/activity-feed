"use client";

import { useState } from "react";
import PortfolioContent from "../finance/portfolio-content";
import WatchlistContent from "../finance/watchlist-content";
import PersonalContent from "../finance/personal-content";
import ScreenerContent from "../finance/screener-content";
import MoneyFlowContent from "../finance/money-flow-content";
import AnalyticsContent from "../finance/analytics-content";
import AnalyticsHedges from "../finance/analytics-hedges";

const TABS = ["Portfolio", "Flow", "Personal", "Watchlist", "Screener", "Analytics", "Hedges"] as const;
type Tab = (typeof TABS)[number];

const TAB_COMPONENTS: Record<Tab, React.ComponentType> = {
  Portfolio: PortfolioContent,
  Flow: MoneyFlowContent,
  Personal: PersonalContent,
  Watchlist: WatchlistContent,
  Screener: ScreenerContent,
  Analytics: AnalyticsContent,
  Hedges: AnalyticsHedges,
};

export default function PersonalPage() {
  const [tab, setTab] = useState<Tab>("Portfolio");
  const [visited, setVisited] = useState<Set<Tab>>(new Set(["Portfolio"]));
  const Component = TAB_COMPONENTS[tab];

  const select = (t: Tab) => {
    setTab(t);
    setVisited((prev) => new Set(prev).add(t));
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-3">
      <div className="sticky top-0 z-10 -mx-3 border-b border-border bg-card/90 px-3 py-2 backdrop-blur pt-[env(safe-area-inset-top,0px)]">
        <div className="mb-1 flex items-baseline justify-between gap-2 px-1">
          <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Personal</h1>
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Money and markets</p>
        </div>
        <div className="flex items-center overflow-x-auto text-sm">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => select(t)}
              className={`shrink-0 px-3 py-1.5 font-medium ${
                tab === t
                  ? "text-zinc-900 dark:text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              }`}
            >
              {t}
              {tab === t && (
                <span className="mx-auto mt-1 block h-0.5 rounded-full bg-zinc-900 dark:bg-zinc-100" />
              )}
            </button>
          ))}
        </div>
      </div>

      {visited.has(tab) ? (
        <Component key={tab} />
      ) : (
        <div className="flex min-h-[50vh] items-center justify-center text-sm text-zinc-400">
          Loading…
        </div>
      )}
    </div>
  );
}
