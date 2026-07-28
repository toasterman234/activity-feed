"use client";

import { useState } from "react";
import BankingContent from "./banking-content";
import NetWorthContent from "./net-worth-content";

const SUBTABS = ["Banking", "Net Worth"] as const;
type Subtab = (typeof SUBTABS)[number];

export default function PersonalContent() {
  const [subtab, setSubtab] = useState<Subtab>("Banking");

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1 border-b border-zinc-100 dark:border-zinc-800">
        {SUBTABS.map((t) => (
          <button
            key={t}
            onClick={() => setSubtab(t)}
            className={`px-2.5 py-1 text-xs font-medium ${
              subtab === t
                ? "border-b-2 border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                : "border-b-2 border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {subtab === "Banking" ? <BankingContent /> : <NetWorthContent />}
    </div>
  );
}
