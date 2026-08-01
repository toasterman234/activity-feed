"use client";

import { useState } from "react";
import { ExternalLink, RefreshCcw, Landmark } from "lucide-react";
import Link from "next/link";

import PortfolioContent from "@/app/finance/portfolio-content";
import MoneyFlowContent from "@/app/finance/money-flow-content";
import PersonalContent from "@/app/finance/personal-content";
import WatchlistContent from "@/app/finance/watchlist-content";

const TABS = [
  { key: "Portfolio", description: "Live positions grouped by account" },
  { key: "Flow", description: "Risk appetite, sector rotation, institutional positioning" },
  { key: "Personal", description: "Banking balances, transactions, net worth" },
  { key: "Watchlist", description: "Live quotes with symbol search" },
] as const;

type FinanceTab = (typeof TABS)[number]["key"];

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
      className={
        active
          ? "rounded-full border border-[#111318] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#111318]"
          : "rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-[11px] font-medium text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]"
      }
    >
      {tab.key}
    </button>
  );
}

export default function FinanceView() {
  const [tab, setTab] = useState<FinanceTab>("Portfolio");
  const [visited, setVisited] = useState<Set<FinanceTab>>(() => new Set(["Portfolio"]));

  const activeTab = TABS.find((item) => item.key === tab) ?? TABS[0];

  const selectTab = (next: FinanceTab) => {
    setTab(next);
    setVisited((current) => new Set(current).add(next));
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-[var(--muted-foreground)]">
            Finance
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--foreground)]">
            Money &amp; markets
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--muted-foreground)]">
            Portfolio, risk flow, banking, and live quotes.
          </p>
        </div>
        <Link
          href="/personal"
          className="v2-pill inline-flex items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)]"
        >
          <ExternalLink className="size-4 text-[var(--primary)]" />
          Open production tab
        </Link>
      </div>

      {/* Tab bar */}
      <div className="v2-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
              <Landmark className="size-3.5 text-[var(--primary)]" />
              Finance
            </div>
            <p className="text-sm text-[var(--muted-foreground)]">{activeTab.description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {TABS.map((item) => (
              <TabButton
                key={item.key}
                tab={item}
                active={item.key === tab}
                onClick={() => selectTab(item.key)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Tab content */}
      {visited.has("Portfolio") && (
        <section className={tab === "Portfolio" ? "block" : "hidden"}>
          <div className="v2-surface p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-[var(--foreground)]">Portfolio</h3>
                <p className="text-sm text-[var(--muted-foreground)]">
                  Positions across Schwab, Fidelity, and on-chain accounts.
                </p>
              </div>
              <RefreshCcw className="size-4 text-[var(--muted-foreground)]" />
            </div>
            <PortfolioContent />
          </div>
        </section>
      )}

      {visited.has("Flow") && (
        <section className={tab === "Flow" ? "block" : "hidden"}>
          <div className="v2-surface p-4">
            <div className="mb-3">
              <h3 className="text-base font-semibold text-[var(--foreground)]">Money Flow</h3>
              <p className="text-sm text-[var(--muted-foreground)]">
                Risk appetite regime, sector rotation model, and COT institutional positioning.
              </p>
            </div>
            <MoneyFlowContent />
          </div>
        </section>
      )}

      {visited.has("Personal") && (
        <section className={tab === "Personal" ? "block" : "hidden"}>
          <div className="v2-surface p-4">
            <div className="mb-3">
              <h3 className="text-base font-semibold text-[var(--foreground)]">Personal</h3>
              <p className="text-sm text-[var(--muted-foreground)]">
                Bank account balances, credit cards, transaction history, and net worth.
              </p>
            </div>
            <PersonalContent />
          </div>
        </section>
      )}

      {visited.has("Watchlist") && (
        <section className={tab === "Watchlist" ? "block" : "hidden"}>
          <div className="v2-surface p-4">
            <div className="mb-3">
              <h3 className="text-base font-semibold text-[var(--foreground)]">Watchlist</h3>
              <p className="text-sm text-[var(--muted-foreground)]">
                Live quotes with symbol search, collections, and option chain drill-in.
              </p>
            </div>
            <WatchlistContent />
          </div>
        </section>
      )}
    </div>
  );
}
