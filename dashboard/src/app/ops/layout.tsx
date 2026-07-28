"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const OPS_TABS = [
  { href: "/ops/fleet", label: "Fleet" },
  { href: "/ops/activity", label: "Activity" },
  { href: "/ops/runs", label: "Runs" },
  { href: "/ops/config", label: "Config" },
] as const;

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/ops";

  return (
    <div className="mx-auto max-w-5xl">
      <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 px-3 py-2 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90 pt-[env(safe-area-inset-top,0px)]">
        <div className="mb-1.5 flex items-baseline justify-between gap-2 px-1">
          <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Ops</h1>
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Fleet, activity, runs, config</p>
        </div>
        <div className="flex gap-1 rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-900">
          {OPS_TABS.map((t) => {
            const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
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
      </div>
      {children}
    </div>
  );
}
