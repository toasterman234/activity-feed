"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Secondary tabs under Settings. Add new entries here as sections grow —
// Performance stays first. Each href is its own route so deep links work.
const SETTINGS_TABS = [
  { href: "/settings/perf", label: "Performance" },
  { href: "/models", label: "Models" },
  { href: "/workflows", label: "Workflows" },
] as const;

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto max-w-5xl px-4 pt-4">
      <header className="mb-3">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Settings</h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Ops and diagnostics for this dashboard</p>
      </header>

      <div className="mb-3 flex gap-1 rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-900">
        {SETTINGS_TABS.map((t) => {
          const active = pathname === t.href || pathname?.startsWith(`${t.href}/`);
          return (
            <Link
              key={t.href}
              href={t.href}
              prefetch={false}
              className={`flex-1 min-w-0 rounded-md px-0.5 py-1.5 text-center text-[11px] font-medium transition-colors ${
                active
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
