"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Home" },
  { href: "/activity", label: "Activity" },
  { href: "/channels", label: "Channels" },
  { href: "/fleet", label: "Fleet" },
  { href: "/finance", label: "Finance" },
  { href: "/settings", label: "Settings" },
] as const;

export default function BottomNav() {
  const pathname = usePathname() || "/";

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-10 border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-5xl h-12 items-center">
        {TABS.map((tab) => {
          const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              prefetch={false}
              className={`flex-1 py-2 text-center text-[11px] sm:text-xs ${
                active
                  ? "font-semibold text-zinc-900 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
